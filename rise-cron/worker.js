#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════╗
// ║       RISE WHATSAPP — Cron Worker v1.0               ║
// ║  Roda na VPS 24h e processa agendamentos automáticos ║
// ╚══════════════════════════════════════════════════════╝

const https = require('https');
const http  = require('http');

// ── CONFIGURAÇÃO ──────────────────────────────────────
const CONFIG = {
  // URL do seu app na Vercel
  VERCEL_URL: 'https://riseapp-henna.vercel.app',

  // Intervalo de verificação em ms (60s)
  CHECK_INTERVAL: 60 * 1000,

  // Log detalhado
  VERBOSE: true,
};

// ── UTILITÁRIOS ────────────────────────────────────────
function log(msg, type='INFO') {
  const ts = new Date().toLocaleString('pt-BR');
  console.log(`[${ts}] [${type}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function tsNow() {
  return new Date().toLocaleString('pt-BR');
}

function uid() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// ── HTTP REQUEST ───────────────────────────────────────
function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── CARREGAR DADOS DO NEON (via Vercel API) ────────────
async function loadDados(userKey) {
  try {
    const res = await request(`${CONFIG.VERCEL_URL}/api/dados`, {
      method: 'GET',
      headers: { 'x-user-key': userKey }
    });
    if (res.status !== 200) return null;
    return res.body;
  } catch(e) {
    log(`Erro ao carregar dados (${userKey}): ${e.message}`, 'ERR');
    return null;
  }
}

// ── SALVAR DADOS NO NEON (via Vercel API) ──────────────
async function saveDados(userKey, dados) {
  try {
    const res = await request(`${CONFIG.VERCEL_URL}/api/dados`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-key': userKey
      }
    }, dados);
    return res.status === 200;
  } catch(e) {
    log(`Erro ao salvar dados (${userKey}): ${e.message}`, 'ERR');
    return false;
  }
}

// ── CARREGAR CONFIGURAÇÕES DOS USUÁRIOS ────────────────
async function loadUserConfigs() {
  // Busca config do banco — cada usuário tem sua instância
  // Os users são: gustavoc, giuliab, larissap
  const USERS = ['gustavoc', 'giuliab', 'larissap'];
  const configs = {};

  for (const userKey of USERS) {
    const dados = await loadDados(userKey);
    if (dados?.config?.userInstances) {
      configs[userKey] = dados.config.userInstances[userKey] || dados.config;
    }
  }

  // Fallback: ler do arquivo de config local se existir
  try {
    const localCfg = require('./config.json');
    return localCfg;
  } catch(e) {}

  return configs;
}

// ── ENVIAR MENSAGEM VIA EVOLUTION API ─────────────────
async function sendMessage(apiUrl, apiKey, instance, phone, text) {
  try {
    const url = `${apiUrl}/message/sendText/${instance}`;
    const res = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      }
    }, {
      number: phone,
      textMessage: { text }
    });

    const ok = res.status >= 200 && res.status < 300;
    let erroMotivo = '';
    if (!ok) {
      const b = res.body;
      erroMotivo = b?.message || b?.error || b?.response?.message || `HTTP ${res.status}`;
      if (erroMotivo.toLowerCase().includes('not in whatsapp') ||
          erroMotivo.toLowerCase().includes('does not exist') ||
          res.status === 400) {
        erroMotivo = 'Não é WhatsApp';
      }
    }
    return { ok, erroMotivo };
  } catch(e) {
    return { ok: false, erroMotivo: e.message };
  }
}

// ── SUBSTITUIR VARIÁVEIS NA MENSAGEM ──────────────────
function buildMsg(tpl, contact) {
  return (tpl || '')
    .replace(/\{nome\}/g, contact.nome || '')
    .replace(/\{empresa\}/g, contact.empresa || '')
    .replace(/\{tel\}/g, contact.tel || '')
    .replace(/\{cidade\}/g, contact.cidade || '');
}

// ── PROCESSAR AGENDAMENTO ─────────────────────────────
async function processAgendamento(ag, dados, userKey, apiCfg) {
  log(`Iniciando agendamento: "${ag.nome}" (user: ${userKey})`, 'FIRE');

  const { contacts, listas, agendamentos, logs: logsArr, savedmsg } = dados;

  // Montar lista de contatos a enviar
  let list = [];
  if (ag.target === 'lista' && ag.listaId) {
    const lista = listas.find(l => String(l.id) === String(ag.listaId));
    if (lista) {
      list = contacts.filter(c => lista.contatos.includes(c.id));
    }
  } else {
    list = contacts.filter(c => c.status !== 'enviado');
  }

  // Respeitar limite de quantidade
  if (ag.maxQty && ag.maxQty > 0) {
    list = list.slice(0, ag.maxQty);
  }

  log(`Enviando para ${list.length} contato(s)`, 'FIRE');

  const msgTemplate = ag.msg || savedmsg || '';
  if (!msgTemplate.trim()) {
    log(`Agendamento "${ag.nome}" sem mensagem configurada — pulando`, 'WARN');
    ag.status = 'cancelled';
    return;
  }

  const minInterval = (ag.minInterval || 10) * 1000;
  const maxInterval = (ag.maxInterval || 25) * 1000;
  let enviados = 0, falhas = 0;

  // Inicializar histórico do agendamento
  if (!ag.historico) ag.historico = [];

  for (const contact of list) {
    const text = buildMsg(msgTemplate, contact);
    const ts = tsNow();

    const { ok, erroMotivo } = await sendMessage(
      apiCfg.url, apiCfg.key, apiCfg.inst,
      contact.tel, text
    );

    // Atualizar status do contato
    const ct = contacts.find(x => x.id === contact.id);
    if (ct) ct.status = ok ? 'enviado' : 'falha';

    // Log de envio
    const logEntry = {
      id: uid(), time: ts,
      nome: contact.nome, empresa: contact.empresa,
      tel: contact.tel, status: ok ? 'enviado' : 'falha',
      msg: text.slice(0, 60),
      enviadoPor: `[Auto] ${userKey}`,
      erro: erroMotivo || '',
      agId: ag.id
    };
    logsArr.unshift(logEntry);
    ag.historico.push(logEntry);

    if (ok) { enviados++; }
    else { falhas++; }

    if (CONFIG.VERBOSE) {
      log(`  ${ok ? '✓' : '✗'} ${contact.nome || contact.tel}${erroMotivo ? ' — ' + erroMotivo : ''}`, ok ? 'OK' : 'FAIL');
    }

    // Intervalo aleatório entre envios
    if (contact !== list[list.length - 1]) {
      const delay = minInterval + Math.random() * (maxInterval - minInterval);
      await sleep(delay);
    }
  }

  // Marcar agendamento como concluído
  ag.status = 'done';
  ag.completedAt = Date.now();
  log(`Agendamento "${ag.nome}" concluído: ${enviados} enviados, ${falhas} falhas`, 'DONE');
}

// ── LOOP PRINCIPAL ─────────────────────────────────────
async function checkAndFire() {
  const now = Date.now();
  log('Verificando agendamentos...', 'CHECK');

  // Carregar config da API do arquivo local
  let apiCfg = null;
  try {
    apiCfg = require('./config.json');
  } catch(e) {
    log('config.json não encontrado — usando variáveis de ambiente', 'WARN');
    apiCfg = {
      url:  process.env.API_URL  || '',
      key:  process.env.API_KEY  || '',
      inst: process.env.API_INST || '',
    };
  }

  if (!apiCfg.url || !apiCfg.key) {
    log('API não configurada! Crie o config.json', 'ERR');
    return;
  }

  // Verificar cada usuário
  const USERS = ['gustavoc', 'giuliab', 'larissap'];

  for (const userKey of USERS) {
    const dados = await loadDados(userKey);
    if (!dados) continue;

    const { agendamentos } = dados;
    if (!agendamentos || !agendamentos.length) continue;

    // Verificar instância do usuário (se configurada individualmente)
    const userInstKey = `inst_${userKey}`;
    const userInst = apiCfg[userInstKey] || apiCfg.inst;
    const userApiCfg = { ...apiCfg, inst: userInst };

    // Encontrar agendamentos prontos para disparar
    const prontos = agendamentos.filter(ag =>
      ag.status === 'pending' && ag.ts <= now
    );

    if (prontos.length === 0) continue;

    log(`Usuário ${userKey}: ${prontos.length} agendamento(s) para disparar`, 'INFO');

    for (const ag of prontos) {
      ag.status = 'firing';
      try {
        await processAgendamento(ag, dados, userKey, userApiCfg);
      } catch(e) {
        log(`Erro no agendamento "${ag.nome}": ${e.message}`, 'ERR');
        ag.status = 'error';
      }
      // Salvar após cada agendamento
      await saveDados(userKey, dados);
    }
  }
}

// ── INICIAR ────────────────────────────────────────────
async function main() {
  log('╔════════════════════════════════════════╗');
  log('║  Rise WhatsApp Cron Worker iniciado!   ║');
  log('╚════════════════════════════════════════╝');
  log(`Verificando a cada ${CONFIG.CHECK_INTERVAL/1000}s`);
  log(`Vercel URL: ${CONFIG.VERCEL_URL}`);

  // Verificar imediatamente ao iniciar
  await checkAndFire();

  // Depois a cada intervalo
  setInterval(checkAndFire, CONFIG.CHECK_INTERVAL);
}

main().catch(e => {
  log('Erro fatal: ' + e.message, 'ERR');
  process.exit(1);
});

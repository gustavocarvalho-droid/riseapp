const { Pool } = require('pg');

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function ensureTable(client) {
  // Criar tabela com todas as colunas necessárias
  await client.query(`
    CREATE TABLE IF NOT EXISTS rise_dados (
      id SERIAL PRIMARY KEY,
      user_key TEXT NOT NULL UNIQUE,
      contacts JSONB DEFAULT '[]',
      listas JSONB DEFAULT '[]',
      logs JSONB DEFAULT '[]',
      crm JSONB DEFAULT '[]',
      fila JSONB DEFAULT '[]',
      agendamentos JSONB DEFAULT '[]',
      savedmsg TEXT DEFAULT '',
      config JSONB DEFAULT '{}',
      chat_logs JSONB DEFAULT '{}',
      crm_custom_cols JSONB DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Adicionar colunas novas se a tabela já existia sem elas
  const cols = ['chat_logs JSONB DEFAULT \'{}\'', 'crm_custom_cols JSONB DEFAULT \'[]\''];
  for (const col of cols) {
    const colName = col.split(' ')[0];
    await client.query(`
      ALTER TABLE rise_dados ADD COLUMN IF NOT EXISTS ${col}
    `).catch(() => {}); // ignorar se já existe
  }
}

// Mescla dois arrays JSONB sem duplicatas por campo 'id'
function mergeLogs(existing, incoming) {
  if (!incoming || !incoming.length) return existing || [];
  if (!existing || !existing.length) return incoming;
  const map = {};
  [...existing, ...incoming].forEach(l => { if (l && l.id) map[l.id] = l; });
  return Object.values(map).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const userKey = (req.headers['x-user-key'] || 'default').slice(0, 64);
  const db = getPool();
  const client = await db.connect();

  try {
    await ensureTable(client);

    // ── GET ──
    if (req.method === 'GET') {
      const result = await client.query(
        'SELECT * FROM rise_dados WHERE user_key = $1',
        [userKey]
      );
      if (result.rows.length === 0) {
        return res.status(200).json({
          contacts: [], listas: [], logs: [], crm: [],
          fila: [], agendamentos: [], savedmsg: '', config: {},
          chatLogs: {}, crmCustomCols: []
        });
      }
      const d = result.rows[0];
      return res.status(200).json({
        contacts: d.contacts || [],
        listas: d.listas || [],
        logs: d.logs || [],
        crm: d.crm || [],
        fila: d.fila || [],
        agendamentos: d.agendamentos || [],
        savedmsg: d.savedmsg || '',
        config: d.config || {},
        chatLogs: d.chat_logs || {},
        crmCustomCols: d.crm_custom_cols || []
      });
    }

    // ── POST ──
    if (req.method === 'POST') {
      const body = req.body || {};

      // Buscar dados existentes do banco para fazer merge de logs
      const existing = await client.query(
        'SELECT logs FROM rise_dados WHERE user_key = $1',
        [userKey]
      );
      const existingLogs = existing.rows[0]?.logs || [];

      // MERGE de logs: nunca perder logs já salvos
      // Se o frontend mandou logs, mesclar com os existentes no banco
      const incomingLogs = body.logs;
      let finalLogs;
      if (incomingLogs && incomingLogs.length > 0) {
        finalLogs = mergeLogs(existingLogs, incomingLogs);
      } else if (incomingLogs === undefined || incomingLogs === null) {
        // Frontend não mandou logs — manter os existentes
        finalLogs = existingLogs;
      } else {
        // Frontend mandou [] explicitamente — só aceitar se foi limpeza intencional
        // Para segurança, manter os existentes se tiver mais
        finalLogs = existingLogs.length > 0 ? existingLogs : [];
      }

      await client.query(`
        INSERT INTO rise_dados (
          user_key, contacts, listas, logs, crm, fila,
          agendamentos, savedmsg, config, chat_logs, crm_custom_cols, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT (user_key) DO UPDATE SET
          contacts = CASE WHEN $2::jsonb != '[]'::jsonb THEN $2 ELSE rise_dados.contacts END,
          listas = CASE WHEN $3::jsonb != '[]'::jsonb THEN $3 ELSE rise_dados.listas END,
          logs = $4,
          crm = CASE WHEN $5::jsonb != '[]'::jsonb THEN $5 ELSE rise_dados.crm END,
          fila = $6,
          agendamentos = $7,
          savedmsg = CASE WHEN $8 != '' THEN $8 ELSE rise_dados.savedmsg END,
          config = CASE WHEN $9::jsonb != '{}'::jsonb THEN $9 ELSE rise_dados.config END,
          chat_logs = CASE WHEN $10::jsonb != '{}'::jsonb THEN $10 ELSE rise_dados.chat_logs END,
          crm_custom_cols = $11,
          updated_at = NOW()
      `, [
        userKey,
        JSON.stringify(body.contacts || []),
        JSON.stringify(body.listas || []),
        JSON.stringify(finalLogs),
        JSON.stringify(body.crm || []),
        JSON.stringify(body.fila || []),
        JSON.stringify(body.agendamentos || []),
        body.savedmsg || '',
        JSON.stringify(body.config || {}),
        JSON.stringify(body.chatLogs || {}),
        JSON.stringify(body.crmCustomCols || [])
      ]);

      return res.status(200).json({ ok: true, logs_saved: finalLogs.length });
    }

    // ── DELETE ──
    if (req.method === 'DELETE') {
      await client.query('DELETE FROM rise_dados WHERE user_key = $1', [userKey]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

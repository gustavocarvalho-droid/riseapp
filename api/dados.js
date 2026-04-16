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
      extra JSONB DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Adicionar colunas se ainda não existem (upgrade de tabela antiga)
  for (const col of [
    "chat_logs JSONB DEFAULT '{}'",
    "crm_custom_cols JSONB DEFAULT '[]'",
    "extra JSONB DEFAULT '{}'"
  ]) {
    await client.query(
      `ALTER TABLE rise_dados ADD COLUMN IF NOT EXISTS ${col}`
    ).catch(() => {});
  }
}

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
        'SELECT * FROM rise_dados WHERE user_key = $1', [userKey]
      );
      if (result.rows.length === 0) {
        return res.status(200).json({
          contacts: [], listas: [], logs: [], crm: [],
          fila: [], agendamentos: [], savedmsg: '', config: {},
          chatLogs: {}, crmCustomCols: [], extra: {}
        });
      }
      const d = result.rows[0];
      const extra = d.extra || {};
      return res.status(200).json({
        contacts:     d.contacts       || [],
        listas:       d.listas         || [],
        logs:         d.logs           || [],
        crm:          d.crm            || [],
        fila:         d.fila           || [],
        agendamentos: d.agendamentos   || [],
        savedmsg:     d.savedmsg       || '',
        config:       d.config         || {},
        chatLogs:     d.chat_logs      || {},
        crmCustomCols:d.crm_custom_cols|| [],
        // campos extras (users, etc)
        ...extra
      });
    }

    // ── POST ──
    if (req.method === 'POST') {
      const body = req.body || {};

      // Merge de logs — nunca perder registros
      const existing = await client.query(
        'SELECT logs, extra FROM rise_dados WHERE user_key = $1', [userKey]
      );
      const existingLogs = existing.rows[0]?.logs || [];
      const existingExtra = existing.rows[0]?.extra || {};

      const incomingLogs = body.logs;
      let finalLogs;
      if (incomingLogs && incomingLogs.length > 0) {
        finalLogs = mergeLogs(existingLogs, incomingLogs);
      } else if (incomingLogs === undefined || incomingLogs === null) {
        finalLogs = existingLogs; // manter existentes se não mandou
      } else {
        // [] explícito = limpeza intencional
        finalLogs = [];
      }

      // Campos extras: users, etc — mesclar com existentes
      const extraFields = {};
      const knownFields = new Set(['contacts','listas','logs','crm','fila','agendamentos','savedmsg','config','chatLogs','crmCustomCols']);
      Object.entries(body).forEach(([k, v]) => {
        if (!knownFields.has(k)) extraFields[k] = v;
      });
      const finalExtra = { ...existingExtra, ...extraFields };

      await client.query(`
        INSERT INTO rise_dados (
          user_key, contacts, listas, logs, crm, fila,
          agendamentos, savedmsg, config, chat_logs, crm_custom_cols, extra, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (user_key) DO UPDATE SET
          contacts      = CASE WHEN $2::jsonb != '[]'::jsonb  THEN $2  ELSE rise_dados.contacts END,
          listas        = CASE WHEN $3::jsonb != '[]'::jsonb  THEN $3  ELSE rise_dados.listas END,
          logs          = $4,
          crm           = CASE WHEN $5::jsonb != '[]'::jsonb  THEN $5  ELSE rise_dados.crm END,
          fila          = $6,
          agendamentos  = $7,
          savedmsg      = CASE WHEN $8 != ''                  THEN $8  ELSE rise_dados.savedmsg END,
          config        = CASE WHEN $9::jsonb != '{}'::jsonb  THEN $9  ELSE rise_dados.config END,
          chat_logs     = CASE WHEN $10::jsonb != '{}'::jsonb THEN $10 ELSE rise_dados.chat_logs END,
          crm_custom_cols = $11,
          extra         = $12,
          updated_at    = NOW()
      `, [
        userKey,
        JSON.stringify(body.contacts      || []),
        JSON.stringify(body.listas        || []),
        JSON.stringify(finalLogs),
        JSON.stringify(body.crm           || []),
        JSON.stringify(body.fila          || []),
        JSON.stringify(body.agendamentos  || []),
        body.savedmsg || '',
        JSON.stringify(body.config        || {}),
        JSON.stringify(body.chatLogs      || {}),
        JSON.stringify(body.crmCustomCols || []),
        JSON.stringify(finalExtra)
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

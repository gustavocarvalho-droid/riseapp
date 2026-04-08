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
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
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

    if (req.method === 'GET') {
      const result = await client.query(
        'SELECT * FROM rise_dados WHERE user_key = $1',
        [userKey]
      );
      if (result.rows.length === 0) {
        return res.status(200).json({
          contacts: [], listas: [], logs: [], crm: [],
          fila: [], agendamentos: [], savedmsg: '', config: {}
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
        auditlogs: d.auditlogs || []
      });
    }

    if (req.method === 'POST') {
      const { contacts, listas, logs, crm, fila, agendamentos, savedmsg, config, auditlogs } = req.body || {};
      await client.query(`
        INSERT INTO rise_dados (user_key, contacts, listas, logs, crm, fila, agendamentos, savedmsg, config, auditlogs, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (user_key) DO UPDATE SET
          contacts=$2, listas=$3, logs=$4, crm=$5, fila=$6,
          agendamentos=$7, savedmsg=$8, config=$9, auditlogs=$10, updated_at=NOW()
      `, [
        userKey,
        JSON.stringify(contacts || []),
        JSON.stringify(listas || []),
        JSON.stringify(logs || []),
        JSON.stringify(crm || []),
        JSON.stringify(fila || []),
        JSON.stringify(agendamentos || []),
        savedmsg || '',
        JSON.stringify(config || {}),
        JSON.stringify(auditlogs || [])
      ]);
      return res.status(200).json({ ok: true });
    }

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

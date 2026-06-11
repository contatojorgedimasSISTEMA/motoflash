const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS restaurantes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      telefone TEXT,
      endereco TEXT,
      cidade TEXT NOT NULL,
      estado TEXT DEFAULT 'SP',
      lat REAL,
      lng REAL,
      categoria TEXT DEFAULT 'Outros',
      pix TEXT,
      plano_ativo INTEGER DEFAULT 0,
      plano_vencimento TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS motoboys (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      telefone TEXT,
      pix TEXT NOT NULL,
      placa TEXT,
      cnh TEXT,
      cidade TEXT NOT NULL,
      estado TEXT DEFAULT 'SP',
      status TEXT DEFAULT 'livre',
      lat REAL,
      lng REAL,
      corridas_total INTEGER DEFAULT 0,
      ganhos_total REAL DEFAULT 0,
      avaliacao REAL DEFAULT 5.0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS entregas (
      id TEXT PRIMARY KEY,
      restaurante_id TEXT NOT NULL,
      motoboy_id TEXT,
      cliente_nome TEXT NOT NULL,
      cliente_endereco TEXT NOT NULL,
      cliente_lat REAL,
      cliente_lng REAL,
      valor_pedido REAL NOT NULL,
      distancia_km REAL,
      tarifa REAL,
      tarifa_motoboy REAL,
      tarifa_app REAL,
      status TEXT DEFAULT 'disponivel',
      cidade TEXT NOT NULL,
      pix_pago INTEGER DEFAULT 0,
      pix_id TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id TEXT PRIMARY KEY,
      entrega_id TEXT NOT NULL,
      motoboy_id TEXT NOT NULL,
      valor REAL NOT NULL,
      tipo TEXT DEFAULT 'pix',
      status TEXT DEFAULT 'pendente',
      mp_payment_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("Banco de dados iniciado com sucesso");
}

// Helper para simular interface do SQLite (prepare/run/get/all)
const db = {
  query,
  prepare: (text) => ({
    run: async (...params) => {
      // Converter ? para $1, $2...
      let i = 0;
      const pgText = text.replace(/\?/g, () => `$${++i}`);
      return await query(pgText, params);
    },
    get: async (...params) => {
      let i = 0;
      const pgText = text.replace(/\?/g, () => `$${++i}`);
      const res = await query(pgText, params);
      return res.rows[0] || null;
    },
    all: async (...params) => {
      let i = 0;
      const pgText = text.replace(/\?/g, () => `$${++i}`);
      const res = await query(pgText, params);
      return res.rows;
    },
  }),
  exec: async (sql) => {
    const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      try { await query(stmt); } catch(e) { /* ignore table already exists */ }
    }
  },
  initDB,
};

module.exports = db;

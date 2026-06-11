const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "motoflash.db"));

db.exec(`
  PRAGMA journal_mode=WAL;

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
    created_at TEXT DEFAULT (datetime('now'))
  );

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
    created_at TEXT DEFAULT (datetime('now'))
  );

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(restaurante_id) REFERENCES restaurantes(id),
    FOREIGN KEY(motoboy_id) REFERENCES motoboys(id)
  );

  CREATE TABLE IF NOT EXISTS pagamentos (
    id TEXT PRIMARY KEY,
    entrega_id TEXT NOT NULL,
    motoboy_id TEXT NOT NULL,
    valor REAL NOT NULL,
    tipo TEXT DEFAULT 'pix',
    status TEXT DEFAULT 'pendente',
    mp_payment_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(entrega_id) REFERENCES entregas(id),
    FOREIGN KEY(motoboy_id) REFERENCES motoboys(id)
  );

  CREATE TABLE IF NOT EXISTS admin (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;

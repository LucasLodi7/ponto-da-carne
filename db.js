const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// Em produção, defina DB_PATH apontando para uma pasta com disco persistente
// (ex: um Volume na Railway). Sem isso, o banco fica junto do código e pode
// ser apagado a cada novo deploy.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  whatsapp TEXT NOT NULL,
  instagram TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery_fee REAL NOT NULL DEFAULT 0,
  free_threshold REAL NOT NULL DEFAULT 0,
  hours_week TEXT NOT NULL,
  hours_sat TEXT NOT NULL,
  hours_sun TEXT NOT NULL,
  admin_password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  unit TEXT NOT NULL,
  desc TEXT,
  icon TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sold_out INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
`);

// Migration: add sold_out column to databases created before this feature existed
const productCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productCols.includes('sold_out')) {
  db.exec('ALTER TABLE products ADD COLUMN sold_out INTEGER NOT NULL DEFAULT 0');
}

// Seed settings if empty
const settingsRow = db.prepare('SELECT * FROM settings WHERE id = 1').get();
if (!settingsRow) {
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || 'acougue123';
  const hash = bcrypt.hashSync(initialPassword, 12);
  db.prepare(`
    INSERT INTO settings (id, whatsapp, instagram, address, delivery_fee, free_threshold, hours_week, hours_sat, hours_sun, admin_password_hash)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    '5514991520272',
    'pontoda.carnee',
    'Rua Alexandre Chaia, 260, Marília - SP, 17521-182',
    8,
    120,
    '9h às 19h',
    '9h às 18h',
    '7h às 13h',
    hash
  );
  console.log(`[setup] Senha inicial do admin: "${initialPassword}" (troque assim que entrar pela primeira vez)`);
}

// Seed products if empty
const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, name, category, price, unit, desc, icon, active)
    VALUES (@id, @name, @category, @price, @unit, @desc, @icon, @active)
  `);
  const defaults = [
    {id:'p1',name:'Frango',category:'Assados',price:55.00,unit:'kg',desc:'Frango inteiro, ideal para assar.',icon:'🍗',active:1},
    {id:'p2',name:'Coxa e Sobrecoxa',category:'Assados',price:48.90,unit:'kg',desc:'Corte de frango suculento, ótimo para assar.',icon:'🍗',active:1},
    {id:'p3',name:'Costelão',category:'Assados',price:74.90,unit:'kg',desc:'Corte bovino generoso, perfeito para assar lentamente.',icon:'🍖',active:1},
    {id:'p4',name:'P. Peito',category:'Assados',price:84.90,unit:'kg',desc:'Corte para assar, sabor marcante.',icon:'🥩',active:1},
    {id:'p5',name:'Cupim',category:'Assados',price:98.99,unit:'kg',desc:'Clássico do assado, macio e saboroso.',icon:'🥩',active:1},
    {id:'p6',name:'Fraldinha',category:'Assados',price:98.90,unit:'kg',desc:'Queridinho do assado, sabor marcante.',icon:'🥩',active:1},
    {id:'p7',name:'Maminha',category:'Assados',price:98.90,unit:'kg',desc:'Macia e saborosa, ótima para assar.',icon:'🥩',active:1},
    {id:'p8',name:'Joelho',category:'Assados',price:54.90,unit:'kg',desc:'Corte suíno ideal para assar lentamente.',icon:'🐷',active:1},
    {id:'p9',name:'Pernil',category:'Assados',price:54.90,unit:'kg',desc:'Suculento, perfeito para o assado de fim de semana.',icon:'🐷',active:1}
  ];
  const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(r); });
  insertMany(defaults);
}

module.exports = db;

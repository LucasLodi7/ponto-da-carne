require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[erro fatal] Defina a variável de ambiente JWT_SECRET antes de iniciar o servidor.');
  console.error('Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: false // allow inline styles/scripts used by the single-page frontend
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    // Evita que o navegador guarde versões antigas do site em cache.
    // Isso garante que qualquer atualização apareça na hora pros clientes,
    // sem precisar que eles limpem o cache manualmente.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

/* ---------- Rate limiting on login ---------- */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8, // 8 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

/* ---------- Auth middleware ---------- */
function requireAuth(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
}

/* ================= PUBLIC ROUTES ================= */

app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products').all();
  res.json(rows.map(r => ({ ...r, active: !!r.active, sold_out: !!r.sold_out })));
});

app.get('/api/settings', (req, res) => {
  const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  // never expose the password hash publicly
  const { admin_password_hash, ...publicSettings } = s;
  res.json(publicSettings);
});

/* ================= ADMIN AUTH ================= */

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Informe a senha.' });

  const s = db.prepare('SELECT admin_password_hash FROM settings WHERE id = 1').get();
  const ok = bcrypt.compareSync(password, s.admin_password_hash);
  if (!ok) return res.status(401).json({ error: 'Senha incorreta.' });

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/admin/check', requireAuth, (req, res) => {
  res.json({ ok: true });
});

/* ================= ADMIN: SETTINGS ================= */

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const { whatsapp, instagram, address, delivery_fee, free_threshold, hours_week, hours_sat, hours_sun, new_password } = req.body || {};

  const current = db.prepare('SELECT admin_password_hash FROM settings WHERE id = 1').get();
  let hash = current.admin_password_hash;
  if (new_password && new_password.trim().length > 0) {
    if (new_password.trim().length < 6) {
      return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
    }
    hash = bcrypt.hashSync(new_password.trim(), 12);
  }

  db.prepare(`
    UPDATE settings SET whatsapp=?, instagram=?, address=?, delivery_fee=?, free_threshold=?, hours_week=?, hours_sat=?, hours_sun=?, admin_password_hash=?
    WHERE id = 1
  `).run(
    (whatsapp || '').replace(/\D/g, ''),
    (instagram || '').replace('@', '').trim(),
    address || '',
    Number(delivery_fee) || 0,
    Number(free_threshold) || 0,
    hours_week || '',
    hours_sat || '',
    hours_sun || '',
    hash
  );

  res.json({ ok: true });
});

/* ================= ADMIN: PRODUCTS ================= */

app.post('/api/admin/products', requireAuth, (req, res) => {
  const { name, category, price, unit, desc, icon } = req.body || {};
  if (!name || !category || price === undefined || isNaN(Number(price))) {
    return res.status(400).json({ error: 'Preencha nome, categoria e preço.' });
  }
  const id = 'p' + Date.now();
  db.prepare(`
    INSERT INTO products (id, name, category, price, unit, desc, icon, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, name, category, Number(price), unit || 'un', desc || '', icon || '🥩');
  res.json({ ok: true, id });
});

app.put('/api/admin/products/:id', requireAuth, (req, res) => {
  const { name, category, price, unit, desc, icon, active, sold_out } = req.body || {};
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

  db.prepare(`
    UPDATE products SET name=?, category=?, price=?, unit=?, desc=?, icon=?, active=?, sold_out=?
    WHERE id=?
  `).run(
    name ?? existing.name,
    category ?? existing.category,
    price !== undefined ? Number(price) : existing.price,
    unit ?? existing.unit,
    desc ?? existing.desc,
    icon ?? existing.icon,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    sold_out !== undefined ? (sold_out ? 1 : 0) : existing.sold_out,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Ponto da Carne rodando em http://localhost:${PORT}`);
});

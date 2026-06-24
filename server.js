const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = 'gizli_anahtar_123456789';

const pool = new Pool({
  connectionString: 'postgresql://postgres.yneqhfhfgzultnyajskb:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.connect().then(() => console.log('✅ DB hazir')).catch(e => console.log('❌', e.message));

function auth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token gerekli' });
  try { const d = jwt.verify(token, SECRET); req.userId = d.userId; req.userName = d.userName; next(); }
  catch (e) { res.status(401).json({ error: 'Geçersiz token' }); }
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Tüm alanları doldurun' });
    const c = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (c.rows.length > 0) return res.status(400).json({ error: 'Bu email kullanılıyor' });
    const h = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, email, password) VALUES ($1,$2,$3)', [username, email, h]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    const u = r.rows[0];
    const v = await bcrypt.compare(password, u.password);
    if (!v) return res.status(401).json({ error: 'Şifre yanlış' });
    const token = jwt.sign({ userId: u.id, userName: u.username }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: u.id, username: u.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reminders', auth, async (req, res) => {
  const r = await pool.query('SELECT r.*, u.username as user_name FROM reminders r JOIN users u ON r.user_id=u.id ORDER BY r.date_time');
  res.json(r.rows.map(x => ({ ...x, likes: JSON.parse(x.likes||'[]') })));
});

app.post('/api/reminders', auth, async (req, res) => {
  const { title, description, date_time, emoji, category, priority } = req.body;
  await pool.query('INSERT INTO reminders (title,description,date_time,emoji,category,priority,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [title,description,date_time,emoji,category,priority,req.userId]);
  res.json({ success: true });
});

app.delete('/api/reminders/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM comments WHERE reminder_id=$1', [req.params.id]);
  await pool.query('DELETE FROM reminders WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  res.json({ success: true });
});

app.post('/api/reminders/:id/like', auth, async (req, res) => {
  const r = await pool.query('SELECT likes FROM reminders WHERE id=$1', [req.params.id]);
  if (r.rows.length) {
    let likes = JSON.parse(r.rows[0].likes||'[]');
    const uid = req.userId.toString();
    likes = likes.includes(uid) ? likes.filter(u => u !== uid) : [...likes, uid];
    await pool.query('UPDATE reminders SET likes=$1 WHERE id=$2', [JSON.stringify(likes), req.params.id]);
    res.json({ likes });
  }
});

app.get('/api/reminders/:id/comments', auth, async (req, res) => {
  const r = await pool.query('SELECT c.*, u.username as user_name FROM comments c JOIN users u ON c.user_id=u.id WHERE c.reminder_id=$1 ORDER BY c.created_at DESC', [req.params.id]);
  res.json(r.rows);
});

app.post('/api/reminders/:id/comments', auth, async (req, res) => {
  await pool.query('INSERT INTO comments (reminder_id,user_id,text) VALUES ($1,$2,$3)', [req.params.id, req.userId, req.body.text]);
  res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 OK'));
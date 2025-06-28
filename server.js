require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({
  origin: 'http://localhost:5173', // غير هذا لرابط الواجهة لديك
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 } // 1 يوم
}));

// وسط لحماية الراوترات اللي تحتاج تسجيل دخول
function isAuth(req, res, next) {
  if (req.session.userId) return next();
  return res.status(401).json({ error: 'غير مسموح' });
}

// تسجيل مستخدم جديد (المعيل)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'الرجاء تعبئة الحقول' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    res.json({ message: 'تم التسجيل بنجاح', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'اسم المستخدم موجود مسبقًا' });
    }
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'الرجاء تعبئة الحقول' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'اسم المستخدم غير موجود' });
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'كلمة المرور خاطئة' });
    req.session.userId = user.id;
    res.json({ message: 'تم تسجيل الدخول بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الخروج
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'تم تسجيل الخروج' });
  });
});

// إضافة طلب جديد
app.post('/orders', async (req, res) => {
  const { product_name, customer_name, phone } = req.body;
  if (!product_name || !customer_name || !phone) return res.status(400).json({ error: 'الرجاء تعبئة كل الحقول' });

  try {
    const userId = req.session.userId || null; // يمكن الطلب بدون تسجيل دخول
    const result = await pool.query(
      'INSERT INTO orders (user_id, product_name, customer_name, phone) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, product_name, customer_name, phone]
    );
    res.json({ message: 'تم إضافة الطلب', order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب الطلبات (محمي)
app.get('/orders', isAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث حالة طلب (محمي)
app.put('/orders/:id/status', isAuth, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'الرجاء إرسال الحالة الجديدة' });
  try {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ message: 'تم تحديث الحالة', order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// إعداد اتصال قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:mXAiWasoFVFCFMoxciHDHRZnbyRMtMRU@metro.proxy.rlwy.net:55602/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجود
pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT,
    device TEXT,
    cash_price INTEGER,
    installment_price INTEGER,
    monthly INTEGER,
    order_code TEXT,
    status TEXT DEFAULT 'قيد المراجعة',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating table:', err));

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// استلام طلب جديد
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
    if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
      return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
    }
    const insertQuery = `
      INSERT INTO orders
        (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;
    const values = [name, phone, device, cashPrice, installmentPrice, monthly, code];
    const result = await pool.query(insertQuery, values);
    const order = result.rows[0];

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('Error in /api/order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>تسجيل الدخول - 4 STORE</title>
      <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Almarai', sans-serif; background: linear-gradient(to right, #3b0a77, #845ec2); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; width: 350px; }
        h2 { margin-bottom: 25px; color: #3b0a77; }
        input, button { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; font-size: 15px; }
        input { border: 1px solid #ccc; }
        button { background: #3b0a77; color: white; border: none; }
        button:hover { background: #5a22a1; }
        .error { color: red; margin-bottom: 10px; font-size: 14px; }
      </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<div class="error">بيانات الدخول غير صحيحة</div>' : ''}
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// التحقق من بيانات الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = {
    'admin': { password: 'dev2008', name: 'سامر عبدالله' },
    'mod':   { password: 'mod2001', name: 'عبدالرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    const firstName = users[username].name.split(' ')[0];
    req.session.greeting = username === 'admin'
      ? `مربحاً ${firstName}! 😀`
      : `مرحبا ${firstName}! 👋`;
    return res.redirect('/admin');
  } else {
    return res.redirect('/login?error=1');
  }
});

// تسجيل خروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// حماية المسارات
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// لوحة الإدارة (نفسها بدون تعديل)
app.get('/admin', requireAuth, async (req, res) => {
  // ... (نفس الكود الموجود لديك في صفحة admin بالكامل)
  // يمكنك نسخه من نسختك الأصلية إذا أردت أن أبقيه أقصر هنا.
});

// تحديث حالة الطلب
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لتغيير الحالة' });
  }
  const id = req.params.id;
  const { status } = req.body;
  const validStatuses = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'حالة غير صحيحة' });
  }
  try {
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في تحديث الحالة' });
  }
});

// حذف الطلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لحذف الطلب' });
  }
  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    res.json({ message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في حذف الطلب' });
  }
});

// استعلام عن حالة الطلب
app.post('/api/track', async (req, res) => {
  const { name, phone, code } = req.body;
  if (!name || !phone || !code) {
    return res.status(400).json({ message: 'بيانات ناقصة' });
  }
  try {
    const query = `
      SELECT status, created_at
      FROM orders
      WHERE name = $1 AND phone = $2 AND order_code = $3
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [name, phone, code]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'لم يُعثر على طلب' });
    }
    const { status, created_at } = rows[0];
    return res.json({ status, created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// تشغيل السيرفر
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

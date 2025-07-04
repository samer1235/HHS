const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config(); // تحميل .env

const app = express();
const port = process.env.PORT || 3000;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL غير معرف! أضفه في ملف .env');
}

async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('فشل في إرسال رسالة ديسكورد:', err);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/mydb',
  ssl: { rejectUnauthorized: false }
});

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
`).catch(err => console.error('خطأ في إنشاء الجدول:', err));

// إعدادات السيرفر
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// إرسال طلب جديد
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
    if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
      return res.status(400).json({ message: 'بيانات الطلب ناقصة' });
    }

    const result = await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    const order = result.rows[0];

    await sendDiscordLog(`📦 طلب جديد:
• الاسم: **${name}**
• الجوال: **${phone}**
• الجهاز: **${device}**
• كود الطلب: **${code}**
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('خطأ في /api/order:', err);
    res.status(500).json({ message: 'خطأ داخلي في السيرفر' });
  }
});

// تتبع الطلب
app.post('/api/track', async (req, res) => {
  const { name, phone, code } = req.body;
  if (!name || !phone || !code) {
    return res.status(400).json({ message: 'بيانات ناقصة' });
  }

  try {
    const result = await pool.query(`
      SELECT status, created_at
      FROM orders
      WHERE name = $1 AND phone = $2 AND order_code = $3
      ORDER BY created_at DESC LIMIT 1
    `, [name, phone, code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'لم يتم العثور على الطلب' });
    }

    const { status, created_at } = result.rows[0];
    res.json({ status, created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في التتبع' });
  }
});

// تسجيل دخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = {
    admin: { password: 'dev2008', name: 'سامر عبدالله' },
    mod:   { password: 'mod2001', name: 'عبدالرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    const embedLog = {
      embeds: [{
        title: "🔐 تسجيل دخول",
        color: 0x6A0DAD,
        fields: [
          { name: "الاسم", value: users[username].name, inline: true },
          { name: "الدور", value: username, inline: true },
          { name: "الوقت", value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }) }
        ]
      }]
    };

    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedLog)
    });

    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة دخول فاشلة باسم: \`${username}\``);
    return res.redirect('/login?error=1');
  }
});

// تسجيل خروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: ${req.session.username}`);
  }
  req.session.destroy(() => res.redirect('/login'));
});

// حماية لوحة التحكم
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// حذف طلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'لم يتم العثور على الطلب' });
    }

    await sendDiscordLog(`🗑️ تم حذف الطلب ID: ${req.params.id}`);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء الحذف' });
  }
});

// تحديث الحالة
app.put('/order/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  const valid = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!valid.includes(status)) {
    return res.status(400).json({ message: 'حالة غير صحيحة' });
  }

  try {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    await sendDiscordLog(`✅ تحديث الحالة: ID ${id} -> "${status}"`);
    res.json({ message: 'تم تحديث الحالة' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
});

// صفحة بسيطة لتسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login">
      <h2>تسجيل دخول</h2>
      <input name="username" placeholder="المستخدم" required>
      <input name="password" type="password" placeholder="كلمة المرور" required>
      <button type="submit">دخول</button>
    </form>
  `);
});

// صفحة لوحة التحكم (فارغة مؤقتًا)
app.get('/admin', requireAuth, async (req, res) => {
  res.send(`<h1>مرحباً ${req.session.username}!</h1><p>لوحة التحكم قيد التطوير</p><a href="/logout">تسجيل خروج</a>`);
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});

// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// رابط ويب هوك ديسكورد (غيرّه إلى رابطك)

// دالة لإرسال رسالة نصية للديسكورد
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('Failed to send Discord log:', err);
  }
}

// إعداد اتصال قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
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

// مسار استلام طلب جديد
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

    await sendDiscordLog(`📦 طلب جديد  
• الاسم: **${name}**  
• جوال: **${phone}**  
• جهاز: **${device}**  
• كود الطلب: **${code}**  
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

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
app.post('/login', async (req, res) => {
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

    const embedLog = {
      embeds: [{
        title: "🔐 تسجيل دخول جديد",
        color: 0x6A0DAD,
        fields: [
          { name: "المستخدم", value: users[username].name, inline: true },
          { name: "الدور",     value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
          { name: "الوقت",     value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }), inline: false }
        ]
      }]
    };
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedLog)
    }).catch(err => console.error('Failed to send embed log:', err));

    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة تسجيل دخول فاشلة باسم مستخدم: \`${username}\` في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
    return res.redirect('/login?error=1');
  }
});

// تسجيل خروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role}) في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
  }
  req.session.destroy(() => res.redirect('/login'));
});

// حماية المسارات
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// لوحة الإدارة
app.get('/admin', requireAuth, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    let result;
    if (searchQuery) {
      const search = `%${searchQuery}%`;
      result = await pool.query(
        `SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`,
        [search]
      );
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price}</td>
        <td>${order.installment_price}</td>
        <td>${order.monthly}</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</td>
        <td>
          <select onchange="${req.session.role === 'admin'
            ? `onStatusChange(${order.id}, '${order.phone}', '${order.name}', '${order.order_code}', this.value, event)`
            : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"    ${order.status==='تم التنفيذ'   ?'selected':''}>تم التنفيذ</option>
            <option value="مرفوض"        ${order.status==='مرفوض'       ?'selected':''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="${req.session.role==='admin'
            ? `deleteOrder(${order.id})`
            : `alert('ليس لديك صلاحية لحذف الطلب')`}"
            style="background:red;color:white;border:none;padding:5px 10px;border-radius:5px;">
            حذف
          </button>
        </td>
        <td>
          <button onclick="${req.session.role==='admin'
            ? `markExecuted('${order.phone}')`
            : `alert('ليس لديك صلاحية')`}"
            style="background:green;color:white;border:none;padding:5px 10px;border-radius:5px;">
            تم تنفيذ الطلب
          </button>
        </td>
      </tr>
    `).join('');

    const greeting = req.session.greeting || 'مرحبا بك في لوحة الإدارة!';
    res.send(`
      <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>لوحة إدارة الطلبات</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; margin:0; padding:30px; background:#f5f7fa; color:#333; direction:rtl; }
          h1, h2 { text-align:center; color:#3b0a77; }
          table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; box-shadow:0 5px 20px rgba(0,0,0,0.1); }
          th, td { padding:15px; text-align:center; border-bottom:1px solid #eee; font-size:15px; }
          th { background:#3b0a77; color:#fff; }
          button { padding:5px 10px; font-size:14px; border:none; border-radius:6px; cursor:pointer; }
          .logout-link { text-align:center; margin-bottom:15px; }
          .logout-link a { color:#3b0a77; text-decoration:none; font-size:15px; }
        </style>
        </head>
        <body>
          <div class="logout-link"><a href="/logout">تسجيل خروج</a></div>
          <h1>${greeting}</h1>
          <h2>لوحة إدارة الطلبات (الدور: ${req.session.role})</h2>
          <form method="GET" action="/admin" style="text-align:center; margin-bottom:20px;">
            <input type="text" name="q" placeholder="بحث باسم، جوال أو كود الطلب"
                   style="padding:10px; width:300px; font-size:15px;" value="${req.query.q||''}" />
            <button type="submit" style="padding:10px 20px; font-size:15px; background:#3b0a77; color:#fff; border:none; border-radius:6px;">
              بحث
            </button>
          </form>
          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>رقم الجوال</th><th>الجهاز</th><th>السعر نقداً</th>
                <th>السعر تقسيط</th><th>شهر</th><th>كود الطلب</th><th>تاريخ الطلب</th>
                <th>الحالة</th><th>حذف</th><th>تم التنفيذ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            // عند تغيير الحالة
            function onStatusChange(id, phone, name, code, status, event) {
              if (status === 'قيد التنفيذ') {
                const msg = \`مرحبًا \${name}، طلبك رقم \${code} قيد التنفيذ الآن. شكرًا لتعاملكم معنا في 4STORE.\`;
                window.open(
                  'https://wa.me/' + phone.replace(/[^0-9]/g, '') +
                  '?text=' + encodeURIComponent(msg),
                  '_blank'
                );
                // إعادة الاختيار للحالة السابقة
                event.target.value = 'قيد المراجعة';
              } else {
                fetch('/order/' + id + '/status', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status })
                })
                .then(res => res.json())
                .then(data => alert(data.message))
                .catch(() => alert('حدث خطأ أثناء تحديث الحالة'));
              }
            }

            // زر "تم تنفيذ الطلب"
            function markExecuted(phone) {
              const msg = 'عميلنا العزيز، تم استكمال تنفيذ طلبك عبر 4STORE. شكرًا لتعاملكم ونتطلع لخدمتكم دائمًا.';
              const intlPhone = phone.replace(/^0/, '966').replace(/[^0-9]/g, '');
window.open(
  'https://wa.me/' + intlPhone +
                '?text=' + encodeURIComponent(msg),
                '_blank'
              );
            }

            // دالة الحذف
            async function deleteOrder(id) {
              if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
              try {
                const res = await fetch('/order/' + id, { method: 'DELETE' });
                const data = await res.json();
                alert(data.message);
                if (res.ok) location.reload();
              } catch {
                alert('حدث خطأ أثناء حذف الطلب');
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('حدث خطأ في السيرفر');
  }
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
    await sendDiscordLog(`✅ تم تحديث حالة الطلب (ID: ${id}) إلى "${status}" بواسطة ${req.session.username}`);
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
    await sendDiscordLog(`🗑️ تم حذف الطلب (ID: ${id}) بواسطة ${req.session.username}`);
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

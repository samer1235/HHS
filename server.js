const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات (غير الرابط برابطك الخاص)
const pool = new Pool({
  connectionString: 'postgresql://postgres:password@host:port/database',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول معلومات شخصية إذا غير موجود + إضافة أعمدة جديدة إذا ناقصة
pool.query(`
  CREATE TABLE IF NOT EXISTS personal_info (
    id SERIAL PRIMARY KEY,
    full_name TEXT,
    id_number TEXT,
    dob DATE,
    phone TEXT,
    email TEXT,
    address TEXT,
    job_title TEXT,
    notes TEXT,
    status TEXT DEFAULT 'نشط',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  -- يمكن إضافة أعمدة هنا إذا حبيت
`).then(() => {
  console.log('✅ جدول "personal_info" جاهز.');
}).catch(err => {
  console.error('❌ خطأ في إنشاء/تعديل الجدول:', err.message);
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>تسجيل الدخول</title>
      </head>
      <body>
        <form method="POST" action="/login">
          <input name="username" placeholder="اسم المستخدم" required />
          <input name="password" type="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
        ${req.query.error ? `<p style="color:red;">بيانات الدخول غير صحيحة</p>` : ''}
      </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'yourpassword') {
    req.session.authenticated = true;
    req.session.username = username;
    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// صفحة الإدارة (عرض وتحديث البيانات)
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  try {
    const searchQuery = req.query.q;
    let result;
    if (searchQuery) {
      const likeQuery = `%${searchQuery}%`;
      result = await pool.query(`
        SELECT * FROM personal_info
        WHERE full_name ILIKE $1 OR id_number ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
        ORDER BY created_at DESC
      `, [likeQuery]);
    } else {
      result = await pool.query('SELECT * FROM personal_info ORDER BY created_at DESC');
    }

    const rows = result.rows.map(row => `
      <tr>
        <td>${row.full_name}</td>
        <td>${row.id_number}</td>
        <td>${row.dob ? new Date(row.dob).toLocaleDateString('ar-EG') : ''}</td>
        <td>${row.phone}</td>
        <td>${row.email}</td>
        <td>${row.address || ''}</td>
        <td>${row.job_title || ''}</td>
        <td>${row.notes || ''}</td>
        <td>${row.status}</td>
        <td>${new Date(row.created_at).toLocaleString()}</td>
        <td>
          <select onchange="updateStatus(${row.id}, this.value)">
            <option value="نشط" ${row.status === 'نشط' ? 'selected' : ''}>نشط</option>
            <option value="غير نشط" ${row.status === 'غير نشط' ? 'selected' : ''}>غير نشط</option>
            <option value="محذوف" ${row.status === 'محذوف' ? 'selected' : ''}>محذوف</option>
          </select>
        </td>
        <td><button onclick="deleteRecord(${row.id})" style="background:red;color:white;">حذف</button></td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>لوحة إدارة المعلومات الشخصية</title>
        <style>
          body { font-family: 'Almarai', sans-serif; direction: rtl; padding: 20px; background: #f0f0f0; }
          table { width: 100%; border-collapse: collapse; background: #fff; }
          th, td { padding: 10px; border: 1px solid #ccc; text-align: center; }
          th { background: #3b0a77; color: white; }
          select { padding: 5px; }
          button { padding: 5px 10px; cursor: pointer; border:none; border-radius:4px; }
          .logout { margin-bottom: 15px; }
          .logout a { text-decoration:none; color:#3b0a77; font-weight:bold; }
          form.search { margin-bottom: 15px; }
          input[type=text] { padding: 8px; width: 250px; border-radius: 6px; border:1px solid #ccc; }
          button.search-btn { padding: 8px 12px; border:none; background:#3b0a77; color:#fff; border-radius: 6px; cursor:pointer; }
        </style>
      </head>
      <body>
        <div class="logout"><a href="/logout">🔓 تسجيل الخروج</a></div>
        <h1>إدارة المعلومات الشخصية</h1>
        <form method="GET" action="/admin" class="search">
          <input type="text" name="q" placeholder="ابحث بالاسم، الهوية، الجوال، البريد" value="${req.query.q || ''}" />
          <button class="search-btn" type="submit">بحث</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>الاسم الكامل</th>
              <th>رقم الهوية</th>
              <th>تاريخ الميلاد</th>
              <th>الجوال</th>
              <th>البريد الإلكتروني</th>
              <th>العنوان</th>
              <th>الوظيفة</th>
              <th>ملاحظات</th>
              <th>الحالة</th>
              <th>تاريخ الإدخال</th>
              <th>تغيير الحالة</th>
              <th>حذف</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <script>
          function deleteRecord(id) {
            if(confirm('هل أنت متأكد من حذف هذا السجل؟')) {
              fetch('/api/delete/' + id, { method: 'DELETE' })
                .then(res => {
                  if(res.ok) location.reload();
                  else alert('فشل حذف السجل');
                });
            }
          }

          function updateStatus(id, status) {
            fetch('/api/status/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            }).then(res => {
              if(res.ok) location.reload();
              else alert('فشل تحديث الحالة');
            });
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('حدث خطأ أثناء جلب البيانات');
  }
});

// API: إضافة سجل جديد
app.post('/api/add', async (req, res) => {
  const { full_name, id_number, dob, phone, email, address, job_title, notes } = req.body;
  if (!full_name || !id_number || !dob || !phone || !email) {
    return res.status(400).json({ error: 'البيانات ناقصة' });
  }
  try {
    await pool.query(`
      INSERT INTO personal_info (full_name, id_number, dob, phone, email, address, job_title, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [full_name, id_number, dob, phone, email, address, job_title, notes]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في إضافة السجل' });
  }
});

// API: حذف سجل
app.delete('/api/delete/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM personal_info WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في حذف السجل' });
  }
});

// API: تحديث الحالة
app.put('/api/status/:id', async (req, res) => {
  try {
    await pool.query('UPDATE personal_info SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في تحديث الحالة' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

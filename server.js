const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// 1) إعداد الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:mXAiWasoFVFCFMoxciHDHRZnbyRMtMRU@metro.proxy.rlwy.net:55602/railway',
  ssl: { rejectUnauthorized: false }
});

// 2) إنشاء الجدول وإضافة الأعمدة إذا كانت ناقصة
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
  );
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS id_number TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS dob DATE;
`).then(() => {
  console.log('✅ جدول "orders" جاهز مع جميع الأعمدة.');
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

// --- (صفحات /login, /logout, /admin تتركها كما هي عندك) ---

// 3) نقطة إضافة الطلب مع لوج للتتبع
app.post('/api/order', async (req, res) => {
  console.log('> BODY:', req.body);

  const { name, phone, idNumber, dob, device, cashPrice, installmentPrice, monthly, code } = req.body;

  if (!name || !phone || !idNumber || !dob || !device || !code) {
    return res.status(400).json({ error: 'البيانات المدخلة غير صحيحة' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM orders WHERE phone=$1 AND order_code=$2',
      [phone, code]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: 'تم تقديم هذا الطلب مسبقًا' });
    }

    await pool.query(`
      INSERT INTO orders
        (name, phone, id_number, dob, device, cash_price, installment_price, monthly, order_code)
      VALUES
        ($1,    $2,    $3,        $4,  $5,    $6,           $7,          $8,      $9)
    `, [name, phone, idNumber, dob, device, cashPrice, installmentPrice, monthly, code]);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ DB ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4) بقية الـ API (delete, status update, get-order)
app.delete('/api/delete/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

app.put('/api/status/:id', async (req, res) => {
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Status update error:', err.message);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

app.get('/api/get-order/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, phone, order_code FROM orders WHERE id=$1',
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الطلب' });
    }
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error('Error fetching order:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5) تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

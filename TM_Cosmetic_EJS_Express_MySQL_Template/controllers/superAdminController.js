
const db = require('../config/db');
const bcrypt = require('bcryptjs');

// ==========================================
// SUPER ADMIN DASHBOARD
// ==========================================
exports.dashboard = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role_id = 1 THEN 1 ELSE 0 END) AS super_admins,
        SUM(CASE WHEN role_id = 5 THEN 1 ELSE 0 END) AS admins,
        SUM(CASE WHEN role_id = 4 THEN 1 ELSE 0 END) AS delivery_users,
        SUM(CASE WHEN role_id = 2 THEN 1 ELSE 0 END) AS b2b_users,
        SUM(CASE WHEN role_id = 3 THEN 1 ELSE 0 END) AS b2c_users
      FROM users
    `);

    res.render('super-admin/dashboard', {
      title: 'Super Admin Dashboard | TM Cosmetic',
      stats: rows[0],
      user: req.session.user
    });

  } catch (error) {
    console.error('Super Admin dashboard error:', error);
    res.status(500).send('Unable to load Super Admin dashboard.');
  }
};

// ==========================================
// STAFF MANAGEMENT
// ==========================================
exports.staffList = async (req, res) => {
  try {
    const [staff] = await db.execute(`
      SELECT id, name, email, phone, role_id, created_at
      FROM users
      WHERE role_id IN (4, 5)
      ORDER BY id DESC
    `);

    res.render('super-admin/staff-list', {
      title: 'Staff Management | TM Cosmetic',
      staff,
      created: req.query.created === '1',
      user: req.session.user
    });

  } catch (error) {
    console.error('Staff list error:', error);
    res.status(500).send('Unable to load staff list.');
  }
};

// ==========================================
// SHOW CREATE STAFF PAGE
// ==========================================
exports.showCreateStaff = (req, res) => {
  res.render('super-admin/create-staff', {
    title: 'Create Staff Account | TM Cosmetic',
    error: null,
    formData: {
      name: '',
      email: '',
      phone: '',
      role_id: ''
    },
    user: req.session.user
  });
};

// ==========================================
// CREATE ADMIN OR DELIVERY ACCOUNT
// ==========================================
exports.createStaff = async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim();
    const password = req.body.password || '';
    const confirmPassword = req.body.confirmPassword || '';
    const roleId = Number(req.body.role_id);

    const formData = {
      name,
      email,
      phone,
      role_id: String(roleId)
    };

    const showError = (message) => {
      return res.status(400).render('super-admin/create-staff', {
        title: 'Create Staff Account | TM Cosmetic',
        error: message,
        formData,
        user: req.session.user
      });
    };

    if (!name || !email || !phone || !password || !confirmPassword) {
      return showError('Please fill in all fields.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showError('Please enter a valid email address.');
    }

    if (![4, 5].includes(roleId)) {
      return showError('Please select Admin or Delivery Person.');
    }

    if (password.length < 8) {
      return showError('Password must contain at least 8 characters.');
    }

    if (password !== confirmPassword) {
      return showError('Passwords do not match.');
    }

    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      return showError('This email address is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users
       (name, email, phone, password_hash, joinas, role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, phone, passwordHash, roleId, roleId]
    );

    console.log('Staff account created:', result.insertId);

    return res.redirect('/super-admin/staff?created=1');

  } catch (error) {
    console.error('Create staff error:', error);

    res.status(500).render('super-admin/create-staff', {
      title: 'Create Staff Account | TM Cosmetic',
      error: 'Unable to create staff account. Please try again.',
      formData: {
        name: req.body.name || '',
        email: req.body.email || '',
        phone: req.body.phone || '',
        role_id: req.body.role_id || ''
      },
      user: req.session.user
    });
  }
};

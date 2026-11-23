
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

    // Give new Admin and Delivery accounts full product permissions.
    await db.execute(
      `INSERT INTO user_permissions
       (user_id, can_read, can_create, can_edit, can_delete)
       VALUES (?, 1, 1, 1, 1)
       ON DUPLICATE KEY UPDATE
         can_read = 1,
         can_create = 1,
         can_edit = 1,
         can_delete = 1`,
      [result.insertId]
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

// ==========================================
// VIEW USERS BY CATEGORY
// ==========================================
exports.usersList = async (req, res) => {
  try {
    const categories = {
      all: { title: 'All Users', roleId: null },
      'super-admin': { title: 'Super Admins', roleId: 1 },
      admin: { title: 'Admins', roleId: 5 },
      delivery: { title: 'Delivery Persons', roleId: 4 },
      b2b: { title: 'B2B Users', roleId: 2 },
      b2c: { title: 'B2C Users', roleId: 3 }
    };

    const category = categories[req.params.type];

    if (!category) {
      return res.status(404).send('User category not found.');
    }

    let sql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role_id,
        u.created_at,
        CASE u.role_id
          WHEN 1 THEN 'Super Admin'
          WHEN 2 THEN 'B2B User'
          WHEN 3 THEN 'B2C User'
          WHEN 4 THEN 'Delivery Person'
          WHEN 5 THEN 'Admin'
          ELSE 'Unknown'
        END AS role_name,
        COALESCE(p.can_read,
          CASE WHEN u.role_id IN (1, 2, 3, 4, 5) THEN 1 ELSE 0 END
        ) AS can_read,
        COALESCE(p.can_create,
          CASE WHEN u.role_id IN (1, 4, 5) THEN 1 ELSE 0 END
        ) AS can_create,
        COALESCE(p.can_edit,
          CASE WHEN u.role_id IN (1, 4, 5) THEN 1 ELSE 0 END
        ) AS can_edit,
        COALESCE(p.can_delete,
          CASE WHEN u.role_id IN (1, 4, 5) THEN 1 ELSE 0 END
        ) AS can_delete
      FROM users u
      LEFT JOIN user_permissions p ON p.user_id = u.id
    `;

    const params = [];

    if (category.roleId !== null) {
      sql += ' WHERE u.role_id = ?';
      params.push(category.roleId);
    }

    sql += ' ORDER BY u.id DESC';

    const [users] = await db.execute(sql, params);

    res.render('super-admin/users-list', {
      title: `${category.title} | TM Cosmetic`,
      pageTitle: category.title,
      users,
      user: req.session.user,
      queryUpdated: req.query.updated === '1',
      queryDeleted: req.query.deleted === '1',
      permissionsUpdated: req.query.permissionsUpdated === '1'
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).send('Unable to load users.');
  }
};

// ==========================================
// SAVE USER PERMISSIONS
// ==========================================
exports.updateUserPermissions = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).send('Invalid user ID.');
    }

    const [users] = await db.execute(
      'SELECT id, role_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!users.length) {
      return res.status(404).send('User not found.');
    }

    // Never allow changing Super Admin permissions.
    if (userId === 1 || Number(users[0].role_id) === 1) {
      return res.status(403).send(
        'Super Admin permissions cannot be changed.'
      );
    }

    const checked = (value) =>
      value === '1' || value === 'on' || value === true ? 1 : 0;

    const canRead = checked(req.body.can_read);
    const canCreate = checked(req.body.can_create);
    const canEdit = checked(req.body.can_edit);
    const canDelete = checked(req.body.can_delete);

    await db.execute(
      `INSERT INTO user_permissions
       (user_id, can_read, can_create, can_edit, can_delete)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         can_read = VALUES(can_read),
         can_create = VALUES(can_create),
         can_edit = VALUES(can_edit),
         can_delete = VALUES(can_delete)`,
      [userId, canRead, canCreate, canEdit, canDelete]
    );

    const allowedTypes = [
      'all', 'super-admin', 'admin', 'delivery', 'b2b', 'b2c'
    ];

    const returnType = allowedTypes.includes(req.body.returnType)
      ? req.body.returnType
      : 'all';

    return res.redirect(
      `/super-admin/users/${returnType}?permissionsUpdated=1`
    );
  } catch (error) {
    console.error('Update user permissions error:', error);
    res.status(500).send('Unable to save user permissions.');
  }
};

// ==========================================
// SHOW EDIT USER PAGE
// ==========================================
exports.showEditUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).send('Invalid user ID.');
    }

    const [rows] = await db.execute(
      `SELECT id, name, email, phone, role_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).send('User not found.');
    }

    if (Number(rows[0].role_id) === 1 || userId === 1) {
      return res.status(403).send(
        'Super Admin accounts cannot be edited here.'
      );
    }

    res.render('super-admin/edit-user', {
      title: 'Edit User | TM Cosmetic',
      editUser: rows[0],
      error: null
    });
  } catch (error) {
    console.error('Show edit user error:', error);
    res.status(500).send('Unable to load user details.');
  }
};

// ==========================================
// UPDATE USER
// ==========================================
exports.updateUser = async (req, res) => {
  const userId = Number(req.params.id);

  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const roleId = Number(req.body.role_id);

  const formData = {
    id: userId,
    name,
    email,
    phone,
    role_id: roleId
  };

  const renderError = (message, status = 400) => {
    return res.status(status).render('super-admin/edit-user', {
      title: 'Edit User | TM Cosmetic',
      editUser: formData,
      error: message
    });
  };

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).send('Invalid user ID.');
  }

  if (name.length < 2 || !email) {
    return renderError('Please enter a valid name and email address.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }

  if (![2, 3, 4, 5].includes(roleId)) {
    return renderError('Please select a valid user role.');
  }

  try {
    const [existingUser] = await db.execute(
      'SELECT id, role_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!existingUser.length) {
      return res.status(404).send('User not found.');
    }

    if (Number(existingUser[0].role_id) === 1 || userId === 1) {
      return res.status(403).send(
        'Super Admin accounts cannot be edited here.'
      );
    }

    await db.execute(
      `UPDATE users
       SET name = ?,
           email = ?,
           phone = ?,
           role_id = ?,
           joinas = ?
       WHERE id = ? AND role_id <> 1`,
      [name, email, phone || null, roleId, roleId, userId]
    );

    // Set default permissions for the newly assigned role.
    const fullAccess = [4, 5].includes(roleId) ? 1 : 0;

    await db.execute(
      `INSERT INTO user_permissions
       (user_id, can_read, can_create, can_edit, can_delete)
       VALUES (?, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         can_read = 1,
         can_create = VALUES(can_create),
         can_edit = VALUES(can_edit),
         can_delete = VALUES(can_delete)`,
      [userId, fullAccess, fullAccess, fullAccess]
    );

    return res.redirect('/super-admin/users/all?updated=1');
  } catch (error) {
    console.error('Update user error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return renderError('This email address is already registered.');
    }

    return renderError('Unable to update user. Please try again.', 500);
  }
};

// ==========================================
// DELETE USER
// ==========================================
exports.deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).send('Invalid user ID.');
    }

    const [rows] = await db.execute(
      'SELECT id, role_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).send('User not found.');
    }

    if (Number(rows[0].role_id) === 1 || userId === 1) {
      return res.status(403).send(
        'Super Admin accounts cannot be deleted.'
      );
    }

    await db.execute(
      'DELETE FROM users WHERE id = ? AND role_id <> 1',
      [userId]
    );

    return res.redirect('/super-admin/users/all?deleted=1');
  } catch (error) {
    console.error('Delete user error:', error);

    return res.status(500).send(
      'Unable to delete this user. The account may be linked to existing orders or other records.'
    );
  }
};

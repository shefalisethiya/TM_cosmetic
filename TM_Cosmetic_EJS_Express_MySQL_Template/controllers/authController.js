
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// ==========================================
// SHOW LOGIN PAGE
// ==========================================
exports.showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/');

  res.render('auth/login', {
    title: 'Sign In | TM Cosmetic',
    error: null,
    email: ''
  });
};

// ==========================================
// SHOW SIGNUP PAGE
// ==========================================
exports.showSignup = (req, res) => {
  if (req.session.user) return res.redirect('/');

  res.render('auth/signup', {
    title: 'Create Account | TM Cosmetic',
    error: null,
    name: '',
    email: '',
    phone: '',
    joinas: ''
  });
};

// ==========================================
// CUSTOMER SIGNUP - B2B / B2C ONLY
// ==========================================
exports.signup = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const joinas = Number(req.body.joinas);

  const renderError = message => {
    return res.status(400).render('auth/signup', {
      title: 'Create Account | TM Cosmetic',
      error: message,
      name,
      email,
      phone,
      joinas: String(joinas || '')
    });
  };

  if (name.length < 2) {
    return renderError('Please enter your full name.');
  }

  // Correct email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }

  if (password.length < 8) {
    return renderError('Password must contain at least 8 characters.');
  }

  if (password !== confirmPassword) {
    return renderError('Passwords do not match.');
  }

  // Public signup is restricted to B2B and B2C
  if (![2, 3].includes(joinas)) {
    return renderError('Please select B2B User or B2C User.');
  }

  try {
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length) {
      return renderError(
        'An account with this email already exists. Please sign in.'
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users
       (name, email, phone, password_hash, joinas, role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, phone || null, passwordHash, joinas, joinas]
    );

    // Existing signup behavior: automatically sign in after registration
    req.session.user = {
      id: result.insertId,
      name,
      email,
      role_id: joinas
    };

    return req.session.save(err => {
      if (err) {
        console.error('Signup session error:', err.message);
        return res.status(500).send(
          'Account created, but sign-in could not be started. Please sign in.'
        );
      }

      return res.redirect('/');
    });

  } catch (error) {
    console.error('Signup error:', error.code || error.message);

    return renderError(
      error.code === 'ER_NO_SUCH_TABLE'
        ? 'User table is missing. Please check your database.'
        : error.code === 'ER_BAD_FIELD_ERROR'
          ? 'Database column error. Please verify the users table structure.'
          : 'Unable to create your account right now. Please try again.'
    );
  }
};

// ==========================================
// LOGIN ALIAS
// ==========================================
exports.login = async (req, res) => {
  return exports.loginWithOTP(req, res);
};

// ==========================================
// LOGIN WITH EMAIL + PASSWORD + OTP
// ==========================================
exports.loginWithOTP = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const renderError = message => {
    return res.status(400).render('auth/login', {
      title: 'Sign In | TM Cosmetic',
      error: message,
      email
    });
  };

  if (!email || !password) {
    return renderError('Enter your email and password.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, password_hash, role_id
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      return renderError('Incorrect email or password.');
    }

    const user = rows[0];
    const roleId = Number(user.role_id);

    if (![1, 2, 3, 4, 5].includes(roleId)) {
      return renderError('Your account has an invalid role. Please contact support.');
    }

    if (!user.phone) {
      return renderError(
        'No registered mobile number found. Please contact support.'
      );
    }

    // Generate a random 4-digit OTP
    const otp = String(crypto.randomInt(1000, 10000));
    const otpHash = await bcrypt.hash(otp, 10);

    // Remove previous OTP
    await db.execute(
      'DELETE FROM login_otps WHERE user_id = ?',
      [user.id]
    );

    // OTP expires after 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.execute(
      `INSERT INTO login_otps
       (user_id, otp_hash, expires_at, attempts, last_sent_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [user.id, otpHash, expiresAt]
    );

    req.session.pendingLoginUserId = user.id;

    // Development only: OTP is logged in the terminal.
    // Actual SMS delivery requires an SMS provider.
    if (process.env.NODE_ENV !== 'production') {
      console.log('TM COSMETIC DEVELOPMENT OTP:', otp);
    }

    return req.session.save(err => {
      if (err) {
        console.error('Session save error:', err.message);
        return renderError('Unable to start login. Please try again.');
      }

      return res.redirect('/verify-otp');
    });

  } catch (error) {
    console.error('OTP login error:', error.code || error.message);

    return renderError(
      error.code === 'ER_NO_SUCH_TABLE'
        ? 'Login OTP table is missing. Please check your database.'
        : 'Unable to process login. Please try again.'
    );
  }
};

// ==========================================
// SHOW OTP VERIFICATION PAGE
// ==========================================
exports.showVerifyOTP = (req, res) => {
  if (!req.session.pendingLoginUserId) {
    return res.redirect('/login');
  }

  let message = null;

  if (req.query.resent === '1') {
    message = 'A new OTP has been generated. Check your registered mobile delivery channel.';
  } else if (req.query.error === 'wait') {
    message = 'Please wait 60 seconds before requesting another OTP.';
  } else if (req.query.error === 'server') {
    message = 'Unable to resend OTP. Please try again.';
  }

  res.render('auth/verify-otp', {
    title: 'Verify OTP | TM Cosmetic',
    error: null,
    message
  });
};

// ==========================================
// VERIFY 4-DIGIT OTP
// ==========================================
exports.verifyOTP = async (req, res) => {
  const userId = req.session.pendingLoginUserId;
  const otp = String(req.body.otp || '').trim();

  const renderError = message => {
    return res.status(400).render('auth/verify-otp', {
      title: 'Verify OTP | TM Cosmetic',
      error: message,
      message: null
    });
  };

  if (!userId) {
    return res.redirect('/login');
  }

  if (!/^\d{4}$/.test(otp)) {
    return renderError('Please enter a valid 4-digit OTP.');
  }

  try {
    const [otpRows] = await db.execute(
      `SELECT id, otp_hash, attempts,
              (expires_at > NOW()) AS is_valid_time
       FROM login_otps
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (!otpRows.length) {
      return renderError('OTP not found or expired. Please request a new OTP.');
    }

    const otpRecord = otpRows[0];

    if (!otpRecord.is_valid_time) {
      await db.execute(
        'DELETE FROM login_otps WHERE user_id = ?',
        [userId]
      );

      return renderError('OTP has expired. Please request a new OTP.');
    }

    if (Number(otpRecord.attempts) >= 5) {
      await db.execute(
        'DELETE FROM login_otps WHERE user_id = ?',
        [userId]
      );

      return renderError('Too many incorrect attempts. Please log in again.');
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isMatch) {
      await db.execute(
        'UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?',
        [otpRecord.id]
      );

      return renderError('Incorrect OTP. Please try again.');
    }

    const [users] = await db.execute(
      `SELECT id, name, email, role_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!users.length) {
      return res.redirect('/login');
    }

    const user = users[0];

    if (![1, 2, 3, 4, 5].includes(Number(user.role_id))) {
      return renderError('Invalid account role. Please contact support.');
    }

    await db.execute(
      'DELETE FROM login_otps WHERE user_id = ?',
      [userId]
    );

    // Regenerate session to prevent session fixation
    req.session.regenerate(err => {
      if (err) {
        console.error('Session regeneration error:', err.message);
        return res.status(500).send('Unable to complete login. Please try again.');
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: Number(user.role_id)
      };

      return req.session.save(err => {
        if (err) {
          console.error('Session save error:', err.message);
          return res.status(500).send('Unable to complete login.');
        }

        // Keep the existing home redirect until role dashboards are created.
        return res.redirect('/');
      });
    });

  } catch (error) {
    console.error('OTP verification error:', error.code || error.message);
    return renderError('Unable to verify OTP. Please try again.');
  }
};

// ==========================================
// RESEND OTP - 60 SECOND COOLDOWN
// ==========================================
exports.resendOTP = async (req, res) => {
  const userId = req.session.pendingLoginUserId;

  if (!userId) {
    return res.redirect('/login');
  }

  try {
    const [users] = await db.execute(
      `SELECT id, phone
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!users.length || !users[0].phone) {
      return res.redirect('/login');
    }

    const [otpRows] = await db.execute(
      `SELECT id,
              TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
       FROM login_otps
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (
      otpRows.length &&
      Number(otpRows[0].seconds_since_sent) < 60
    ) {
      return res.redirect('/verify-otp?error=wait');
    }

    const otp = String(crypto.randomInt(1000, 10000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (otpRows.length) {
      await db.execute(
        `UPDATE login_otps
         SET otp_hash = ?,
             expires_at = ?,
             attempts = 0,
             last_sent_at = NOW()
         WHERE id = ?`,
        [otpHash, expiresAt, otpRows[0].id]
      );
    } else {
      await db.execute(
        `INSERT INTO login_otps
         (user_id, otp_hash, expires_at, attempts, last_sent_at)
         VALUES (?, ?, ?, 0, NOW())`,
        [userId, otpHash, expiresAt]
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('TM COSMETIC RESENT OTP:', otp);
    }

    return res.redirect('/verify-otp?resent=1');

  } catch (error) {
    console.error('Resend OTP error:', error.code || error.message);
    return res.redirect('/verify-otp?error=server');
  }
};

// ==========================================
// LOGOUT
// ==========================================
exports.logout = (req, res) => {
  if (!req.session) {
    return res.redirect('/');
  }

  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err.message);
      return res.status(500).send('Unable to log out. Please try again.');
    }

    res.clearCookie('tmcosmetic.sid');
    return res.redirect('/');
  });
};

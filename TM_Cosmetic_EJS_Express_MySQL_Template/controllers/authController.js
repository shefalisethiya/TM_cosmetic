
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
    phone: ''
  });
};

// ==========================================
// CUSTOMER SIGNUP
// ==========================================
exports.signup = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  const renderError = message => res.status(400).render('auth/signup', {
    title: 'Create Account | TM Cosmetic',
    error: message,
    name,
    email,
    phone
  });

  if (name.length < 2) {
    return renderError('Please enter your full name.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }

  if (password.length < 8) {
    return renderError('Password must contain at least 8 characters.');
  }

  if (password !== confirmPassword) {
    return renderError('Passwords do not match.');
  }

  try {
    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length) {
      return renderError('An account with this email already exists. Please sign in.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      'INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [name, email, phone || null, passwordHash]
    );

    req.session.user = {
      id: result.insertId,
      name,
      email
    };

    return req.session.save(err => {
      if (err) {
        return renderError('Account created, but sign-in could not be started. Please sign in.');
      }

      return res.redirect('/');
    });

  } catch (error) {
    console.error('Signup error:', error.code || error.message);

    return renderError(
      error.code === 'ER_NO_SUCH_TABLE'
        ? 'User table is missing. Please import the updated database/tm_cosmetic.sql file.'
        : 'Unable to create your account right now. Please check your database connection.'
    );
  }
};

// ==========================================
// LOGIN
// ==========================================
exports.login = async (req, res) => {
  return exports.loginWithOTP(req, res);
};

// ==========================================
// VERIFY EMAIL AND PASSWORD, GENERATE OTP
// ==========================================
exports.loginWithOTP = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const renderError = message => res.status(400).render('auth/login', {
    title: 'Sign In | TM Cosmetic',
    error: message,
    email
  });

  if (!email || !password) {
    return renderError('Enter your email and password.');
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, password_hash
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return renderError('Incorrect email or password.');
    }

    const user = rows[0];

    if (!user.phone) {
      return renderError('No registered mobile number found. Please contact support.');
    }

    // Generate random 4-digit OTP
    const otp = String(crypto.randomInt(1000, 10000));

    // Hash OTP before storing it
    const otpHash = await bcrypt.hash(otp, 10);

    // Delete previous OTP
    await db.execute(
      'DELETE FROM login_otps WHERE user_id = ?',
      [user.id]
    );

    // OTP expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.execute(
      `INSERT INTO login_otps
       (user_id, otp_hash, expires_at, attempts, last_sent_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [user.id, otpHash, expiresAt]
    );

    // Store pending login, not authenticated user
    req.session.pendingLoginUserId = user.id;

    // Development only: display OTP in VS Code terminal
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
        ? 'Login OTP table is missing. Please create the login_otps table.'
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

  res.render('auth/verify-otp', {
    title: 'Verify OTP | TM Cosmetic',
    error: null
  });
};

// ==========================================
// VERIFY 4-DIGIT OTP
// ==========================================
exports.verifyOTP = async (req, res) => {
  const userId = req.session.pendingLoginUserId;
  const otp = String(req.body.otp || '').trim();

  const renderError = message => res.status(400).render('auth/verify-otp', {
    title: 'Verify OTP | TM Cosmetic',
    error: message
  });

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
      return renderError('OTP not found. Please request a new OTP.');
    }

    const otpRecord = otpRows[0];

    // Check OTP expiry
    if (!otpRecord.is_valid_time) {
      await db.execute(
        'DELETE FROM login_otps WHERE user_id = ?',
        [userId]
      );

      return renderError('OTP has expired. Please log in again.');
    }

    // Maximum 5 incorrect attempts
    if (otpRecord.attempts >= 5) {
      await db.execute(
        'DELETE FROM login_otps WHERE user_id = ?',
        [userId]
      );

      return renderError('Too many incorrect attempts. Please log in again.');
    }

    // Compare entered OTP with stored hash
    const isMatch = await bcrypt.compare(otp, otpRecord.otp_hash);

    if (!isMatch) {
      await db.execute(
        'UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?',
        [otpRecord.id]
      );

      return renderError('Incorrect OTP. Please try again.');
    }

    // Get customer details
    const [users] = await db.execute(
      'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!users.length) {
      return res.redirect('/login');
    }

    const user = users[0];

    // Delete verified OTP
    await db.execute(
      'DELETE FROM login_otps WHERE user_id = ?',
      [userId]
    );

    // Regenerate session for security
    req.session.regenerate(err => {
      if (err) {
        console.error('Session regeneration error:', err.message);
        return res.status(500).send('Unable to complete login. Please try again.');
      }

      // Create authenticated customer session
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email
      };

      // Save session and redirect to home page
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err.message);
          return res.status(500).send('Unable to complete login.');
        }

        return res.redirect('/');
      });
    });

  } catch (error) {
    console.error('OTP verification error:', error.code || error.message);

    return renderError('Unable to verify OTP. Please try again.');
  }
};

// ==========================================
// LOGOUT
// ==========================================
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};

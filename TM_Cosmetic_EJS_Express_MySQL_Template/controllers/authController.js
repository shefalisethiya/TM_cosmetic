const bcrypt = require('bcryptjs');
const db = require('../config/db');

exports.showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Sign In | TM Cosmetic', error: null, email: '' });
};

exports.showSignup = (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/signup', { title: 'Create Account | TM Cosmetic', error: null, name: '', email: '', phone: '' });
};

exports.signup = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const renderError = message => res.status(400).render('auth/signup', {
    title: 'Create Account | TM Cosmetic', error: message, name, email, phone
  });

  if (name.length < 2) return renderError('Please enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return renderError('Please enter a valid email address.');
  if (password.length < 8) return renderError('Password must contain at least 8 characters.');
  if (password !== confirmPassword) return renderError('Passwords do not match.');

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) return renderError('An account with this email already exists. Please sign in.');
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [name, email, phone || null, passwordHash]
    );
    req.session.user = { id: result.insertId, name, email };
    return req.session.save(err => err ? renderError('Account created, but sign-in could not be started. Please sign in.') : res.redirect('/'));
  } catch (error) {
    console.error('Signup error:', error.code || error.message);
    return renderError(error.code === 'ER_NO_SUCH_TABLE'
      ? 'User table is missing. Please import the updated database/tm_cosmetic.sql file.'
      : 'Unable to create your account right now. Please check your database connection.');
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const renderError = message => res.status(400).render('auth/login', { title: 'Sign In | TM Cosmetic', error: message, email });
  if (!email || !password) return renderError('Enter your email and password.');
  try {
    const [rows] = await db.execute('SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return renderError('Incorrect email or password. Please try again.');
    }
    req.session.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    return req.session.save(err => err ? renderError('Unable to start your session. Please try again.') : res.redirect('/'));
  } catch (error) {
    console.error('Login error:', error.code || error.message);
    return renderError(error.code === 'ER_NO_SUCH_TABLE'
      ? 'User table is missing. Please import the updated database/tm_cosmetic.sql file.'
      : 'Unable to sign in right now. Please check your database connection.');
  }
};

exports.logout = (req, res) => req.session.destroy(() => res.redirect('/'));

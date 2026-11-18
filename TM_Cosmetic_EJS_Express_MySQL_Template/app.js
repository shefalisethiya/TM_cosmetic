const db = require('./config/db');
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');

const webRoutes = require('./routes/webRoutes');
// const authRoutes = require('./routes/authRoutes');
// const authApiRoutes = require('./routes/authApiRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  name: 'tmcosmetic.sid',
  secret: process.env.SESSION_SECRET || 'change-this-development-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});
// Make cart item count available in all EJS pages
app.use(async (req, res, next) => {
  res.locals.cartCount = 0;

  if (!req.session.user || !req.session.user.id) {
    return next();
  }

  try {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM cart_items
       WHERE user_id = ?`,
      [req.session.user.id]
    );

    res.locals.cartCount = Number(rows[0].total) || 0;
  } catch (error) {
    console.error('Cart count error:', error);
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Website routes
app.use('/', webRoutes);
// app.use('/', authRoutes);

// REST API routes
// app.use('/api/auth', authApiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`TM Cosmetic running at http://localhost:${PORT}`);
});

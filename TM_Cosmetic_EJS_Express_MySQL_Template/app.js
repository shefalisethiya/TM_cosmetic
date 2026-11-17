require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const webRoutes = require('./routes/webRoutes');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  name: 'tmcosmetic.sid',
  secret: process.env.SESSION_SECRET || 'change-this-development-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use((req, res, next) => { res.locals.currentUser = req.session.user || null; next(); });
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', webRoutes);

app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TM Cosmetic running at http://localhost:${PORT}`));

const express = require('express');
const router = express.Router();
const cart = require('../controllers/cartController');
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}
// Import Store Controller
const {
  home,
  products,
  productDetails
} = require('../controllers/storeController');

// Import Authentication Controller
const auth = require('../controllers/authController');

// ==========================================
// HOME PAGE
// ==========================================
router.get('/', home);

// ==========================================
// CUSTOMER LOGIN
// ==========================================
router.get('/login', auth.showLogin);
router.post('/login', auth.loginWithOTP);

// ==========================================
// OTP VERIFICATION
// ==========================================
router.get('/verify-otp', auth.showVerifyOTP);
router.post('/verify-otp', auth.verifyOTP);

// ==========================================
// CUSTOMER SIGNUP
// ==========================================
router.get('/signup', auth.showSignup);
router.post('/signup', auth.signup);

// ==========================================
// CUSTOMER LOGOUT
// ==========================================
router.post('/logout', auth.logout);

// ==========================================
// PRODUCTS
// ==========================================
router.get('/products', products);
router.get('/products/:id', productDetails);
// CART
router.get('/cart', requireLogin, cart.viewCart);
router.post('/cart/add', requireLogin, cart.addToCart);
router.post('/cart/update/:id', requireLogin, cart.updateCart);
router.post('/cart/remove/:id', requireLogin, cart.removeFromCart);
// ==========================================
// EXPORT ROUTER
// ==========================================
module.exports = router;

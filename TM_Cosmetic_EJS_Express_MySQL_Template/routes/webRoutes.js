
const express = require('express');
const router = express.Router();

// Import controllers
const store = require('../controllers/storeController');
const auth = require('../controllers/authController');
const cart = require('../controllers/cartController');
const checkout = require('../controllers/checkoutController');

// LOGIN MIDDLEWARE
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  next();
}

// CHECK CONTROLLER FUNCTIONS
const controllerFunctions = {
  // Store
  'store.home': store.home,
  'store.products': store.products,
  'store.productDetails': store.productDetails,

  // Authentication
  'auth.showLogin': auth.showLogin,
  'auth.loginWithOTP': auth.loginWithOTP,
  'auth.showVerifyOTP': auth.showVerifyOTP,
  'auth.verifyOTP': auth.verifyOTP,
  'auth.showSignup': auth.showSignup,
  'auth.signup': auth.signup,
  'auth.resendOTP': auth.resendOTP,
  'auth.logout': auth.logout,

  // Cart
  'cart.viewCart': cart.viewCart,
  'cart.addToCart': cart.addToCart,
  'cart.updateCart': cart.updateCart,
  'cart.removeFromCart': cart.removeFromCart,

  // Checkout
  'checkout.showCheckout': checkout.showCheckout,
  'checkout.placeOrder': checkout.placeOrder,
  'checkout.orderSuccess': checkout.orderSuccess
};

const missingFunctions = Object.entries(controllerFunctions)
  .filter(([name, fn]) => typeof fn !== 'function')
  .map(([name]) => name);

if (missingFunctions.length > 0) {
  throw new Error(
    'MISSING CONTROLLER FUNCTIONS: ' + missingFunctions.join(', ')
  );
}

// HOME
router.get('/', store.home);

// CUSTOMER LOGIN
router.get('/login', auth.showLogin);
router.post('/login', auth.loginWithOTP);

// OTP VERIFICATION
router.get('/verify-otp', auth.showVerifyOTP);
router.post('/verify-otp', auth.verifyOTP);
router.post('/resend-otp', auth.resendOTP);

// CUSTOMER SIGNUP
router.get('/signup', auth.showSignup);
router.post('/signup', auth.signup);

// LOGOUT
router.post('/logout', requireLogin, auth.logout);

// PRODUCTS
router.get('/products', store.products);
router.get('/products/:id', store.productDetails);

// CART
router.get('/cart', requireLogin, cart.viewCart);
router.post('/cart/add', requireLogin, cart.addToCart);
router.post('/cart/update/:id', requireLogin, cart.updateCart);
router.post('/cart/remove/:id', requireLogin, cart.removeFromCart);

// CHECKOUT
router.get('/checkout', requireLogin, checkout.showCheckout);
router.post('/checkout', requireLogin, checkout.placeOrder);

// ORDER SUCCESS
router.get('/order-success/:id', requireLogin, checkout.orderSuccess);

module.exports = router;

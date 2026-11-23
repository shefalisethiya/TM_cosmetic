
const express = require('express');
const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================
const store = require('../controllers/storeController');
const auth = require('../controllers/authController');
const cart = require('../controllers/cartController');
const checkout = require('../controllers/checkoutController');
const superAdmin = require('../controllers/superAdminController');
const product = require('../controllers/productController');

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================
const {
  requireSuperAdmin,
  requireProductManagement
} = require('../middleware/roleMiddleware');

// ==========================================
// LOGIN MIDDLEWARE
// ==========================================
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  next();
}

// ==========================================
// CHECK CONTROLLER FUNCTIONS
// ==========================================
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
  'checkout.orderSuccess': checkout.orderSuccess,

  // Super Admin
  'superAdmin.dashboard': superAdmin.dashboard,
  'superAdmin.staffList': superAdmin.staffList,
  'superAdmin.showCreateStaff': superAdmin.showCreateStaff,
  'superAdmin.createStaff': superAdmin.createStaff,
  'superAdmin.usersList': superAdmin.usersList,
  'superAdmin.showEditUser': superAdmin.showEditUser,
  'superAdmin.updateUser': superAdmin.updateUser,
  'superAdmin.updateUserPermissions': superAdmin.updateUserPermissions,
  'superAdmin.deleteUser': superAdmin.deleteUser,

  // Product Management
  'product.productList': product.productList,
  'product.showAddProduct': product.showAddProduct,
  'product.addProduct': product.addProduct,
  'product.showEditProduct': product.showEditProduct,
  'product.updateProduct': product.updateProduct,
  'product.deleteProduct': product.deleteProduct,
  'product.updateStock': product.updateStock,
  'product.uploadProductImage': product.uploadProductImage
};

// ==========================================
// CHECK MISSING FUNCTIONS
// ==========================================
const missingFunctions = Object.entries(controllerFunctions)
  .filter(([name, fn]) => typeof fn !== 'function')
  .map(([name]) => name);

if (missingFunctions.length > 0) {
  throw new Error(
    'MISSING CONTROLLER FUNCTIONS: ' + missingFunctions.join(', ')
  );
}

// ==========================================
// HOME
// ==========================================
router.get('/', store.home);

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
router.post('/resend-otp', auth.resendOTP);

// ==========================================
// CUSTOMER SIGNUP
// ==========================================
router.get('/signup', auth.showSignup);
router.post('/signup', auth.signup);

// ==========================================
// LOGOUT
// ==========================================
router.post('/logout', requireLogin, auth.logout);

// ==========================================
// PUBLIC PRODUCT BROWSING
// ==========================================
router.get('/products', store.products);
router.get('/products/:id', store.productDetails);

// ==========================================
// CART
// ==========================================
router.get('/cart', requireLogin, cart.viewCart);
router.post('/cart/add', requireLogin, cart.addToCart);
router.post('/cart/update/:id', requireLogin, cart.updateCart);
router.post('/cart/remove/:id', requireLogin, cart.removeFromCart);

// ==========================================
// CHECKOUT
// ==========================================
router.get('/checkout', requireLogin, checkout.showCheckout);
router.post('/checkout', requireLogin, checkout.placeOrder);

// ==========================================
// ORDER SUCCESS
// ==========================================
router.get('/order-success/:id', requireLogin, checkout.orderSuccess);

// ==========================================
// PRODUCT MANAGEMENT
// Super Admin, Admin and Delivery Person
// ==========================================

// View all products
router.get(
  '/manage-products',
  requireProductManagement,
  product.productList
);

// Show Add Product page
router.get(
  '/manage-products/add',
  requireProductManagement,
  product.showAddProduct
);

// Add Product
// IMPORTANT: Multer must run before addProduct
router.post(
  '/manage-products/add',
  requireProductManagement,
  product.uploadProductImage,
  product.addProduct
);

// Show Edit Product page
router.get(
  '/manage-products/:id/edit',
  requireProductManagement,
  product.showEditProduct
);

// Update Product
// IMPORTANT: Multer must run before updateProduct
router.post(
  '/manage-products/:id/update',
  requireProductManagement,
  product.uploadProductImage,
  product.updateProduct
);

// Delete Product
router.post(
  '/manage-products/:id/delete',
  requireProductManagement,
  product.deleteProduct
);

// Update Product Stock
router.post(
  '/manage-products/:id/stock',
  requireProductManagement,
  product.updateStock
);

// ==========================================
// SUPER ADMIN DASHBOARD
// ==========================================
router.get(
  '/super-admin/dashboard',
  requireSuperAdmin,
  superAdmin.dashboard
);

// ==========================================
// SUPER ADMIN STAFF MANAGEMENT
// ==========================================

// Staff List
router.get(
  '/super-admin/staff',
  requireSuperAdmin,
  superAdmin.staffList
);

// Show Create Staff Page
router.get(
  '/super-admin/staff/create',
  requireSuperAdmin,
  superAdmin.showCreateStaff
);

// Create Staff
router.post(
  '/super-admin/staff/create',
  requireSuperAdmin,
  superAdmin.createStaff
);

// ==========================================
// SUPER ADMIN USER MANAGEMENT
// ==========================================

// View Users by Category
router.get(
  '/super-admin/users/:type',
  requireSuperAdmin,
  superAdmin.usersList
);

// Edit User Page
router.get(
  '/super-admin/users/:id/edit',
  requireSuperAdmin,
  superAdmin.showEditUser
);

// Update User
router.post(
  '/super-admin/users/:id/update',
  requireSuperAdmin,
  superAdmin.updateUser
);

// Update Individual User Permissions
router.post(
  '/super-admin/users/:id/permissions',
  requireSuperAdmin,
  superAdmin.updateUserPermissions
);

// Delete User
router.post(
  '/super-admin/users/:id/delete',
  requireSuperAdmin,
  superAdmin.deleteUser
);

// ==========================================
// EXPORT ROUTER
// ==========================================
module.exports = router;

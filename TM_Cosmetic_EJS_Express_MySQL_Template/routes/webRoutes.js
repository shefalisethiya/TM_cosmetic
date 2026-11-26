
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
const admin = require('../controllers/adminController');
const delivery = require('../controllers/deliveryController');
const b2c = require('../controllers/b2cController');
const b2b = require('../controllers/b2bController');

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================
const {
  requireLogin,
  requireSuperAdmin,
  requireAdmin,
  requireDelivery,
  requireProductManagement,
  requireB2C,
  requireB2B
} = require('../middleware/roleMiddleware');

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
  'auth.resendOTP': auth.resendOTP,
  'auth.showSignup': auth.showSignup,
  'auth.signup': auth.signup,
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
  'product.uploadProductImage': product.uploadProductImage,

  // Admin
  'admin.dashboard': admin.dashboard,
  'admin.orderList': admin.orderList,
  'admin.assignDelivery': admin.assignDelivery,

  // Delivery Person
  'delivery.dashboard': delivery.dashboard,
  'delivery.updateStatus': delivery.updateStatus,

  // B2C Customer
  'b2c.dashboard': b2c.dashboard,

  // B2B Customer
  'b2b.dashboard': b2b.dashboard,
  'b2b.orders': b2b.orders
};

// ==========================================
// CHECK MISSING CONTROLLER FUNCTIONS
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
router.get(
  '/order-success/:id',
  requireLogin,
  checkout.orderSuccess
);

// ==========================================
// PRODUCT MANAGEMENT
// Super Admin, Admin and Delivery Person
// ==========================================
router.get(
  '/manage-products',
  requireProductManagement,
  product.productList
);

router.get(
  '/manage-products/add',
  requireProductManagement,
  product.showAddProduct
);

router.post(
  '/manage-products/add',
  requireProductManagement,
  product.uploadProductImage,
  product.addProduct
);

router.get(
  '/manage-products/:id/edit',
  requireProductManagement,
  product.showEditProduct
);

router.post(
  '/manage-products/:id/update',
  requireProductManagement,
  product.uploadProductImage,
  product.updateProduct
);

router.post(
  '/manage-products/:id/delete',
  requireProductManagement,
  product.deleteProduct
);

router.post(
  '/manage-products/:id/stock',
  requireProductManagement,
  product.updateStock
);

// ==========================================
// SUPER ADMIN DASHBOARD
// Role ID 1, User ID 1 only
// ==========================================
router.get(
  '/super-admin/dashboard',
  requireSuperAdmin,
  superAdmin.dashboard
);

// ==========================================
// SUPER ADMIN STAFF MANAGEMENT
// ==========================================
router.get(
  '/super-admin/staff',
  requireSuperAdmin,
  superAdmin.staffList
);

router.get(
  '/super-admin/staff/create',
  requireSuperAdmin,
  superAdmin.showCreateStaff
);

router.post(
  '/super-admin/staff/create',
  requireSuperAdmin,
  superAdmin.createStaff
);

// ==========================================
// SUPER ADMIN USER MANAGEMENT
// ==========================================
router.get(
  '/super-admin/users/:type',
  requireSuperAdmin,
  superAdmin.usersList
);

router.get(
  '/super-admin/users/:id/edit',
  requireSuperAdmin,
  superAdmin.showEditUser
);

router.post(
  '/super-admin/users/:id/update',
  requireSuperAdmin,
  superAdmin.updateUser
);

router.post(
  '/super-admin/users/:id/permissions',
  requireSuperAdmin,
  superAdmin.updateUserPermissions
);

router.post(
  '/super-admin/users/:id/delete',
  requireSuperAdmin,
  superAdmin.deleteUser
);

// ==========================================
// ADMIN DASHBOARD
// Role ID 1 and 5
// ==========================================
router.get(
  '/admin/dashboard',
  requireAdmin,
  admin.dashboard
);

// ==========================================
// ADMIN ORDER MANAGEMENT
// Role ID 1 and 5
// ==========================================
router.get(
  '/admin/orders',
  requireAdmin,
  admin.orderList
);

router.post(
  '/admin/orders/:id/assign',
  requireAdmin,
  admin.assignDelivery
);

// ==========================================
// DELIVERY PERSON DASHBOARD
// Role ID 4 only
// ==========================================
router.get(
  '/delivery/dashboard',
  requireDelivery,
  delivery.dashboard
);

// ==========================================
// DELIVERY PERSON ORDER STATUS UPDATE
// Role ID 4 only
// ==========================================
router.post(
  '/delivery/orders/:id/status',
  requireDelivery,
  delivery.updateStatus
);

// ==========================================
// B2B CUSTOMER DASHBOARD
// Role ID 2 only
// ==========================================
router.get(
  '/b2b/dashboard',
  requireB2B,
  b2b.dashboard
);

// ==========================================
// B2B CUSTOMER ORDERS
// Role ID 2 only
// ==========================================
router.get(
  '/b2b/orders',
  requireB2B,
  b2b.orders
);

// ==========================================
// B2C CUSTOMER DASHBOARD
// Role ID 3 only
// ==========================================
router.get(
  '/b2c/dashboard',
  requireB2C,
  b2c.dashboard
);

// ==========================================
// EXPORT ROUTER
// ==========================================
module.exports = router;

const express = require('express');
const router = express.Router();
const { home, products, productDetails } = require('../controllers/storeController');
const auth = require('../controllers/authController');

router.get('/', home);
router.get('/login', auth.showLogin);
router.post('/login', auth.login);
router.get('/signup', auth.showSignup);
router.post('/signup', auth.signup);
router.post('/logout', auth.logout);
router.get('/products', products);
router.get('/products/:id', productDetails);

module.exports = router;
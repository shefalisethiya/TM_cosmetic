const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

// Customer Signup API
router.post("/signup", authController.signup);

// Customer Login - Verify email and password, then send OTP
router.post("/login", authController.loginWithOTP);

// Verify 4-digit OTP
router.post("/verify-otp", authController.verifyOTP);

// Resend OTP
router.post("/resend-otp", authController.resendOTP);

module.exports = router;
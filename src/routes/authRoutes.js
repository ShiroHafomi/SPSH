/**
 * Auth Routes — Login, Register, Logout, and Admin user management.
 */
const express = require('express');
const {
  registerForm,
  register,
  loginForm,
  login,
  logout,
  listUsers,
  deleteUser,
} = require('../controllers/authController');
const { requireAuth, redirectIfAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Registration (redirect if already logged in)
router.get('/register', redirectIfAuth, registerForm);
router.post('/register', redirectIfAuth, register);

// Login (redirect if already logged in)
router.get('/login', redirectIfAuth, loginForm);
router.post('/login', redirectIfAuth, login);

// Logout (must be logged in)
router.post('/logout', requireAuth, logout);

// Admin: user management
router.get('/admin/users', requireAuth, requireAdmin, listUsers);
router.post('/admin/users/:id/delete', requireAuth, requireAdmin, deleteUser);

module.exports = router;
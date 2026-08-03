/**
 * Auth Controller — handles registration, login, logout, and user management.
 */
const authService = require('../services/authService');

/** GET /register — show registration form */
async function registerForm(req, res) {
  res.render('auth/register', {
    title: 'Register',
    errors: null,
    form: {},
  });
}

/** POST /register — create a new user account */
async function register(req, res) {
  const { name, email, password, confirm_password } = req.body;
  const form = { name, email };
  const errors = [];

  // --- Validation ---
  if (!name || name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Name must be between 2 and 100 characters.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }
  if (password !== confirm_password) {
    errors.push('Passwords do not match.');
  }

  if (errors.length) {
    return res.status(400).render('auth/register', {
      title: 'Register',
      errors,
      form,
    });
  }

  // --- Check duplicate email ---
  try {
    const exists = await authService.emailExists(email);
    if (exists) {
      return res.status(409).render('auth/register', {
        title: 'Register',
        errors: ['An account with this email already exists.'],
        form,
      });
    }
  } catch (err) {
    console.error('[register] email check error:', err);
    return res.status(500).render('auth/register', {
      title: 'Register',
      errors: ['Something went wrong. Please try again.'],
      form,
    });
  }

  // --- Create user ---
  try {
    const user = await authService.registerUser({ email, password, name: name.trim() });
    req.session.userId = user.id;
    res.redirect('/?success=Account+created+successfully!');
  } catch (err) {
    console.error('[register]', err);
    res.status(500).render('auth/register', {
      title: 'Register',
      errors: ['Failed to create account. Please try again.'],
      form,
    });
  }
}

/** GET /login — show login form */
async function loginForm(req, res) {
  res.render('auth/login', {
    title: 'Login',
    errors: null,
    form: {},
  });
}

/** POST /login — authenticate user */
async function login(req, res) {
  const { email, password } = req.body;
  const form = { email };

  if (!email || !password) {
    return res.status(400).render('auth/login', {
      title: 'Login',
      errors: ['Email and password are required.'],
      form,
    });
  }

  try {
    const user = await authService.loginUser({ email, password });
    if (!user) {
      return res.status(401).render('auth/login', {
        title: 'Login',
        errors: ['Invalid email or password.'],
        form,
      });
    }

    req.session.userId = user.id;
    res.redirect('/?success=Welcome+back,+' + encodeURIComponent(user.name) + '!');
  } catch (err) {
    console.error('[login]', err);
    res.status(500).render('auth/login', {
      title: 'Login',
      errors: ['Something went wrong. Please try again.'],
      form,
    });
  }
}

/** POST /logout — destroy session */
async function logout(req, res) {
  req.session.destroy((err) => {
    if (err) console.error('[logout]', err);
    res.redirect('/login?success=You+have+been+logged+out.');
  });
}

/** GET /admin/users — list all users (admin only) */
async function listUsers(req, res) {
  try {
    const users = await authService.listUsers();
    res.render('admin/users', {
      title: 'Manage Users',
      users,
    });
  } catch (err) {
    console.error('[listUsers]', err);
    res.status(500).render('error', {
      title: 'Server Error',
      message: 'Failed to load users.',
      backLink: '/',
    });
  }
}

/** POST /admin/users/:id/delete — delete a user (admin only) */
async function deleteUser(req, res) {
  const id = parseInt(req.params.id, 10);

  // Prevent self-deletion
  if (id === req.session.userId) {
    return res.status(400).render('error', {
      title: 'Bad Request',
      message: 'You cannot delete your own account.',
      backLink: '/admin/users',
    });
  }

  try {
    const affected = await authService.deleteUser(id);
    if (affected === 0) {
      return res.status(400).render('error', {
        title: 'Cannot Delete',
        message: 'User not found or cannot be deleted (admin accounts are protected).',
        backLink: '/admin/users',
      });
    }
    res.redirect('/admin/users?deleted=1');
  } catch (err) {
    console.error('[deleteUser]', err);
    res.status(500).render('error', {
      title: 'Server Error',
      message: 'Failed to delete user.',
      backLink: '/admin/users',
    });
  }
}

module.exports = { registerForm, register, loginForm, login, logout, listUsers, deleteUser };
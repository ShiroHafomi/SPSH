/**
 * App Initialization — registers routes, manages navbar, starts router.
 */

// ─── Auth Helper ─────────────────────────────────────────────────────────────

/**
 * Fetch the current user from /api/me.
 * Returns the user object or null if not authenticated.
 */
async function getCurrentUser() {
  try {
    const data = await API.get('/me');
    return data.user || null;
  } catch {
    return null;
  }
}

/**
 * Store the current user in a global so views can access it without re-fetching.
 */
let _currentUser = null;

async function refreshCurrentUser() {
  _currentUser = await getCurrentUser();
  return _currentUser;
}

function currentUser() {
  return _currentUser;
}

// ─── Navbar Rendering ────────────────────────────────────────────────────────

/**
 * Render the navigation bar based on auth state.
 * Called after login/logout and on initial page load.
 */
function renderNavbar(user) {
  const links = document.getElementById('nav-links');
  const right = document.getElementById('nav-right');

  if (user) {
    // Authenticated nav links
    links.innerHTML = `
      <a href="#/dashboard" class="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors">Dashboard</a>
      <a href="#/students" class="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors">Students</a>
    `;

    // Right side: user info
    right.innerHTML = `
      <span class="hidden sm:inline text-sm text-gray-600">
        ${escapeHtml(user.name)}
        ${user.role === 'admin' ? '<span class="text-xs text-warning-600 font-medium ml-1">Admin</span>' : ''}
      </span>
      ${user.role === 'admin'
        ? `<a href="#/admin/users" class="hidden sm:inline-block px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">Manage Users</a>`
        : ''}
      <button onclick="handleLogout()" class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
        Logout
      </button>
    `;
  } else {
    // Unauthenticated — show minimal nav
    links.innerHTML = '';

    right.innerHTML = `
      <a href="#/login" class="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors">Login</a>
      <a href="#/register" class="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
        Register
      </a>
    `;
  }
}

/**
 * Logout handler — calls API, updates navbar, redirects.
 */
async function handleLogout() {
  try {
    await API.post('/auth/logout');
  } catch (err) {
    console.error('Logout error:', err);
  }
  _currentUser = null;
  renderNavbar(null);
  Router.navigate('#/login');
}

/**
 * Check auth on page load. If not authenticated, redirect to login.
 * Returns the user if authenticated.
 */
async function requireAuth() {
  const user = await refreshCurrentUser();
  if (!user) {
    Router.navigate('#/login');
    return null;
  }
  return user;
}

/**
 * Simple HTML escaping for user-generated content.
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Show a flash message at the top of the content area.
 */
function showFlash(message, type = 'success') {
  const container = document.getElementById('app-content');
  const colors = {
    success: 'bg-success-50 border-success-200 text-success-700',
    error: 'bg-danger-50 border-danger-200 text-danger-700',
    info: 'bg-primary-50 border-primary-200 text-primary-700',
    warning: 'bg-warning-50 border-warning-200 text-warning-700',
  };
  const flashDiv = document.createElement('div');
  flashDiv.className = `mb-6 p-4 border rounded-lg flex items-center justify-between ${colors[type] || colors.info} animate-slide-in`;
  flashDiv.setAttribute('role', 'alert');
  flashDiv.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="opacity-60 hover:opacity-100 cursor-pointer" aria-label="Dismiss">&times;</button>
  `;
  container.insertBefore(flashDiv, container.firstChild);
  // Auto-dismiss after 5 seconds
  setTimeout(() => { if (flashDiv.parentElement) flashDiv.remove(); }, 5000);
}

// ─── Route Registration ──────────────────────────────────────────────────────

Router.register('/', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  return renderDashboard(container, user);
});
Router.register('/dashboard', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  return renderDashboard(container, user);
});
Router.register('/login', async (container, params) => {
  return renderLogin(container);
});
Router.register('/register', async (container, params) => {
  return renderRegister(container);
});
Router.register('/students', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  return renderStudents(container);
});
Router.register('/students/new', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  return renderStudentForm(container, null);
});
Router.register('/students/:id/edit', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  return renderStudentForm(container, params.id);
});
Router.register('/admin/users', async (container, params) => {
  const user = await requireAuth();
  if (!user) return;
  if (user.role !== 'admin') {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">Access denied. Admin only.</div>';
    return;
  }
  return renderAdminUsers(container);
});

// ─── Boot ────────────────────────────────────────────────────────────────────

(async function boot() {
  // Check auth state
  const user = await refreshCurrentUser();
  renderNavbar(user);

  // Start the router
  Router.init();
})();
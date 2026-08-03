/**
 * Login View — email + password form with loading state and error handling.
 */
async function renderLogin(container) {
  container.innerHTML = `
    <div class="min-h-[70vh] flex items-center justify-center px-4">
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full">
        <div class="text-center mb-8">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
            <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">Welcome Back</h1>
          <p class="text-sm text-gray-500 mt-1">Sign in to access your dashboard</p>
        </div>

        <div id="login-error" class="mb-6 hidden" role="alert"></div>

        <form id="login-form" class="space-y-5" novalidate>
          <div class="grid gap-2">
            <label for="login-email" class="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              id="login-email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <div class="grid gap-2">
            <label for="login-password" class="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              id="login-password"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <button
            id="login-submit"
            type="submit"
            class="w-full py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            Sign In
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          Don't have an account?
          <a href="#/register" class="text-primary-600 hover:text-primary-700 font-medium transition-colors">Register</a>
        </p>
      </div>
    </div>
  `;

  // ─── Form Handler ───────────────────────────────────────────────────────
  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('login-submit');
  const errorDiv = document.getElementById('login-error');

  function showError(msg) {
    errorDiv.className = 'mb-6 p-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg flex items-center justify-between';
    errorDiv.innerHTML = `
      <span>${escapeHtml(msg)}</span>
      <button onclick="this.parentElement.remove()" class="text-danger-500 hover:text-danger-700 cursor-pointer" aria-label="Dismiss">&times;</button>
    `;
  }

  function hideError() {
    errorDiv.className = 'mb-6 hidden';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showError('Email and password are required.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const data = await API.post('/auth/login', { email, password });
      // Update global auth state
      _currentUser = data.user;
      renderNavbar(data.user);
      Router.navigate('#/dashboard');
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}
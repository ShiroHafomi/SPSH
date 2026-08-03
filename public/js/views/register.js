/**
 * Register View — full name + email + password + confirm form.
 * First user registered becomes admin.
 */
async function renderRegister(container) {
  container.innerHTML = `
    <div class="min-h-[70vh] flex items-center justify-center px-4">
      <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full">
        <div class="text-center mb-8">
          <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-success-100 flex items-center justify-center">
            <svg class="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">Create Account</h1>
          <p class="text-sm text-gray-500 mt-1">The first user gets admin privileges</p>
        </div>

        <div id="reg-error" class="mb-6 hidden" role="alert"></div>

        <form id="reg-form" class="space-y-5" novalidate>
          <div class="grid gap-2">
            <label for="reg-name" class="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              name="name"
              id="reg-name"
              required
              autocomplete="name"
              placeholder="Your full name"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <div class="grid gap-2">
            <label for="reg-email" class="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              id="reg-email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <div class="grid gap-2">
            <label for="reg-password" class="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              id="reg-password"
              required
              autocomplete="new-password"
              placeholder="At least 6 characters"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <div class="grid gap-2">
            <label for="reg-confirm" class="block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type="password"
              name="confirm_password"
              id="reg-confirm"
              required
              autocomplete="new-password"
              placeholder="Repeat your password"
              class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            >
          </div>

          <button
            id="reg-submit"
            type="submit"
            class="w-full py-2.5 bg-success-600 text-white font-medium rounded-lg hover:bg-success-700 focus:outline-none focus:ring-2 focus:ring-success-500 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            Create Account
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          Already have an account?
          <a href="#/login" class="text-primary-600 hover:text-primary-700 font-medium transition-colors">Sign in</a>
        </p>
      </div>
    </div>
  `;

  // ─── Form Handler ───────────────────────────────────────────────────────
  const form = document.getElementById('reg-form');
  const submitBtn = document.getElementById('reg-submit');
  const errorDiv = document.getElementById('reg-error');

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

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    // Client-side validation
    if (!name || name.length < 2) {
      showError('Name must be at least 2 characters.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      const data = await API.post('/auth/register', { name, email, password, confirm_password: confirm });
      _currentUser = data.user;
      renderNavbar(data.user);
      Router.navigate('#/dashboard');
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
}
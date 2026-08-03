/**
 * SPA Router — hash-based routing for the frontend.
 * Maps URL hashes to view render functions.
 */
const Router = (() => {
  const routes = [];
  let currentCleanup = null;

  /**
   * Register a route pattern.
   * Pattern can have :param segments, e.g. #/students/:id/edit
   */
  function register(pattern, renderFn) {
    // Convert pattern to regex, capturing named params
    const paramNames = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp('^' + regexStr + '$');
    routes.push({ pattern, regex, paramNames, renderFn });
  }

  /**
   * Navigate to a hash path.
   */
  function navigate(hash) {
    window.location.hash = hash;
  }

  /**
   * Get the current hash (strip leading #).
   */
  function getHash() {
    return (window.location.hash || '#/').slice(1) || '/';
  }

  /**
   * Match the current hash against registered routes.
   * Returns { renderFn, params } or null.
   */
  function match(hash) {
    for (const route of routes) {
      const m = hash.match(route.regex);
      if (m) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(m[i + 1]);
        });
        return { renderFn: route.renderFn, params, pattern: route.pattern };
      }
    }
    return null;
  }

  /**
   * Render the current route.
   */
  async function render() {
    // Clean up previous view
    if (currentCleanup && typeof currentCleanup === 'function') {
      currentCleanup();
      currentCleanup = null;
    }

    const hash = getHash();
    const matched = match(hash);
    const container = document.getElementById('app-content');

    if (!matched) {
      container.innerHTML = `
        <div class="flex min-h-[60vh] items-center justify-center px-4">
          <div class="text-center">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">404</h1>
            <p class="text-gray-600 mb-4">Page not found.</p>
            <a href="#/dashboard" class="text-primary-600 hover:text-primary-700 font-medium">← Go to Dashboard</a>
          </div>
        </div>
      `;
      return;
    }

    try {
      const cleanup = await matched.renderFn(container, matched.params);
      currentCleanup = typeof cleanup === 'function' ? cleanup : null;
    } catch (err) {
      console.error('[Router] Render error:', err);
      container.innerHTML = `
        <div class="flex min-h-[60vh] items-center justify-center px-4">
          <div class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-danger-100 flex items-center justify-center">
              <svg class="w-8 h-8 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/>
              </svg>
            </div>
            <h1 class="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p class="text-gray-600 mb-4">${err.message || 'An unexpected error occurred.'}</p>
            <button onclick="Router.navigate('#/dashboard')" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium">
              Go to Dashboard
            </button>
          </div>
        </div>
      `;
    }
  }

  /**
   * Initialize the router — listen for hash changes and render on load.
   */
  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { register, navigate, init, render };
})();
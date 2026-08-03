/**
 * API Client — fetch wrapper for the SPA frontend.
 * Handles JSON parsing, 401 redirect, and error normalization.
 */
const API = (() => {
  const BASE = '/api';

  /**
   * Make a fetch request to the API.
   * Returns parsed JSON on success.
   * On 401, redirects to login page.
   * On error, throws with the server's error message.
   */
  async function request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin', // sends session cookie
    };

    if (body && method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (err) {
      throw new Error('Network error — please check your connection.');
    }

    // Handle 401 — not authenticated
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      window.location.hash = '#/login';
      // Small delay so the hash change registers before throwing
      await new Promise(r => setTimeout(r, 50));
      throw new Error(data.error || 'Please log in first.');
    }

    // Handle other non-OK statuses
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.errors?.[0] || `Request failed (${res.status})`);
    }

    return res.json();
  }

  return {
    get(path)       { return request('GET', path); },
    post(path, b)   { return request('POST', path, b); },
    del(path)       { return request('DELETE', path); },
  };
})();
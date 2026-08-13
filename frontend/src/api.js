const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

async function handleResponse(response, { redirectOnUnauthorized = true } = {}) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    let message = response.status === 401
      ? 'Unauthorized. Please log in first.'
      : 'Something went wrong. Please try again.';
    let errors = [];

    if (isJson) {
      try {
        const data = await response.json();
        message = data.error || message;
        errors = data.errors || (data.error ? [data.error] : []);
      } catch {
        // Ignore JSON parse errors
      }
    }

    if (response.status === 401 && redirectOnUnauthorized) {
      // Use React Router navigation instead of a full-page reload.
      if (navigateRef) {
        navigateRef('/login', { replace: true });
      } else {
        window.location.href = '/login';
      }
    }

    throw new ApiError(message, response.status, errors);
  }

  if (isJson) {
    return response.json();
  }

  return response.text();
}

function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  return headers;
}

let navigateRef = null;

export function setNavigate(navigate) {
  navigateRef = navigate;
}

export const api = {
  async get(path, options) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response, options);
  },

  async post(path, body, options) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return handleResponse(response, options);
  },

  async delete(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async put(path, body) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },
};

export { ApiError };
const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

async function handleResponse(response) {
  if (response.status === 401) {
    // Clear any stored auth state
    window.location.href = '/login';
    throw new ApiError('Unauthorized. Please log in first.', 401);
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
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

export const api = {
  async get(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'same-origin',
    });
    return handleResponse(response);
  },

  async post(path, body) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  async delete(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'same-origin',
    });
    return handleResponse(response);
  },
};

export { ApiError };
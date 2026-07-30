import API from './axios';

/**
 * Log in and obtain JWT tokens.
 */
export async function login(username, password) {
  const res = await API.post('/auth/login/', { username, password });
  return res.data; // { access, refresh }
}

/**
 * Ping the health-check endpoint (public).
 */
export async function checkHealth() {
  const res = await API.get('/health/');
  return res.data;
}

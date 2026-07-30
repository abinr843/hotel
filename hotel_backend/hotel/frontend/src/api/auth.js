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

/**
 * Check if the system needs initial admin setup (public).
 */
export async function checkSetupStatus() {
  const res = await API.get('/setup-status/');
  return res.data; // { needs_setup: boolean }
}

/**
 * One-time admin registration (public, only works when no admin exists).
 */
export async function registerAdmin(username, password, email = '') {
  const res = await API.post('/setup/', { username, password, email });
  return res.data;
}

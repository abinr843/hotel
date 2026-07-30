import axios from 'axios';

let baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
if (!baseURL.endsWith('/')) {
  baseURL += '/';
}

const API = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Callback to programmatically mark the app as offline.
 * Set by NetworkContext via `setNetworkErrorCallback()`.
 */
let _onNetworkError = null;
let _onNetworkRecovered = null;

/**
 * Called by NetworkContext to wire up the offline callback.
 * This bridges the gap between the Axios module and React context.
 */
export function setNetworkErrorCallback(onError, onRecovered) {
  _onNetworkError = onError;
  _onNetworkRecovered = onRecovered;
}

/**
 * Request interceptor — attach JWT access token from localStorage.
 */
API.interceptors.request.use(
  (config) => {
    // Fix absolute path resolution issue in Axios when baseURL is a full URL
    if (config.url && config.url.startsWith('/')) {
      config.url = config.url.substring(1);
    }
    
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor — handle 401 by attempting token refresh,
 * and detect network errors to trigger offline state.
 */
API.interceptors.response.use(
  (response) => {
    // A successful response means the server is reachable
    if (_onNetworkRecovered) _onNetworkRecovered();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // --- Network Error Detection ---
    // If there's no response at all, it's a network-level failure
    // (server unreachable, DNS failure, CORS block, etc.)
    if (!error.response) {
      if (_onNetworkError) _onNetworkError();
      return Promise.reject(error);
    }

    // --- Token Refresh on 401 ---
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const res = await axios.post(
            `${import.meta.env.VITE_API_BASE_URL || '/api'}/auth/refresh/`,
            { refresh: refreshToken }
          );
          const newAccess = res.data.access;
          localStorage.setItem('access_token', newAccess);
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return API(originalRequest);
        } catch (refreshError) {
          // Refresh failed — clear tokens and redirect
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default API;

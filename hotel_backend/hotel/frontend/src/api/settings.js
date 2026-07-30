import API from './axios';

/**
 * Fetch global store settings (UPI info, Admin PIN presence).
 * @returns {object} { upi_id, upi_payee_name, has_admin_pin }
 */
export async function getSettings() {
  const res = await API.get('/settings/');
  return res.data;
}

/**
 * Update global store settings and/or Admin PIN.
 * @param {object} data { upi_id, upi_payee_name, admin_pin (optional) }
 * @returns {object} updated settings + message
 */
export async function updateSettings(data) {
  const res = await API.post('/settings/', data);
  return res.data;
}

import API from './axios';

/**
 * Order / Cart API operations.
 */

/** Create a new DRAFT order. */
export async function createDraftOrder() {
  const res = await API.post('/orders/create-draft/');
  return res.data;
}

/** Retrieve full order state (with nested items). */
export async function getOrder(orderId) {
  const res = await API.get(`/orders/${orderId}/`);
  return res.data;
}

/**
 * List orders, optionally filtered by status and date.
 * @param {object} params - { status?: string, date?: 'today'|'all'|'YYYY-MM-DD' }
 */
export async function listOrders(params = {}) {
  const res = await API.get('/orders/', { params });
  return res.data;
}

/**
 * Unified cart action endpoint.
 * @param {number} orderId
 * @param {'add'|'update'|'remove'} action
 * @param {object} payload - { menu_item_id?, order_item_id?, quantity?, special_instructions?, snapshot_rate? }
 * @returns {object} Full updated order
 */
export async function cartAction(orderId, action, payload = {}) {
  const res = await API.post(`/orders/${orderId}/cart/`, {
    action,
    ...payload,
  });
  return res.data;
}

/**
 * Finalize a DRAFT order to COMPLETED.
 * @param {number} orderId
 * @param {object} paymentData - { payment_method: 'CASH'|'UPI'|'CARD', cash_tendered?: number }
 * @returns {object} Full completed order
 */
export async function checkoutOrder(orderId, paymentData) {
  const res = await API.post(`/orders/${orderId}/checkout/`, paymentData);
  return res.data;
}

/**
 * Void a COMPLETED order (PIN-gated).
 * @param {number} orderId
 * @param {string} pin - Admin void PIN
 * @param {string} reason - Reason for voiding
 * @returns {object} Full voided order
 */
export async function voidOrder(orderId, pin, reason) {
  const res = await API.post(`/orders/${orderId}/void/`, { pin, reason });
  return res.data;
}

/**
 * Fetch daily analytics (revenue, top items, excludes voided).
 * @param {string} [date] - Optional date in YYYY-MM-DD format (defaults to today)
 */
export async function getAnalytics(date) {
  const params = date ? { date } : {};
  const res = await API.get('/analytics/', { params });
  return res.data;
}

/**
 * Get the UPI deep-link string for a draft/completed order.
 * @param {number} orderId 
 * @returns {object} { deep_link, upi_id, payee_name, amount, transaction_ref }
 */
export async function getUpiLink(orderId) {
  const res = await API.get(`/orders/${orderId}/upi-link/`);
  return res.data;
}

/**
 * Get food ranking (all items ranked by 24hr sales).
 */
export async function getFoodRanking() {
  const res = await API.get('/analytics/food-ranking/');
  return res.data;
}

/**
 * Create a new EOD settlement.
 * @param {object} data { physical_cash_counted, notes }
 */
export async function createSettlement(data) {
  const res = await API.post('/settlements/', data);
  return res.data;
}

/**
 * List past settlements.
 */
export async function listSettlements() {
  const res = await API.get('/settlements/');
  return res.data;
}

/**
 * Download the settlement PDF.
 * @param {number} settlementId
 */
export async function downloadSettlementPdf(settlementId) {
  const res = await API.get(`/settlements/${settlementId}/pdf/`, {
    responseType: 'blob',
  });
  // Trigger browser download
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `settlement_${settlementId}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Preview the current unsettled shift totals (read-only, no side effects).
 * @returns {object} { system_cash_total, system_upi_total, unsettled_order_count }
 */
export async function previewSettlement() {
  const res = await API.get('/settlements/preview/');
  return res.data;
}

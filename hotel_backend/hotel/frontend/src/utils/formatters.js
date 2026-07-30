/**
 * Currency and general formatting helpers.
 */

/**
 * Formats a numeric value as Indian Rupees (₹).
 * @param {number|string} value - The value to format.
 * @returns {string} Formatted string like "₹120.00"
 */
export function formatRupee(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a Date object or ISO string to a human-readable local string.
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

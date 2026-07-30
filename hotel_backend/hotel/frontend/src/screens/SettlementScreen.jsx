import { useState, useEffect } from 'react';
import { createSettlement, listSettlements, downloadSettlementPdf, previewSettlement } from '../api/orders';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import { formatRupee } from '../utils/formatters';
import './SettlementScreen.css';

export default function SettlementScreen() {
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [settlements, setSettlements] = useState([]);
  const [physicalCash, setPhysicalCash] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);

  // Preview state (system totals before settlement)
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  // Blind Drop: system totals are hidden until the cashier submits
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setPreviewLoading(true);
    try {
      const [previewData, historyData] = await Promise.all([
        previewSettlement(),
        listSettlements(),
      ]);
      setPreview(previewData);
      setSettlements(Array.isArray(historyData) ? historyData : historyData.results || []);
    } catch (err) {
      console.error('Failed to load settlement data', err);
    } finally {
      setLoading(false);
      setPreviewLoading(false);
    }
  };

  const hasUnsettledOrders = preview && preview.unsettled_order_count > 0;

  const handleSettle = async (e) => {
    e.preventDefault();
    setError('');
    setLastResult(null);

    if (!physicalCash || parseFloat(physicalCash) < 0) {
      setError('Please enter a valid physical cash amount.');
      return;
    }

    setSettling(true);
    try {
      const result = await createSettlement({
        physical_cash_counted: physicalCash,
        notes,
      });
      setLastResult(result);
      setSettled(true);
      setPhysicalCash('');
      setNotes('');
      // Refresh preview and history
      const [previewData, historyData] = await Promise.all([
        previewSettlement(),
        listSettlements(),
      ]);
      setPreview(previewData);
      setSettlements(Array.isArray(historyData) ? historyData : historyData.results || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Settlement failed. There may be no unsettled orders.');
    } finally {
      setSettling(false);
    }
  };

  const handleNewShift = () => {
    setSettled(false);
    setLastResult(null);
    setError('');
  };

  const handleDownloadPdf = async (id) => {
    try {
      await downloadSettlementPdf(id);
    } catch (err) {
      console.error('PDF download failed', err);
    }
  };

  const getDiscClass = (val) => {
    const num = parseFloat(val);
    if (num === 0) return 'disc-match';
    return num > 0 ? 'disc-surplus' : 'disc-shortage';
  };

  const getDiscLabel = (val) => {
    const num = parseFloat(val);
    if (num === 0) return 'Exact Match ✓';
    return num > 0 ? `Surplus (+${formatRupee(num)})` : `Shortage (${formatRupee(num)})`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <div className="settlement-container p-6">
      <div className="settlement-header">
        <h1>💰 Close Shift</h1>
        <p>End the current shift and count your cash.</p>
      </div>

      {/* ─── BLIND DROP: Settlement Result (shown AFTER submit) ─── */}
      {settled && lastResult && (
        <div className="settlement-result result-success">
          <h3>✅ Shift Closed Successfully</h3>
          <p className="locked-notice">
            🔒 All orders from this shift are now permanently locked and cannot be edited.
          </p>
          <div className="result-grid">
            <div className="result-item">
              <span className="result-item-label">System Cash</span>
              <span className="result-item-value">{formatRupee(lastResult.system_cash_total)}</span>
            </div>
            <div className="result-item">
              <span className="result-item-label">System UPI</span>
              <span className="result-item-value">{formatRupee(lastResult.system_upi_total)}</span>
            </div>
            <div className="result-item">
              <span className="result-item-label">Cash in Drawer</span>
              <span className="result-item-value">{formatRupee(lastResult.physical_cash_counted)}</span>
            </div>
            <div className="result-item">
              <span className="result-item-label">Discrepancy</span>
              <span className={`result-item-value ${getDiscClass(lastResult.discrepancy)}`}>
                {getDiscLabel(lastResult.discrepancy)}
              </span>
            </div>
          </div>
          <button className="new-shift-btn" onClick={handleNewShift}>
            🔄 Start New Shift
          </button>
        </div>
      )}

      {/* ─── Settlement Form (Blind Drop) ─── */}
      {!settled && (
        <div className="settlement-form-card">
          <h2>🔒 Close Current Shift</h2>

          {/* Empty state: no unsettled orders */}
          {!hasUnsettledOrders ? (
            <div className="no-orders-state">
              <div className="no-orders-icon">📭</div>
              <div className="no-orders-title">No active orders to settle</div>
              <div className="no-orders-text">
                All orders have already been settled, or no completed orders exist yet.
                Complete some orders first, then return here to close the shift.
              </div>
            </div>
          ) : (
            <>
              {/* Shift summary (order count only — totals hidden for blind drop) */}
              <div className="shift-summary">
                <div className="shift-summary-item">
                  <span className="shift-summary-label">Unsettled Orders</span>
                  <span className="shift-summary-value">{preview.unsettled_order_count}</span>
                </div>
                <div className="shift-summary-hint">
                  💡 Count the physical cash in the register and enter it below. 
                  The system totals will be revealed after you submit.
                </div>
              </div>

              <form onSubmit={handleSettle}>
                <div className="settlement-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="physical_cash">Cash in Drawer (₹)</label>
                    <input
                      type="number"
                      id="physical_cash"
                      className="form-input"
                      value={physicalCash}
                      onChange={(e) => setPhysicalCash(e.target.value)}
                      placeholder="Enter the cash in the register..."
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="notes">Notes (optional)</label>
                    <input
                      type="text"
                      id="notes"
                      className="form-input"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g., End of evening shift"
                    />
                  </div>
                </div>

                {error && <div className="checkout-error" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}

                <Button type="submit" loading={settling}>
                  🔒 Close Shift & Settle
                </Button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ─── Settlement History ─── */}
      <div className="history-card">
        <h2>📜 Past Shifts</h2>
        {settlements.length === 0 ? (
          <div className="empty-state">No past shifts found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="settlement-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Cash (System)</th>
                  <th>UPI (System)</th>
                  <th>Cash in Drawer</th>
                  <th>Difference</th>
                  <th>Orders</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>#{s.id}</td>
                    <td>{s.shift_date}</td>
                    <td>{formatRupee(s.system_cash_total)}</td>
                    <td>{formatRupee(s.system_upi_total)}</td>
                    <td>{formatRupee(s.physical_cash_counted)}</td>
                    <td className={getDiscClass(s.discrepancy)}>
                      {getDiscLabel(s.discrepancy)}
                    </td>
                    <td>{s.order_count}</td>
                    <td>
                      <button
                        className="pdf-btn"
                        onClick={() => handleDownloadPdf(s.id)}
                      >
                        📄 PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

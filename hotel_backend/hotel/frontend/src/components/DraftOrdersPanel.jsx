import { useState, useEffect, useCallback } from 'react';
import { listOrders, deleteOrder, getOrder } from '../api/orders';
import { formatRupee } from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import Spinner from './Spinner';
import './DraftOrdersPanel.css';

/**
 * DraftOrdersPanel — Slide-out panel showing draft orders (last 48h).
 *
 * Provides:
 * - List of active DRAFT orders with table number, item count, total
 * - Resume button (✏️) to load draft into active billing screen
 * - Delete button (🗑️) to permanently remove a draft
 */
export default function DraftOrdersPanel({ isOpen, onClose, onResumeDraft }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const toast = useToast();

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrders({ status: 'DRAFT', date: 'all' });
      setDrafts(data);
    } catch {
      toast.error('Failed to load draft orders.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) fetchDrafts();
  }, [isOpen, fetchDrafts]);

  const handleDelete = async (orderId) => {
    setDeletingId(orderId);
    try {
      await deleteOrder(orderId);
      setDrafts((prev) => prev.filter((d) => d.id !== orderId));
      toast.success(`Draft #${orderId} deleted.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete draft.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleResume = async (draft) => {
    try {
      // Fetch the full order with items to ensure we have the latest state
      const fullOrder = await getOrder(draft.id);
      onResumeDraft(fullOrder);
      onClose();
      toast.success(`Resumed Draft #${draft.id}`);
    } catch (err) {
      toast.error('Failed to load draft order.');
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHrs < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="drafts-backdrop" onClick={onClose} />
      <div className="drafts-panel">
        <div className="drafts-header">
          <h3>📝 Draft Orders</h3>
          <button className="drafts-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="drafts-subtitle">
          Showing drafts from the last 48 hours
        </div>

        <div className="drafts-list">
          {loading ? (
            <div className="drafts-empty"><Spinner size={36} /></div>
          ) : drafts.length === 0 ? (
            <div className="drafts-empty">
              <span className="drafts-empty-icon">📭</span>
              <p>No draft orders found.</p>
              <p className="drafts-empty-hint">Start a new order from the Billing screen.</p>
            </div>
          ) : (
            drafts.map((draft) => (
              <div
                key={draft.id}
                className={`draft-card ${deletingId === draft.id ? 'draft-card-deleting' : ''}`}
              >
                <div className="draft-card-top">
                  <div className="draft-card-id">
                    <span className="draft-order-num">#{draft.id}</span>
                    {draft.table_number && (
                      <span className="draft-table-badge">🍽️ {draft.table_number}</span>
                    )}
                  </div>
                  <span className="draft-card-time">{formatTime(draft.created_at)}</span>
                </div>

                <div className="draft-card-body">
                  <div className="draft-card-items">
                    {draft.items && draft.items.length > 0 ? (
                      <>
                        {draft.items.slice(0, 3).map((item) => (
                          <span key={item.id} className="draft-item-tag">
                            {item.quantity}× {item.menu_item_name}
                          </span>
                        ))}
                        {draft.items.length > 3 && (
                          <span className="draft-item-more">
                            +{draft.items.length - 3} more
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="draft-item-empty">Empty order</span>
                    )}
                  </div>
                  <div className="draft-card-meta">
                    <span className="draft-card-count">{draft.item_count || 0} items</span>
                    <span className="draft-card-total">{formatRupee(draft.total_amount)}</span>
                  </div>
                </div>

                <div className="draft-card-actions">
                  <button
                    className="draft-resume-btn"
                    onClick={() => handleResume(draft)}
                    title="Resume this draft"
                  >
                    ✏️ Resume
                  </button>
                  <button
                    className="draft-delete-btn"
                    onClick={() => handleDelete(draft.id)}
                    disabled={deletingId === draft.id}
                    title="Delete this draft"
                  >
                    {deletingId === draft.id ? '...' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

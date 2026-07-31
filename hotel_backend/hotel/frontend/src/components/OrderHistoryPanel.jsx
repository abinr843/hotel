import { useState, useEffect, useCallback } from 'react';
import { listOrders, voidOrder } from '../api/orders';
import { formatRupee } from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import VoidOrderModal from './VoidOrderModal';
import Spinner from './Spinner';
import './OrderHistoryPanel.css';

/**
 * OrderHistoryPanel — Slide-out panel showing today's completed orders.
 *
 * Provides:
 * - Filter tabs for COMPLETED / CANCELLED-VOIDED / ALL
 * - Order cards with summary info
 * - Void affordance on COMPLETED orders (opens VoidOrderModal)
 */

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED-VOIDED', label: 'Cancelled' },
];

export default function OrderHistoryPanel({ isOpen, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [voidModal, setVoidModal] = useState({ open: false, order: null });
  const [voidLoading, setVoidLoading] = useState(false);
  const toast = useToast();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date: 'today' };
      if (activeTab !== 'all') {
        params.status = activeTab;
      }
      const data = await listOrders(params);
      // Filter out DRAFT orders from history (backend already does this, but belt & suspenders)
      setOrders(data.filter(o => o.status !== 'DRAFT'));
    } catch {
      toast.error('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    if (isOpen) fetchOrders();
  }, [isOpen, fetchOrders]);

  const handleVoid = async (pin, reason) => {
    if (!voidModal.order) return;
    setVoidLoading(true);
    try {
      await voidOrder(voidModal.order.id, pin, reason);
      toast.success(`Order #${voidModal.order.id} cancelled successfully.`);
      setVoidModal({ open: false, order: null });
      fetchOrders(); // Refresh the list
    } catch (err) {
      throw err; // Re-throw so the modal shows the error
    } finally {
      setVoidLoading(false);
    }
  };

  const getStatusClass = (status) => {
    if (status === 'COMPLETED') return 'status-completed';
    if (status === 'CANCELLED-VOIDED') return 'status-voided';
    return 'status-draft';
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="history-backdrop" onClick={onClose} />
      <div className="history-panel">
        <div className="history-header">
          <h3>📋 Order History</h3>
          <button className="history-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Status filter tabs */}
        <div className="history-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`history-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders list */}
        <div className="history-list">
          {loading ? (
            <div className="history-empty"><Spinner size={36} /></div>
          ) : orders.length === 0 ? (
            <div className="history-empty">
              <span className="history-empty-icon">📭</span>
              <p>No orders found.</p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="history-card">
                <div className="history-card-top">
                  <div className="history-card-id">
                    <span className="history-order-num">#{order.id}</span>
                    <span className={`history-status-badge ${getStatusClass(order.status)}`}>
                      {order.status === 'CANCELLED-VOIDED' ? 'CANCELLED' : order.status}
                    </span>
                  </div>
                  <span className="history-card-time">{formatTime(order.created_at)}</span>
                </div>

                <div className="history-card-body">
                  <div className="history-card-items">
                    {order.items.slice(0, 3).map((item) => (
                      <span key={item.id} className="history-item-tag">
                        {item.quantity}× {item.menu_item_name}
                      </span>
                    ))}
                    {order.items.length > 3 && (
                      <span className="history-item-more">
                        +{order.items.length - 3} more
                      </span>
                    )}
                  </div>
                  <div className="history-card-meta">
                    {order.table_number && (
                      <span className="history-card-table">🍽️ {order.table_number}</span>
                    )}
                    <span className="history-card-method">{order.payment_summary || '—'}</span>
                    <span className="history-card-total">{formatRupee(order.total_amount)}</span>
                  </div>
                </div>

                {/* Void reason if voided */}
                {order.status === 'CANCELLED-VOIDED' && order.void_reason && (
                  <div className="history-void-reason">
                    ⚠️ {order.void_reason}
                  </div>
                )}

                {/* Cancel button — only for COMPLETED orders */}
                {order.status === 'COMPLETED' && (
                  <button className="history-void-btn" onClick={() => setVoidModal({ open: true, order })}>🚫 Cancel Order</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Void confirmation modal */}
      <VoidOrderModal
        isOpen={voidModal.open}
        onClose={() => setVoidModal({ open: false, order: null })}
        order={voidModal.order}
        onVoid={handleVoid}
        loading={voidLoading}
      />
    </>
  );
}

import { useState } from 'react';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import './VoidOrderModal.css';

/**
 * VoidOrderModal — PIN-gated confirmation modal for voiding a completed order.
 *
 * Requires the Admin PIN and a text reason before allowing the void.
 * Displays the order summary so the cashier can verify they're voiding the right order.
 */
export default function VoidOrderModal({
  isOpen,
  onClose,
  order,           // the COMPLETED order object to void
  onVoid,          // (pin, reason) => Promise
  loading = false,
}) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!pin.trim()) {
      setError('Admin PIN is required.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason for cancellation is required.');
      return;
    }

    try {
      await onVoid(pin.trim(), reason.trim());
      // Reset on success
      setPin('');
      setReason('');
    } catch (err) {
      setError(err.response?.data?.message || 'Cancel failed. Check your PIN and try again.');
    }
  };

  const handleClose = () => {
    setPin('');
    setReason('');
    setError('');
    onClose();
  };

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cancel Order" size="sm">
      <div className="void-form">
        {/* Order info */}
        <div className="void-order-info">
          <div className="void-order-id">Order #{order.id}</div>
          <div className="void-order-meta">
            <span>{order.payment_method}</span>
            <span className="void-order-total">₹{parseFloat(order.total_amount).toFixed(2)}</span>
          </div>
        </div>

        {/* Warning */}
        <div className="void-warning">
          ⚠️ This action is <strong>irreversible</strong>. The order will be marked as cancelled
          and excluded from all revenue reports.
        </div>

        {/* PIN input */}
        <Input
          id="void-pin"
          label="Admin PIN"
          type="password"
          placeholder="Enter Manager Cancel PIN..."
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            if (error) setError('');
          }}
          autoFocus
        />

        {/* Reason */}
        <div className="void-field">
          <label htmlFor="void-reason" className="input-label">Reason for Cancellation</label>
          <textarea
            id="void-reason"
            className="void-textarea"
            rows={3}
            placeholder="e.g., Customer complaint, wrong order, duplicate entry..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
          />
        </div>

        {/* Error */}
        {error && <div className="void-error">{error}</div>}

        {/* Actions */}
        <div className="void-actions">
          <Button variant="secondary" onClick={handleClose} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={loading}
            className="void-confirm-btn"
          >
            🔒 Confirm Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

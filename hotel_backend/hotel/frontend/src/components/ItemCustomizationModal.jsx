import { useState, useEffect } from 'react';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import { formatRupee } from '../utils/formatters';
import './ItemCustomizationModal.css';

/**
 * ItemCustomizationModal — Popup for customizable menu items.
 *
 * Shows immediately when a customizable item is tapped on the grid.
 * Allows the cashier to:
 *   - Override the rate (₹) — defaults to the item's standard rate
 *   - Add free-text special instructions
 *
 * For editing an existing cart item, pass `editingItem` to pre-fill fields.
 */
export default function ItemCustomizationModal({
  isOpen,
  onClose,
  menuItem,       // the MenuItem object from the grid
  editingItem,    // optional: existing OrderItem for in-cart editing
  onConfirm,      // (rate, instructions, quantity) => void
}) {
  const [rate, setRate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState({});

  // Pre-fill when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      // Editing an existing cart item
      setRate(String(editingItem.snapshot_rate));
      setInstructions(editingItem.special_instructions || '');
      setQuantity(editingItem.quantity || 1);
    } else if (menuItem) {
      // Adding a new customizable item
      setRate(String(menuItem.standard_rate));
      setInstructions('');
      setQuantity(1);
    }
    setErrors({});
  }, [isOpen, menuItem, editingItem]);

  const validate = () => {
    const e = {};
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed < 0) {
      e.rate = 'Rate must be a valid non-negative number.';
    } else {
      const parts = String(rate).split('.');
      if (parts[1] && parts[1].length > 2) {
        e.rate = 'Rate must have at most 2 decimal places.';
      }
    }
    if (quantity < 1) {
      e.quantity = 'Quantity must be at least 1.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onConfirm(parseFloat(rate).toFixed(2), instructions.trim(), quantity);
  };

  const isOverridden = menuItem && parseFloat(rate) !== parseFloat(menuItem.standard_rate);

  if (!menuItem) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingItem ? 'Edit Item' : 'Customize Item'}>
      <form className="customize-form" onSubmit={handleSubmit}>
        {/* Item info header */}
        <div className="customize-item-header">
          <span className="customize-item-name">{menuItem.name}</span>
          <span className="customize-item-std-rate">
            Standard: {formatRupee(menuItem.standard_rate)}
          </span>
        </div>

        {/* Rate override */}
        <div className="customize-field">
          <Input
            id="customize-rate"
            label="Rate (₹)"
            type="number"
            step="0.01"
            min="0"
            placeholder="Enter custom rate"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              if (errors.rate) setErrors((prev) => ({ ...prev, rate: undefined }));
            }}
            error={errors.rate}
          />
          {isOverridden && (
            <span className="rate-override-tag">⚡ Overridden</span>
          )}
        </div>

        {/* Special instructions */}
        <div className="customize-field">
          <label htmlFor="customize-instructions" className="input-label">
            Special Instructions
          </label>
          <textarea
            id="customize-instructions"
            className="customize-textarea"
            rows={3}
            placeholder="e.g., Extra spicy, no onions, less salt..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {/* Quantity */}
        {!editingItem && (
          <div className="customize-field">
            <label className="input-label">Quantity</label>
            <div className="customize-qty-row">
              <button
                type="button"
                className="qty-btn qty-btn-minus"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="customize-qty-value">{quantity}</span>
              <button
                type="button"
                className="qty-btn qty-btn-plus"
                onClick={() => setQuantity((q) => q + 1)}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="customize-actions">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit">
            {editingItem ? 'Update Item' : `Add to Cart — ${formatRupee(parseFloat(rate || 0) * quantity)}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

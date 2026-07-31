import { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import { formatRupee } from '../utils/formatters';
import { getUpiLink } from '../api/orders';
import './CheckoutModal.css';

/**
 * CheckoutModal — Finalize the current DRAFT order with split payments.
 *
 * - Scrollable item summary at the top
 * - Split payment: Cash, UPI, Card amount fields
 * - Quick-select buttons for single-method payments
 * - Live "Remaining Balance" indicator
 * - CASH: tender entry + change due
 * - UPI: Generates and displays scannable QR code via UPI deep-link
 */

export default function CheckoutModal({
  isOpen,
  onClose,
  orderId,
  totalAmount,
  itemCount,
  items = [],
  onCheckout,
  loading = false,
}) {
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [error, setError] = useState('');

  // UPI State
  const [upiData, setUpiData] = useState(null);
  const [upiLoading, setUpiLoading] = useState(false);

  const total = parseFloat(totalAmount) || 0;
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const card = parseFloat(cardAmount) || 0;
  const tendered = parseFloat(cashTendered) || 0;

  const paymentSum = cash + upi + card;
  const remaining = total - paymentSum;
  const changeDue = cash > 0 && tendered > cash ? tendered - cash : 0;
  const isBalanced = Math.abs(remaining) < 0.01;

  // Determine dominant payment method for UPI QR
  const showUpiQr = upi > 0;

  // Fetch UPI link when UPI amount is set
  useEffect(() => {
    if (showUpiQr && orderId && isOpen) {
      const fetchUpi = async () => {
        setUpiLoading(true);
        setError('');
        try {
          const data = await getUpiLink(orderId);
          setUpiData(data);
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to generate UPI QR code. Please check configuration.');
          setUpiData(null);
        } finally {
          setUpiLoading(false);
        }
      };
      fetchUpi();
    }
  }, [showUpiQr, orderId, isOpen]);

  const handleSubmit = async () => {
    setError('');

    if (!isBalanced) {
      setError(`Payment amounts must equal ${formatRupee(total)}. Remaining: ${formatRupee(remaining)}`);
      return;
    }

    if (cash > 0 && tendered < cash) {
      setError(`Cash tendered (${formatRupee(tendered)}) must be at least ${formatRupee(cash)}.`);
      return;
    }

    const paymentData = {
      cash_amount: cash.toFixed(2),
      upi_amount: upi.toFixed(2),
      card_amount: card.toFixed(2),
    };
    if (cash > 0) {
      paymentData.cash_tendered = (tendered || cash).toFixed(2);
    }

    try {
      await onCheckout(paymentData);
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed. Please try again.');
    }
  };

  // Quick-select handlers
  const handleFullCash = () => {
    setCashAmount(String(total.toFixed(2)));
    setUpiAmount('');
    setCardAmount('');
    setError('');
  };
  const handleFullUpi = () => {
    setUpiAmount(String(total.toFixed(2)));
    setCashAmount('');
    setCardAmount('');
    setError('');
  };
  const handleFullCard = () => {
    setCardAmount(String(total.toFixed(2)));
    setCashAmount('');
    setUpiAmount('');
    setError('');
  };

  // Fill remaining into a specific method
  const handleFillRemaining = (method) => {
    const rem = Math.max(0, remaining);
    if (rem <= 0) return;
    if (method === 'cash') setCashAmount(String((cash + rem).toFixed(2)));
    if (method === 'upi') setUpiAmount(String((upi + rem).toFixed(2)));
    if (method === 'card') setCardAmount(String((card + rem).toFixed(2)));
    setError('');
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCashAmount('');
      setUpiAmount('');
      setCardAmount('');
      setCashTendered('');
      setError('');
      setUpiData(null);
    }
  }, [isOpen]);

  // Status indicator
  const remainingStatus = useMemo(() => {
    if (remaining > 0.01) return { label: `₹${remaining.toFixed(2)} remaining`, className: 'remaining-pending' };
    if (remaining < -0.01) return { label: `₹${Math.abs(remaining).toFixed(2)} over`, className: 'remaining-over' };
    return { label: '✓ Balanced', className: 'remaining-balanced' };
  }, [remaining]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Checkout" size="md">
      <div className="checkout-form">
        {/* Scrollable item summary */}
        {items.length > 0 && (
          <div className="checkout-items-summary">
            <div className="checkout-items-header">
              <span>Item</span>
              <span>Qty</span>
              <span>Amount</span>
            </div>
            <div className="checkout-items-list">
              {items.map((item) => (
                <div key={item.id} className="checkout-item-row">
                  <span className="checkout-item-name">
                    {item.menu_item_name}
                    {item.special_instructions && (
                      <span className="checkout-item-note"> 📝</span>
                    )}
                  </span>
                  <span className="checkout-item-qty">×{item.quantity}</span>
                  <span className="checkout-item-amount">{formatRupee(item.line_total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order summary totals */}
        <div className="checkout-summary">
          <div className="checkout-summary-row">
            <span>Items</span>
            <span className="font-semibold">{itemCount}</span>
          </div>
          <div className="checkout-summary-total">
            <span>Total</span>
            <span className="checkout-total-value">{formatRupee(total)}</span>
          </div>
        </div>

        {/* Quick-select payment buttons */}
        <div className="checkout-section">
          <label className="input-label">Quick Select</label>
          <div className="payment-methods">
            <button type="button" className="payment-method-btn" onClick={handleFullCash}>
              💵 Full Cash
            </button>
            <button type="button" className="payment-method-btn" onClick={handleFullUpi}>
              📱 Full UPI
            </button>
            <button type="button" className="payment-method-btn" onClick={handleFullCard}>
              💳 Full Card
            </button>
          </div>
        </div>

        {/* Split Payment Inputs */}
        <div className="checkout-section checkout-split-section">
          <label className="input-label">Split Payment</label>

          <div className="split-payment-grid">
            {/* Cash */}
            <div className="split-payment-row">
              <div className="split-payment-label">
                <span className="split-icon">💵</span> Cash
              </div>
              <div className="split-payment-input-group">
                <input
                  type="number"
                  className="split-payment-input"
                  placeholder="0.00"
                  value={cashAmount}
                  onChange={(e) => { setCashAmount(e.target.value); setError(''); }}
                  min="0"
                  step="0.01"
                />
                {remaining > 0.01 && (
                  <button type="button" className="fill-remaining-btn" onClick={() => handleFillRemaining('cash')} title="Fill remaining">
                    +Rest
                  </button>
                )}
              </div>
            </div>

            {/* UPI */}
            <div className="split-payment-row">
              <div className="split-payment-label">
                <span className="split-icon">📱</span> UPI
              </div>
              <div className="split-payment-input-group">
                <input
                  type="number"
                  className="split-payment-input"
                  placeholder="0.00"
                  value={upiAmount}
                  onChange={(e) => { setUpiAmount(e.target.value); setError(''); }}
                  min="0"
                  step="0.01"
                />
                {remaining > 0.01 && (
                  <button type="button" className="fill-remaining-btn" onClick={() => handleFillRemaining('upi')} title="Fill remaining">
                    +Rest
                  </button>
                )}
              </div>
            </div>

            {/* Card */}
            <div className="split-payment-row">
              <div className="split-payment-label">
                <span className="split-icon">💳</span> Card
              </div>
              <div className="split-payment-input-group">
                <input
                  type="number"
                  className="split-payment-input"
                  placeholder="0.00"
                  value={cardAmount}
                  onChange={(e) => { setCardAmount(e.target.value); setError(''); }}
                  min="0"
                  step="0.01"
                />
                {remaining > 0.01 && (
                  <button type="button" className="fill-remaining-btn" onClick={() => handleFillRemaining('card')} title="Fill remaining">
                    +Rest
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Remaining balance indicator */}
          <div className={`remaining-indicator ${remainingStatus.className}`}>
            {remainingStatus.label}
          </div>
        </div>

        {/* Cash Tendered (only when cash > 0) */}
        {cash > 0 && (
          <div className="checkout-section checkout-cash-section">
            <label className="input-label">Cash Tendered (₹)</label>
            <input
              type="number"
              className="checkout-cash-input"
              placeholder="Enter amount..."
              value={cashTendered}
              onChange={(e) => { setCashTendered(e.target.value); setError(''); }}
              min="0"
              step="0.01"
            />

            {/* Quick cash buttons */}
            <div className="quick-cash-row">
              <button
                type="button"
                className="quick-cash-btn quick-cash-exact"
                onClick={() => { setCashTendered(String(cash.toFixed(2))); setError(''); }}
              >
                Exact {formatRupee(cash)}
              </button>
              {[100, 200, 500, 1000, 2000].filter((a) => a >= cash).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="quick-cash-btn"
                  onClick={() => { setCashTendered(String(amount)); setError(''); }}
                >
                  ₹{amount}
                </button>
              ))}
            </div>

            {/* Change due */}
            {tendered > 0 && tendered >= cash && (
              <div className="checkout-change">
                <span className="checkout-change-label">Change Due</span>
                <span className="checkout-change-value">{formatRupee(changeDue)}</span>
              </div>
            )}
          </div>
        )}

        {/* UPI: QR Code Render */}
        {showUpiQr && (
          <div className="checkout-section checkout-upi-section">
            {upiLoading ? (
              <div className="upi-loading">
                <Spinner size={32} />
                <p>Generating QR Code...</p>
              </div>
            ) : upiData ? (
              <div className="upi-qr-container">
                <div className="upi-qr-wrapper">
                  <QRCodeSVG 
                    value={upiData.deep_link} 
                    size={200}
                    level="Q"
                    includeMargin={true}
                  />
                </div>
                <div className="upi-payee-info">
                  <p className="upi-payee-name">{upiData.payee_name}</p>
                  <p className="upi-vpa">{upiData.upi_id}</p>
                </div>
                <p className="upi-instruction">
                  Scan with any UPI app to pay <strong>{formatRupee(upiData.amount)}</strong>
                </p>
                <p className="upi-ref">Ref: {upiData.transaction_ref}</p>
              </div>
            ) : null}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="checkout-error">{error}</div>
        )}

        {/* Action buttons */}
        <div className="checkout-actions">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            loading={loading}
            disabled={!isBalanced}
          >
            Complete & Print Bill — {formatRupee(total)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

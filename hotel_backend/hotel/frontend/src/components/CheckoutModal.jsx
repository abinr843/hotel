import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import { formatRupee } from '../utils/formatters';
import { getUpiLink } from '../api/orders';
import './CheckoutModal.css';

/**
 * CheckoutModal — Finalize the current DRAFT order.
 *
 * - Scrollable item summary at the top
 * - Payment method selection: CASH, UPI, CARD
 * - CASH: Quick-cash tender keypad & change due calculation
 * - UPI: Generates and displays scannable QR code via UPI deep-link
 */

const QUICK_CASH_AMOUNTS = [100, 200, 500, 1000, 2000];

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
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [error, setError] = useState('');

  // UPI State
  const [upiData, setUpiData] = useState(null);
  const [upiLoading, setUpiLoading] = useState(false);

  const total = parseFloat(totalAmount) || 0;
  const tendered = parseFloat(cashTendered) || 0;
  const changeDue = tendered - total;

  // Fetch UPI link when UPI is selected
  useEffect(() => {
    if (paymentMethod === 'UPI' && orderId && isOpen) {
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
  }, [paymentMethod, orderId, isOpen]);

  const handleSubmit = async () => {
    setError('');

    if (paymentMethod === 'CASH') {
      if (!cashTendered || tendered <= 0) {
        setError('Please enter the cash tendered amount.');
        return;
      }
      if (tendered < total) {
        setError(`Cash tendered (${formatRupee(tendered)}) is less than the total (${formatRupee(total)}).`);
        return;
      }
    }

    if (paymentMethod === 'UPI' && !upiData && !error) {
      setError('Waiting for UPI QR code to generate...');
      return;
    }

    const paymentData = { payment_method: paymentMethod };
    if (paymentMethod === 'CASH') {
      paymentData.cash_tendered = parseFloat(cashTendered).toFixed(2);
    }

    try {
      await onCheckout(paymentData);
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed. Please try again.');
    }
  };

  const handleQuickCash = (amount) => {
    setCashTendered(String(amount));
    setError('');
  };

  const handleExactAmount = () => {
    setCashTendered(String(total.toFixed(2)));
    setError('');
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPaymentMethod('CASH');
      setCashTendered('');
      setError('');
      setUpiData(null);
    }
  }, [isOpen]);


  const getSubmitLabel = () => {
    if (paymentMethod === 'CASH') return `Complete & Print Bill — ${formatRupee(total)}`;
    if (paymentMethod === 'UPI') return `Payment Received & Print Bill`;
    return `Complete & Print Bill`;
  };

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

        {/* Payment method selector */}
        <div className="checkout-section">
          <label className="input-label">Payment Method</label>
          <div className="payment-methods">
            {[
              { key: 'CASH', label: '💵 Cash', },
              { key: 'UPI', label: '📱 UPI', },
              { key: 'CARD', label: '💳 Card', },
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                className={`payment-method-btn ${paymentMethod === m.key ? 'active' : ''}`}
                onClick={() => {
                  setPaymentMethod(m.key);
                  setError('');
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* CASH: tender entry */}
        {paymentMethod === 'CASH' && (
          <div className="checkout-section checkout-cash-section">
            <label className="input-label">Cash Tendered (₹)</label>
            <input
              type="number"
              className="checkout-cash-input"
              placeholder="Enter amount..."
              value={cashTendered}
              onChange={(e) => {
                setCashTendered(e.target.value);
                setError('');
              }}
              min="0"
              step="0.01"
              autoFocus
            />

            {/* Quick cash buttons */}
            <div className="quick-cash-row">
              <button
                type="button"
                className="quick-cash-btn quick-cash-exact"
                onClick={handleExactAmount}
              >
                Exact {formatRupee(total)}
              </button>
              {QUICK_CASH_AMOUNTS.filter((a) => a >= total).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="quick-cash-btn"
                  onClick={() => handleQuickCash(amount)}
                >
                  ₹{amount}
                </button>
              ))}
            </div>

            {/* Change due */}
            {tendered > 0 && tendered >= total && (
              <div className="checkout-change">
                <span className="checkout-change-label">Change Due</span>
                <span className="checkout-change-value">{formatRupee(changeDue)}</span>
              </div>
            )}
          </div>
        )}

        {/* UPI: QR Code Render */}
        {paymentMethod === 'UPI' && (
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
            disabled={paymentMethod === 'UPI' && (!upiData || error)}
            className={paymentMethod === 'UPI' ? 'btn-upi-confirm' : ''}
          >
            {getSubmitLabel()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

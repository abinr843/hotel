import React from 'react';
import { Link } from 'react-router-dom';
import './UpdatesScreen.css';

export default function UpdatesScreen() {
  return (
    <div className="updates-container p-6">
      <div className="updates-header">
        <h1>✨ What's New in v2.0</h1>
        <p className="text-muted">Explore the latest features designed to streamline your hotel operations.</p>
      </div>

      <div className="updates-timeline">
        {/* Release Version Block */}
        <div className="update-release">
          <div className="update-version-badge">Version 2.0.0</div>
          <div className="update-date">July 31, 2026</div>
        </div>

        {/* Feature 1: Split Payments */}
        <div className="update-card">
          <div className="update-card-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>💳</div>
          <div className="update-card-content">
            <h2>Split Payments at Checkout</h2>
            <p>
              You can now split a single bill across multiple payment methods (Cash, UPI, and Card) simultaneously.
              No more forcing customers to choose just one!
            </p>
            <div className="update-guide">
              <h3>📖 How to use it:</h3>
              <ol>
                <li>Go to the <strong>Orders</strong> (Billing) screen and build your cart.</li>
                <li>Click <strong>Checkout</strong> to open the checkout modal.</li>
                <li>You'll see three inputs: <strong>Cash</strong>, <strong>UPI</strong>, and <strong>Card</strong>.</li>
                <li>Type the amount the customer is paying for each method. The system will automatically calculate the <strong>Remaining Balance</strong>.</li>
                <li>If they are paying the rest with one method, just click the <strong>+Rest</strong> button next to the input to auto-fill the remaining amount!</li>
                <li>If the customer pays with cash, you can also enter the <strong>Cash Tendered</strong> to easily calculate the change due.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Feature 2: Table Numbers */}
        <div className="update-card">
          <div className="update-card-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>🍽️</div>
          <div className="update-card-content">
            <h2>Table Number Management</h2>
            <p>
              Keep track of where orders are going by assigning a table number or a custom tag (like "Parcel" or "Room 204") to any order.
            </p>
            <div className="update-guide">
              <h3>📖 How to use it:</h3>
              <ul>
                <li>In the <strong>Orders</strong> cart, look for the <strong>🍽️ Table</strong> input field right at the top.</li>
                <li>Type in the table number (e.g., "T5") before or during order creation.</li>
                <li>When viewing the <strong>History</strong> or <strong>Drafts</strong> panels, the table number will be prominently displayed as a purple badge.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Feature 3: Draft Orders */}
        <div className="update-card">
          <div className="update-card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>📝</div>
          <div className="update-card-content">
            <h2>Draft Orders (Pause & Resume)</h2>
            <p>
              Need to pause an order because a customer is deciding, and ring up someone else in the meantime? Now you can easily manage Draft Orders.
            </p>
            <div className="update-guide">
              <h3>📖 How to use it:</h3>
              <ol>
                <li>Every time you add an item to an empty cart, a <strong>Draft Order</strong> is automatically created.</li>
                <li>If you need to serve someone else, simply click the <strong>+ New</strong> button at the top of the cart to start a fresh order.</li>
                <li>To go back to the paused order, click the <strong>📝 Drafts</strong> button. A side panel will slide out showing all your open drafts.</li>
                <li>Click <strong>✏️ Resume</strong> to load the order back into your cart and finish checking them out!</li>
              </ol>
              <div className="update-note">
                <strong>Important Note:</strong> Draft orders are automatically hidden after 48 hours. Furthermore, whenever you perform the <strong>Close Shift</strong> (EOD Settlement), any leftover draft orders are permanently deleted to keep your system clean.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <Link to="/orders" className="btn btn-primary touch-target" style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>
          Try it out now!
        </Link>
      </div>
    </div>
  );
}

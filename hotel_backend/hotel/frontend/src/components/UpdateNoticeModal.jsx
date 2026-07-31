import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import Button from './Button';

/**
 * UpdateNoticeModal — Shows a one-time "What's New" modal.
 * Uses localStorage to remember if the user has seen it.
 */
export default function UpdateNoticeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenUpdate_v2.0');
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('hasSeenUpdate_v2.0', 'true');
    setIsOpen(false);
  };

  const handleViewDetails = () => {
    handleClose();
    navigate('/updates');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="🎉 What's New in v2.0">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          We've rolled out exciting new features to help you manage orders and payments more effectively!
        </p>

        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.25rem', color: 'var(--color-text-primary)' }}>
          <li>
            <strong>💳 Split Payments:</strong> You can now split the bill between Cash, UPI, and Card simultaneously at checkout!
          </li>
          <li>
            <strong>🍽️ Table Management:</strong> Assign a Table Number (e.g. "T5" or "Parcel") to any order from the Cart.
          </li>
          <li>
            <strong>📝 Draft Orders Panel:</strong> Safely pause orders and resume them later!
          </li>
        </ul>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <Button variant="secondary" onClick={handleClose}>Got it</Button>
          <Button onClick={handleViewDetails}>View Full Details ✨</Button>
        </div>
      </div>
    </Modal>
  );
}

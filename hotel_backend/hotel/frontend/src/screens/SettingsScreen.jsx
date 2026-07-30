import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../api/settings';
import Button from '../components/Button';
import Spinner from '../components/Spinner';
import './SettingsScreen.css';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    upi_id: '',
    upi_payee_name: '',
    admin_pin: '',
  });
  
  const [hasAdminPin, setHasAdminPin] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await getSettings();
      setFormData((prev) => ({
        ...prev,
        upi_id: data.upi_id || '',
        upi_payee_name: data.upi_payee_name || '',
      }));
      setHasAdminPin(data.has_admin_pin);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load settings.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const data = await updateSettings(formData);
      setMessage({ type: 'success', text: data.message || 'Settings saved successfully.' });
      setHasAdminPin(data.has_admin_pin);
      // Clear PIN field after save
      setFormData((prev) => ({ ...prev, admin_pin: '' }));
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Failed to save settings.' 
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <div className="settings-container p-6">
      <div className="settings-header">
        <h1>Admin Profile & Settings</h1>
        <p>Configure store details and administrative credentials.</p>
      </div>

      {message.text && (
        <div className={`alert-message alert-${message.type}`}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      <form className="settings-card" onSubmit={handleSubmit}>
        
        {/* UPI Configuration Section */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            📱 UPI Payment Configuration
          </h2>
          
          <div className="form-group">
            <label className="form-label" htmlFor="upi_id">
              UPI ID (e.g. name@bank)
            </label>
            <input
              type="text"
              id="upi_id"
              name="upi_id"
              className="form-input"
              value={formData.upi_id}
              onChange={handleChange}
              placeholder="e.g. hotelname@okicici"
            />
            <span className="form-help">
              This is the merchant UPI ID where funds will be received.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="upi_payee_name">
              Payee Name
            </label>
            <input
              type="text"
              id="upi_payee_name"
              name="upi_payee_name"
              className="form-input"
              value={formData.upi_payee_name}
              onChange={handleChange}
              placeholder="e.g. Hotel Antigravity"
            />
            <span className="form-help">
              The exact business name that will appear on the customer's UPI app.
            </span>
          </div>
        </div>

        {/* Security Section */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            🔒 Manager Cancel PIN
            {hasAdminPin && <span className="pin-status-badge">PIN Configured</span>}
          </h2>

          <div className="form-group">
            <label className="form-label" htmlFor="admin_pin">
              {hasAdminPin ? 'Update Manager Cancel PIN' : 'Set Manager Cancel PIN'}
            </label>
            <input
              type="password"
              id="admin_pin"
              name="admin_pin"
              className="form-input"
              value={formData.admin_pin}
              onChange={handleChange}
              placeholder="Enter new 4-6 digit PIN"
              pattern="[0-9]*"
              inputMode="numeric"
            />
            <span className="form-help">
              {hasAdminPin 
                ? "Leave blank to keep your current PIN unchanged. This PIN is required to cancel orders." 
                : "Set a PIN to secure sensitive actions like cancelling orders."}
            </span>
          </div>
        </div>

        <div className="settings-actions">
          <Button 
            type="submit" 
            loading={saving} 
            className="btn-save-settings"
          >
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}

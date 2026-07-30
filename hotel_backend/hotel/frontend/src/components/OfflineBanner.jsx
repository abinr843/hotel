import { useNetwork } from '../context/NetworkContext';
import './OfflineBanner.css';

/**
 * A fixed banner that overlays the top of the screen when the app
 * detects the backend is unreachable (via browser events or Axios errors).
 */
export default function OfflineBanner() {
  const { isOffline, markOnline } = useNetwork();

  if (!isOffline) return null;

  const handleRetry = () => {
    // Attempt a lightweight fetch to see if the server is back
    fetch('/api/health/', { method: 'GET', cache: 'no-store' })
      .then((res) => {
        if (res.ok) markOnline();
      })
      .catch(() => {
        // Still offline, banner stays
      });
  };

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <div className="offline-banner-content">
        <span className="offline-banner-icon">⚠️</span>
        <span className="offline-banner-text">
          No connection to server — Some features may be unavailable.
        </span>
        <button className="offline-banner-retry" onClick={handleRetry}>
          🔄 Retry
        </button>
      </div>
    </div>
  );
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setNetworkErrorCallback } from '../api/axios';

const NetworkContext = createContext(null);

/**
 * NetworkProvider tracks connectivity state using two sources:
 *   1. Browser online/offline events (navigator.onLine)
 *   2. Axios network errors (!error.response) — programmatic trigger
 *
 * When an Axios request fails without any response (server unreachable),
 * the Axios interceptor calls `markOffline()` to show the banner,
 * even if the browser still reports `navigator.onLine === true`.
 *
 * The banner auto-clears when:
 *   - The browser's `online` event fires, OR
 *   - A subsequent Axios request succeeds (server is back)
 */
export function NetworkProvider({ children }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const markOffline = useCallback(() => setIsOffline(true), []);
  const markOnline = useCallback(() => setIsOffline(false), []);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    // Wire up Axios interceptor callbacks
    setNetworkErrorCallback(markOffline, markOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      setNetworkErrorCallback(null, null);
    };
  }, [markOffline, markOnline]);

  return (
    <NetworkContext.Provider value={{ isOffline, markOffline, markOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
}

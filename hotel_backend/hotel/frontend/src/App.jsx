import { useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import TopAppBar from './components/TopAppBar';
import SideNav from './components/SideNav';
import OfflineBanner from './components/OfflineBanner';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import MenuScreen from './screens/MenuScreen';
import BillingScreen from './screens/BillingScreen';
import SettingsScreen from './screens/SettingsScreen';
import SettlementScreen from './screens/SettlementScreen';

// The App Shell layout wraps protected routes
function AppShell() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <TopAppBar onMenuToggle={() => setNavOpen(true)} />
      <SideNav isOpen={navOpen} onClose={() => setNavOpen(false)} />
      
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <Routes>
      <Route path="/login" element={<LoginScreen />} />
      
      {/* Protected Routes wrapped in AppShell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/menu" element={<MenuScreen />} />
        {/* Placeholders for future screens */}
        <Route path="/orders" element={<BillingScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settlement" element={<SettlementScreen />} />
        
        {/* Default route inside shell */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
}

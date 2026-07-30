import { useAuth } from '../context/AuthContext';
import './TopAppBar.css';

export default function TopAppBar({ onMenuToggle }) {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onMenuToggle} aria-label="Toggle menu">
          <span className="menu-icon" />
        </button>
        <h1 className="topbar-title">Hotel POS</h1>
      </div>
      <div className="topbar-right">
        <div className="topbar-user">
          <span className="topbar-user-avatar">A</span>
          <span className="topbar-user-name">{user?.username || 'Admin'}</span>
        </div>
        <button className="topbar-logout-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}

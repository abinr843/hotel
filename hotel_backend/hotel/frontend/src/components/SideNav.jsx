import { NavLink } from 'react-router-dom';
import './SideNav.css';

const navItems = [
  { path: '/dashboard', label: 'Overview', icon: '📊' },
  { path: '/menu', label: 'Menu', icon: '🍽️' },
  { path: '/orders', label: 'Orders', icon: '📋' },
  { path: '/settlement', label: 'Close Shift', icon: '💰' },
  { path: '/updates', label: 'Updates', icon: '✨' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function SideNav({ isOpen, onClose }) {
  return (
    <>
      {isOpen && <div className="sidenav-overlay" onClick={onClose} />}
      <nav className={`sidenav ${isOpen ? 'sidenav-open' : ''}`}>
        <div className="sidenav-brand">
          <span className="sidenav-brand-icon">🏨</span>
          <span className="sidenav-brand-text">Hotel POS</span>
        </div>
        <ul className="sidenav-list">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `sidenav-link ${isActive ? 'sidenav-link-active' : ''}`
                }
                onClick={onClose}
              >
                <span className="sidenav-link-icon">{item.icon}</span>
                <span className="sidenav-link-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidenav-footer">
          <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
            v2.0.0
          </span>
        </div>
      </nav>
    </>
  );
}

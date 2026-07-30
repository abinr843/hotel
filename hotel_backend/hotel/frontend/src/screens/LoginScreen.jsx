import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkHealth, checkSetupStatus, registerAdmin } from '../api/auth';
import Button from '../components/Button';
import Input from '../components/Input';
import './LoginScreen.css';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [errors, setErrors] = useState({});
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // On mount, check if the system has been set up yet
    checkSetupStatus()
      .then((data) => setNeedsSetup(data.needs_setup))
      .catch(() => setNeedsSetup(false)) // If backend is down, show login
      .finally(() => setCheckingSetup(false));
  }, []);

  const validateLogin = () => {
    const newErrors = {};
    if (!username.trim()) newErrors.username = 'Username is required';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSetup = () => {
    const newErrors = {};
    if (!username.trim()) newErrors.username = 'Username is required';
    if (!password) newErrors.password = 'Password is required';
    if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateLogin()) return;

    setLoading(true);
    try {
      await login(username, password);
      toast.success('Welcome back, Admin!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Invalid credentials. Please try again.';
      toast.error(msg);
      setErrors({ password: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!validateSetup()) return;

    setLoading(true);
    try {
      const data = await registerAdmin(username, password, email);
      toast.success(data.message || 'Admin account created! You can now sign in.');
      setNeedsSetup(false);
      // Keep username filled so they can just type password and log in
      setPassword('');
      setConfirmPassword('');
      setEmail('');
      setErrors({});
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Failed to create admin account.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      const data = await checkHealth();
      if (data.status === 'ok') {
        toast.success(`Backend connected! DB: ${data.database}`);
      } else {
        toast.warning('Backend responded but DB is disconnected.');
      }
    } catch {
      toast.error('Cannot reach backend server.');
    }
  };

  if (checkingSetup) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-header">
            <span className="login-icon">🏨</span>
            <h1 className="login-title">Hotel POS</h1>
            <p className="login-subtitle">Checking system status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon">🏨</span>
          <h1 className="login-title">Hotel POS</h1>
          <p className="login-subtitle">
            {needsSetup
              ? 'Welcome! Create your admin account to get started.'
              : 'Sign in to manage your restaurant'}
          </p>
          {needsSetup && (
            <span className="setup-badge">✨ First-Time Setup</span>
          )}
        </div>

        {needsSetup ? (
          <form className="login-form" onSubmit={handleSetup}>
            <Input
              id="setup-username"
              label="Admin Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              error={errors.username}
              autoComplete="username"
            />
            <Input
              id="setup-email"
              label="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourhotel.com"
              autoComplete="email"
            />
            <Input
              id="setup-password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              error={errors.password}
              autoComplete="new-password"
            />
            <Input
              id="setup-confirm-password"
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
            <Button type="submit" fullWidth loading={loading} size="lg">
              Create Admin Account
            </Button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleLogin}>
            <Input
              id="login-username"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              error={errors.username}
              autoComplete="username"
            />
            <Input
              id="login-password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              error={errors.password}
              autoComplete="current-password"
            />
            <Button type="submit" fullWidth loading={loading} size="lg">
              Sign In
            </Button>
          </form>
        )}

        <div className="login-footer">
          <button className="health-check-btn" onClick={handleHealthCheck} type="button">
            🔗 Check Backend Connection
          </button>
        </div>
      </div>
    </div>
  );
}

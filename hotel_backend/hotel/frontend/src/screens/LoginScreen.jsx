import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkHealth } from '../api/auth';
import Button from '../components/Button';
import Input from '../components/Input';
import './LoginScreen.css';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const validate = () => {
    const newErrors = {};
    if (!username.trim()) newErrors.username = 'Username is required';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

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

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon">🏨</span>
          <h1 className="login-title">Hotel POS</h1>
          <p className="login-subtitle">Sign in to manage your restaurant</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
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

        <div className="login-footer">
          <button className="health-check-btn" onClick={handleHealthCheck} type="button">
            🔗 Check Backend Connection
          </button>
        </div>
      </div>
    </div>
  );
}

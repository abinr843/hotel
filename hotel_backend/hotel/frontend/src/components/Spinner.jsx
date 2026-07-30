import './Spinner.css';

export default function Spinner({ size = 40, className = '' }) {
  return (
    <div className={`spinner-wrapper ${className}`}>
      <div className="spinner" style={{ width: size, height: size }} />
    </div>
  );
}

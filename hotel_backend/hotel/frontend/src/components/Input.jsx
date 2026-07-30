import './Input.css';

export default function Input({
  label,
  error,
  id,
  type = 'text',
  ...props
}) {
  return (
    <div className={`input-group ${error ? 'input-error' : ''}`}>
      {label && <label htmlFor={id} className="input-label">{label}</label>}
      <input
        id={id}
        type={type}
        className="input-field"
        {...props}
      />
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}

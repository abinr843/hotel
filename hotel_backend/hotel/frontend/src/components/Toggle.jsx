import './Toggle.css';

export default function Toggle({ checked, onChange, label, id }) {
  return (
    <label className="toggle-wrapper" htmlFor={id}>
      <div
        className={`toggle-track ${checked ? 'toggle-on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        id={id}
      >
        <div className="toggle-thumb" />
      </div>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

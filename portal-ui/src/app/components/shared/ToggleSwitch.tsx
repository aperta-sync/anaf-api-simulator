import { ReactNode } from 'react';

interface UiToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
}

/**
 * Shared form-switch toggle used in simulation settings panels.
 */
export function UiToggleSwitch({
  id,
  checked,
  onChange,
  label,
  className = '',
}: UiToggleSwitchProps) {
  const wrapperClasses = ['form-check form-switch', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClasses}>
      <input
        className="form-check-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        id={id}
      />
      <label className="form-check-label small fw-bold" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

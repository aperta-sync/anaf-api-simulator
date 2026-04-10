import { SelectHTMLAttributes } from 'react';

interface UiSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

/**
 * Shared select control with default Bootstrap styling.
 */
export function UiSelect({
  className = '',
  children,
  ...props
}: UiSelectProps) {
  const classes = ['form-select', className].filter(Boolean).join(' ');

  return (
    <select className={classes} {...props}>
      {children}
    </select>
  );
}

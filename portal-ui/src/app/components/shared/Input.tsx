import { InputHTMLAttributes } from 'react';

interface UiInputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * Shared text/number input with default Bootstrap styling.
 */
export function UiInput({ className = '', ...props }: UiInputProps) {
  const classes = ['form-control', className].filter(Boolean).join(' ');

  return <input className={classes} {...props} />;
}

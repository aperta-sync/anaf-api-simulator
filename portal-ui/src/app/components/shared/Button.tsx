import { ButtonHTMLAttributes } from 'react';

export type UiButtonVariant = 'primary' | 'secondary' | 'link-danger';
export type UiButtonSize = 'sm' | 'md' | 'lg';

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
  size?: UiButtonSize;
  fullWidth?: boolean;
}

const VARIANT_CLASS: Record<UiButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-outline-dark',
  'link-danger': 'btn-link text-danger p-0 fw-bold',
};

const SIZE_CLASS: Record<UiButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

/**
 * Shared button primitive for consistent variant/size usage.
 */
export function UiButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: UiButtonProps) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? 'w-100' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
}

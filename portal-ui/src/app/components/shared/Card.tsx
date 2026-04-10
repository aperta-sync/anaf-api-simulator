import { HTMLAttributes, ReactNode } from 'react';

interface UiCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Shared card wrapper that keeps Bootstrap card semantics centralized.
 */
export function UiCard({ className = '', children, ...props }: UiCardProps) {
  const classes = ['card', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

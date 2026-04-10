import { ReactNode, TableHTMLAttributes } from 'react';

interface UiTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}

/**
 * Shared table primitive with default sizing/margins.
 */
export function UiTable({ className = '', children, ...props }: UiTableProps) {
  const classes = ['table mb-0', className].filter(Boolean).join(' ');

  return (
    <table className={classes} {...props}>
      {children}
    </table>
  );
}

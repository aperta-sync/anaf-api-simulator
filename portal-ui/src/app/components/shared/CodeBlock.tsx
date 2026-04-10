import { ReactNode } from 'react';

interface UiCodeBlockProps {
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Shared code display block for token snippets and payload fragments.
 */
export function UiCodeBlock({
  id,
  className = '',
  children,
}: UiCodeBlockProps) {
  const classes = ['text-break small d-block bg-light p-2 rounded', className]
    .filter(Boolean)
    .join(' ');

  return (
    <code id={id} className={classes}>
      {children}
    </code>
  );
}

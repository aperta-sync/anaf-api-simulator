interface EmptyTableRowProps {
  colSpan: number;
  message: string;
  className?: string;
}

/**
 * Shared table fallback row used when a section has no records to render.
 */
export function EmptyTableRow({
  colSpan,
  message,
  className = 'text-center py-5 text-muted',
}: EmptyTableRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className={className}>
        {message}
      </td>
    </tr>
  );
}

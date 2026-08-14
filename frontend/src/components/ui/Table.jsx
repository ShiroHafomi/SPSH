import { forwardRef } from 'react';

const Table = forwardRef(function Table({
  children,
  className = '',
  responsive = true,
  ...props
}, ref) {
  return (
    <div className={`overflow-x-auto ${responsive ? 'scrollbar-thin' : ''} ${className}`} {...props}>
      <table className="w-full" role="grid">
        {children}
      </table>
    </div>
  );
});

Table.displayName = 'Table';

const TableHeader = forwardRef(function TableHeader({
  children,
  className = '',
  ...props
}, ref) {
  return (
    <thead ref={ref} className={`${className}`} {...props}>
      {children}
    </thead>
  );
});

TableHeader.displayName = 'TableHeader';

const TableBody = forwardRef(function TableBody({
  children,
  className = '',
  ...props
}, ref) {
  return (
    <tbody ref={ref} className={`${className}`} {...props}>
      {children}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';

const TableRow = forwardRef(function TableRow({
  children,
  className = '',
  onClick,
  'aria-selected': ariaSelected,
  ...props
}, ref) {
  const isClickable = typeof onClick === 'function';
  return (
    <tr
      ref={ref}
      className={`${className} ${isClickable ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-gray-800/50' : ''}`}
      onClick={onClick}
      role={isClickable ? 'row' : undefined}
      aria-selected={ariaSelected}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      } : undefined}
      {...props}
    >
      {children}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

const TableHead = forwardRef(function TableHead({
  children,
  className = '',
  scope = 'col',
  sorted,
  onSort,
  ...props
}, ref) {
  const isSortable = typeof onSort === 'function';
  return (
    <th
      ref={ref}
      scope={scope}
      className={`px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-primary-400 dark:text-gray-400 transition-colors select-none ${className} ${isSortable ? 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400' : ''}`}
      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={onSort}
      tabIndex={isSortable ? 0 : undefined}
      onKeyDown={isSortable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(e);
        }
      } : undefined}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {children}
        {isSortable && (
          <span className="flex-shrink-0" aria-hidden="true">
            {sorted === 'asc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            ) : sorted === 'desc' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            ) : (
              <svg className="w-4 h-4 text-primary-200 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
            )}
          </span>
        )}
      </div>
    </th>
  );
});

TableHead.displayName = 'TableHead';

const TableCell = forwardRef(function TableCell({
  children,
  className = '',
  align = 'left',
  ...props
}, ref) {
  const alignments = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };
  return (
    <td
      ref={ref}
      className={`px-4 py-3 ${alignments[align]} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
});

TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
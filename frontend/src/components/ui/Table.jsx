/**
 * Table Component - Accessible, sortable, paginated data table
 */

import { forwardRef, useMemo, useState } from 'react';
import { Button } from './Button';
import { Icon, getIcon } from './Icons';
import { Badge, GradeBadge } from './Badge';

const Table = forwardRef(
  (
    {
      columns = [],
      data = [],
      keyField = 'id',
      sortable = true,
      onSort,
      sortColumn,
      sortDirection = 'asc',
      selectable = false,
      selectedRows = [],
      onSelectionChange,
      loading = false,
      emptyMessage = 'No data available',
      emptyDescription = 'Try adjusting your search or filter criteria.',
      emptyAction,
      className = '',
      rowClassName,
      onRowClick,
      pagination,
      onPageChange,
      pageSize,
      onPageSizeChange,
      striped = true,
      hoverable = true,
      bordered = true,
      children,
      responsive = true,
    },
    ref
  ) => {
    const [sortState, setSortState] = useState({ column: sortColumn, direction: sortDirection });

    const handleSort = (column) => {
      if (!sortable || !column.sortable) return;
      const newDirection = sortState.column === column.key && sortState.direction === 'asc' ? 'desc' : 'asc';
      setSortState({ column: column.key, direction: newDirection });
      onSort?.(column.key, newDirection);
    };

    const handleSelectAll = (checked) => {
      if (checked) {
        onSelectionChange?.(data.map((row) => row[keyField]));
      } else {
        onSelectionChange?.([]);
      }
    };

    const handleSelectRow = (rowId, checked) => {
      const newSelection = checked
        ? [...selectedRows, rowId]
        : selectedRows.filter((id) => id !== rowId);
      onSelectionChange?.(newSelection);
    };

    const renderCell = (row, column) => {
      const value = row[column.key];

      // Custom render function
      if (column.render) {
        return column.render(value, row);
      }

      // Grade badge
      if (column.key === 'grade' || column.type === 'grade') {
        return <GradeBadge grade={value} size="default" />;
      }

      // Status badge
      if (column.type === 'status') {
        return <StatusBadge status={value} />;
      }

      // Boolean
      if (column.type === 'boolean' || typeof value === 'boolean') {
        return (
          <Badge variant={value ? 'success' : 'gray'} size="sm" dot>
            {value ? 'Yes' : 'No'}
          </Badge>
        );
      }

      // Date
      if (column.type === 'date' || column.type === 'datetime') {
        if (!value) return <span className="text-primary-300 dark:text-gray-600 italic">—</span>;
        const date = new Date(value);
        return date.toLocaleDateString(column.type === 'datetime' ? undefined : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          ...(column.type === 'datetime' && { hour: '2-digit', minute: '2-digit' }),
        });
      }

      // Number formatting
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        if (value === null || value === undefined) return <span className="text-primary-300 dark:text-gray-600 italic">—</span>;
        const num = Number(value);
        if (column.type === 'currency') {
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        }
        if (column.type === 'percent') {
          return `${num.toFixed(1)}%`;
        }
        return num.toLocaleString();
      }

      // Default text
      if (value === null || value === undefined || value === '') {
        return <span className="text-primary-300 dark:text-gray-600 italic">—</span>;
      }

      return <span>{value}</span>;
    };

    if (children) {
      return (
        <div className={`${responsive ? 'overflow-x-auto' : ''} ${className}`}>
          <table ref={ref} className="table w-full" role="grid">
            {children}
          </table>
        </div>
      );
    }

    if (loading) {
      return (
        <div className={`table-container ${className}`}>
          <table className="table w-full" role="grid">
            <thead className="table-header">
              <tr>
                {selectable && <th className="table-header-th w-12" />}
                {columns.map((col) => (
                  <th key={col.key} className="table-header-th">
                    {col.header || col.label || col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="table-body">
              {[...Array(8)].map((_, i) => (
                <tr key={i} className="table-row">
                  {selectable && <td className="table-cell" />}
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      <div className="h-4 bg-primary-100 dark:bg-gray-700 rounded animate-shimmer" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className={`table-container ${className}`}>
        <table className="table w-full" role="grid">
          <thead className="table-header">
            <tr>
              {selectable && (
                <th className="table-header-th w-12">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === data.length && data.length > 0}
                    indeterminate={selectedRows.length > 0 && selectedRows.length < data.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 border-primary-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`table-header-th ${col.align ? `text-${col.align}` : ''} ${col.width ? `w-[${col.width}]` : ''}`}
                  style={col.style}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header || col.label || col.key}</span>
                    {sortable && col.sortable && (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className="p-0.5 text-primary-400 hover:text-primary-600 transition-colors"
                        aria-label={sortState.column === col.key ? `Sorted ${sortState.direction === 'asc' ? 'ascending' : 'descending'}` : 'Sort'}
                      >
                        {sortState.column === col.key ? (
                          sortState.direction === 'asc' ? (
                            <Icon name="chevronUp" className="w-4 h-4" />
                          ) : (
                            <Icon name="chevronDown" className="w-4 h-4" />
                          )
                        ) : (
                          <Icon name="chevronUp" className="w-4 h-4 opacity-50" />
                        )}
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="table-body">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="table-empty">
                  <div className="text-primary-300 dark:text-gray-600 mb-2">
                    <Icon name="database" className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-primary-400 dark:text-gray-500 font-medium">{emptyMessage}</p>
                  <p className="text-sm text-primary-400 dark:text-gray-500 mt-1">{emptyDescription}</p>
                  {emptyAction && <div className="mt-4">{emptyAction}</div>}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row[keyField]}
                  className={`table-row ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(row) : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="table-cell">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row[keyField])}
                        onChange={(e) => handleSelectRow(row[keyField], e.target.checked)}
                        className="h-4 w-4 border-primary-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`table-cell ${col.align ? `text-${col.align}` : ''}`}
                      style={col.style}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pagination && (
          <div className="p-4 border-t border-primary-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-primary-500 dark:text-gray-400">
              Showing {((pagination.page - 1) * (pageSize || 20)) + 1} to {Math.min(pagination.page * (pageSize || 20), pagination.total)} of {pagination.total} results
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize || 20}
                onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
                className="input input-sm w-auto"
                aria-label="Page size"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
              <nav className="flex items-center gap-1" aria-label="Pagination">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPageChange?.(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  aria-label="Previous page"
                >
                  <Icon name="chevronLeft" className="w-4 h-4" />
                </Button>
                {pagination.pages.map((page) => (
                  page === '...' ? (
                    <span key="ellipsis" className="px-2 text-primary-300 dark:text-gray-600">…</span>
                  ) : (
                    <Button
                      key={page}
                      variant={page === pagination.page ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => onPageChange?.(page)}
                      className="min-w-[36px]"
                    >
                      {page}
                    </Button>
                  )
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPageChange?.(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  aria-label="Next page"
                >
                  <Icon name="chevronRight" className="w-4 h-4" />
                </Button>
              </nav>
            </div>
          </div>
        )}
      </div>
    );
  }
);

Table.displayName = 'Table';

export const TableHeader = ({ className = '', ...props }) => (
  <thead className={`table-header ${className}`} {...props} />
);

export const TableBody = ({ className = '', ...props }) => (
  <tbody className={`table-body ${className}`} {...props} />
);

export const TableRow = ({ className = '', ...props }) => (
  <tr className={`table-row ${className}`} {...props} />
);

export const TableHead = ({ align, className = '', ...props }) => (
  <th className={`table-header-th ${align ? `text-${align}` : ''} ${className}`} {...props} />
);

export const TableCell = ({ align, className = '', ...props }) => (
  <td className={`table-cell ${align ? `text-${align}` : ''} ${className}`} {...props} />
);

// Column configuration helper
export const createColumn = (config) => ({
  key: config.key,
  header: config.header,
  label: config.label,
  type: config.type,
  sortable: config.sortable ?? true,
  render: config.render,
  align: config.align,
  width: config.width,
  style: config.style,
});

export { Table };
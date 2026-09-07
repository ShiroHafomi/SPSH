import { forwardRef, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { Button } from './Button';
import { Icon } from './Icons';
import { Badge, GradeBadge, StatusBadge } from './Badge';

const ALIGN_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function SelectAllCheckbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 rounded border-divider text-primary-600 focus:ring-2 focus:ring-primary-500"
    />
  );
}

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
      emptyMessage,
      emptyDescription,
      emptyAction,
      className = '',
      rowClassName,
      onRowClick,
      pagination,
      onPageChange,
      pageSize,
      onPageSizeChange,
      children,
      responsive = true,
    },
    ref
  ) => {
    const { lang, t } = useLanguage();
    const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
    const [sortState, setSortState] = useState({ column: sortColumn, direction: sortDirection });

    const handleSort = (column) => {
      if (!sortable || !column.sortable) return;
      const direction = sortState.column === column.key && sortState.direction === 'asc' ? 'desc' : 'asc';
      setSortState({ column: column.key, direction });
      onSort?.(column.key, direction);
    };

    const handleSelectAll = (checked) => {
      onSelectionChange?.(checked ? data.map((row) => row[keyField]) : []);
    };

    const handleSelectRow = (rowId, checked) => {
      onSelectionChange?.(
        checked ? [...selectedRows, rowId] : selectedRows.filter((id) => id !== rowId)
      );
    };

    const renderCell = (row, column) => {
      const value = row[column.key];
      if (column.render) return column.render(value, row);
      if (column.key === 'grade' || column.type === 'grade') return <GradeBadge grade={value} size="default" />;
      if (column.type === 'status') return <StatusBadge status={value} />;
      if (column.type === 'boolean' || typeof value === 'boolean') {
        return <Badge variant={value ? 'success' : 'gray'} size="sm" dot>{value ? t('common.yes') : t('common.no')}</Badge>;
      }
      if (column.type === 'date' || column.type === 'datetime') {
        if (!value) return <span className="italic text-ink-muted">—</span>;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return <span className="italic text-ink-muted">—</span>;
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          ...(column.type === 'datetime' ? { hour: '2-digit', minute: '2-digit' } : {}),
        }).format(date);
      }
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        if (value === null || value === undefined) return <span className="italic text-ink-muted">—</span>;
        const number = Number(value);
        if (!Number.isFinite(number)) return <span className="italic text-ink-muted">—</span>;
        if (column.type === 'currency') return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(number);
        if (column.type === 'percent') return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(number)}%`;
        return new Intl.NumberFormat(locale).format(number);
      }
      if (value === null || value === undefined || value === '') return <span className="italic text-ink-muted">—</span>;
      return <span className="break-words">{value}</span>;
    };

    if (children) {
      return (
        <div className={`${responsive ? 'max-w-full overflow-x-auto' : ''} ${className}`}>
          <table ref={ref} className="table">{children}</table>
        </div>
      );
    }

    if (loading) {
      return (
        <div className={`table-container ${className}`} aria-busy="true" aria-label={t('common.loading')}>
          <table className="table">
            <thead className="table-header">
              <tr>
                {selectable && <th className="table-header-th w-12" scope="col" />}
                {columns.map((column) => <th key={column.key} className="table-header-th" scope="col">{column.header || column.label || column.key}</th>)}
              </tr>
            </thead>
            <tbody className="table-body">
              {[...Array(8)].map((_, index) => (
                <tr key={index} className="table-row">
                  {selectable && <td className="table-cell" />}
                  {columns.map((column) => <td key={column.key} className="table-cell"><div className="h-4 rounded bg-surface-muted animate-shimmer" /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const effectivePageSize = pageSize || 20;
    const startResult = pagination?.total > 0 ? ((pagination.page - 1) * effectivePageSize) + 1 : 0;
    const endResult = pagination ? Math.min(pagination.page * effectivePageSize, pagination.total) : 0;

    return (
      <div className={`table-container ${className}`}>
        <table className="table">
          <thead className="table-header">
            <tr>
              {selectable && (
                <th className="table-header-th w-12" scope="col">
                  <SelectAllCheckbox
                    checked={selectedRows.length === data.length && data.length > 0}
                    indeterminate={selectedRows.length > 0 && selectedRows.length < data.length}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    label={t('table.selectAll')}
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sortState.column === column.key;
                const alignClass = ALIGN_CLASSES[column.align] || '';
                return (
                  <th
                    key={column.key}
                    className={`table-header-th ${alignClass}`}
                    style={{ ...(column.width ? { width: column.width } : {}), ...column.style }}
                    scope="col"
                    aria-sort={isSorted ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable && column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        className={`focus-ring -my-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-left transition-colors hover:text-primary-700 ${alignClass}`}
                        aria-label={t('table.sortBy', { column: column.header || column.label || column.key })}
                      >
                        <span>{column.header || column.label || column.key}</span>
                        <Icon name={isSorted && sortState.direction === 'desc' ? 'chevronDown' : 'chevronUp'} className={`size-4 ${isSorted ? '' : 'opacity-40'}`} />
                      </button>
                    ) : (
                      column.header || column.label || column.key
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="table-body">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="table-empty">
                  <Icon name="database" className="mx-auto mb-3 size-11 text-ink-muted" />
                  <p className="font-semibold text-ink">{emptyMessage || t('common.noData')}</p>
                  <p className="mt-1 text-sm text-ink-muted">{emptyDescription || t('table.emptyDescription')}</p>
                  {emptyAction && <div className="mt-4">{emptyAction}</div>}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const rowId = row[keyField];
                const activateRow = () => onRowClick?.(row);
                return (
                  <tr
                    key={rowId}
                    className={`table-row ${onRowClick ? 'focus-ring cursor-pointer' : ''} ${rowClassName ? rowClassName(row) : ''}`}
                    onClick={activateRow}
                    onKeyDown={onRowClick ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        activateRow();
                      }
                    } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {selectable && (
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(rowId)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => handleSelectRow(rowId, event.target.checked)}
                          aria-label={t('table.selectRow')}
                          className="size-4 rounded border-divider text-primary-600 focus:ring-2 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className={`table-cell ${ALIGN_CLASSES[column.align] || ''}`} style={column.style}>
                        {renderCell(row, column)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {pagination && (
          <div className="flex flex-col gap-4 border-t border-divider p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-muted">
              {t('table.paginationSummary', { start: startResult, end: endResult, total: pagination.total })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {onPageSizeChange && (
                <select
                  value={effectivePageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="input input-sm w-auto"
                  aria-label={t('table.pageSize')}
                >
                  {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{t('table.perPage', { size })}</option>)}
                </select>
              )}
              <nav className="flex flex-wrap items-center gap-1" aria-label={t('table.pagination')}>
                <Button variant="ghost" size="icon" onClick={() => onPageChange?.(pagination.page - 1)} disabled={pagination.page <= 1} aria-label={t('table.previousPage')}>
                  <Icon name="chevronLeft" className="size-4" />
                </Button>
                {(pagination.pages || []).map((page, index) => page === '...'
                  ? <span key={`ellipsis-${index}`} className="px-2 text-ink-muted">…</span>
                  : (
                    <Button key={page} variant={page === pagination.page ? 'primary' : 'ghost'} size="icon" onClick={() => onPageChange?.(page)} aria-current={page === pagination.page ? 'page' : undefined}>
                      {page}
                    </Button>
                  ))}
                <Button variant="ghost" size="icon" onClick={() => onPageChange?.(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} aria-label={t('table.nextPage')}>
                  <Icon name="chevronRight" className="size-4" />
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

export const TableHeader = ({ className = '', ...props }) => <thead className={`table-header ${className}`} {...props} />;
export const TableBody = ({ className = '', ...props }) => <tbody className={`table-body ${className}`} {...props} />;
export const TableRow = ({ className = '', ...props }) => <tr className={`table-row ${className}`} {...props} />;
export const TableHead = ({ align, className = '', ...props }) => <th className={`table-header-th ${ALIGN_CLASSES[align] || ''} ${className}`} {...props} />;
export const TableCell = ({ align, className = '', ...props }) => <td className={`table-cell ${ALIGN_CLASSES[align] || ''} ${className}`} {...props} />;

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

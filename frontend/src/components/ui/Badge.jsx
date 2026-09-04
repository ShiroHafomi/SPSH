/**
 * Badge Component - Status indicators, labels, and tags
 */

import { forwardRef } from 'react';

const Badge = forwardRef(
  (
    {
      children,
      variant = 'default',
      size = 'default',
      dot = false,
      dotColor,
      className = '',
      ...props
    },
    ref
  ) => {
    const variants = {
      default: 'bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300',
      success: 'bg-success-100 text-success-700 dark:bg-success-950/40 dark:text-success-300',
      warning: 'bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-300',
      danger: 'bg-danger-100 text-danger-700 dark:bg-danger-950/40 dark:text-danger-300',
      info: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
      accent: 'bg-accent-100 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300',
      gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      outline: 'bg-transparent border border-primary-300 text-primary-700 dark:border-gray-600 dark:text-gray-300',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      default: 'px-2.5 py-0.5 text-xs',
      lg: 'px-3 py-1 text-sm',
    };

    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1.5
          font-semibold leading-5 rounded-full
          ${variants[variant] || variants.default}
          ${sizes[size] || sizes.default}
          ${className}
        `}
        {...props}
      >
        {dot && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${dotColor || 'bg-current opacity-70'}`}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// Grade Badge - Specialized for A/B/C/D/F grades
const GradeBadge = ({ grade, size = 'default', className = '', ...props }) => {
  const variants = {
    A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    B: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    C: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    D: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
    F: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    default: 'px-3 py-1 text-base',
    lg: 'px-4 py-1.5 text-lg',
  };

  const normalizedGrade = grade?.toString().toUpperCase().charAt(0);
  const variant = variants[normalizedGrade] || variants.C;

  return (
    <span
      className={`
        inline-flex items-center justify-center
        font-bold leading-none rounded-full
        ${variant}
        ${sizes[size] || sizes.default}
        ${className}
      `}
      {...props}
    >
      {normalizedGrade}
    </span>
  );
};

GradeBadge.displayName = 'GradeBadge';

// Status Badge - For entity statuses
const StatusBadge = ({
  status,
  size = 'default',
  className = '',
  ...props
}) => {
  const statusConfig = {
    active: { variant: 'success', label: 'Active', dot: true },
    inactive: { variant: 'gray', label: 'Inactive', dot: true },
    pending: { variant: 'warning', label: 'Pending', dot: true },
    processing: { variant: 'info', label: 'Processing', dot: true },
    completed: { variant: 'success', label: 'Completed', dot: true },
    failed: { variant: 'danger', label: 'Failed', dot: true },
    cancelled: { variant: 'gray', label: 'Cancelled', dot: true },
    draft: { variant: 'gray', label: 'Draft', dot: true },
    published: { variant: 'success', label: 'Published', dot: true },
    archived: { variant: 'gray', label: 'Archived', dot: true },
    at_risk: { variant: 'danger', label: 'At Risk', dot: true },
    warning: { variant: 'warning', label: 'Warning', dot: true },
    good: { variant: 'success', label: 'Good', dot: true },
  };

  const config = statusConfig[status?.toLowerCase()] || { variant: 'default', label: status, dot: false };

  return <Badge variant={config.variant} size={size} dot={config.dot} className={className} {...props}>
    {config.label}
  </Badge>;
};

StatusBadge.displayName = 'StatusBadge';

export { Badge, GradeBadge, StatusBadge };
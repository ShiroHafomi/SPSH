/**
 * UI Components - Main Export
 * Reusable, accessible, and consistent UI components
 */

import { useState, useRef, useEffect } from 'react';

// Icons
export { icons, Icon, getIcon } from './Icons';

// Buttons
export { Button, PrimaryButton, SuccessButton, DangerButton, SecondaryButton, GhostButton, OutlineButton } from './Button';

// Inputs
export { Input, Textarea, Select, Checkbox, RadioGroup } from './Input';

// Cards
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, KPICard } from './Card';

// Badges
export { Badge, GradeBadge, StatusBadge } from './Badge';

// Modals
export { Modal, ConfirmDialog } from './Modal';

// Table
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, createColumn } from './Table';

// Dropdown
export { Dropdown, DropdownTrigger } from './Dropdown';

// Toast/Notifications
export { ToastProvider, useToast, useFlash, toast } from './Toast';

// Skeleton loading
export const Skeleton = ({ className = '', ...props }) => (
  <div className={`skeleton ${className}`} {...props} />
);

export const SkeletonCard = ({ className = '', ...props }) => (
  <div className={`card-clay p-6 space-y-4 ${className}`} {...props}>
    <div className="h-4 w-3/4 skeleton" />
    <div className="h-4 w-1/2 skeleton" />
    <div className="h-4 w-1/3 skeleton" />
  </div>
);

export const SkeletonTableRow = ({ columns = 5, className = '', ...props }) => (
  <tr className={`table-row ${className}`} {...props}>
    {[...Array(columns)].map((_, i) => (
      <td key={i} className="table-cell">
        <div className="h-4 skeleton w-full" />
      </td>
    ))}
  </tr>
);

export const SkeletonChart = ({ className = '', ...props }) => (
  <div className={`card-clay p-6 ${className}`} {...props}>
    <div className="h-6 w-1/3 skeleton mb-4" />
    <div className="h-[300px] skeleton rounded-xl" />
  </div>
);

// Layout components
export const PageContainer = ({ children, className = '', ...props }) => (
  <div className={`page-container ${className}`} {...props}>
    {children}
  </div>
);

export const PageHeader = ({ title, subtitle, actions, className = '', ...props }) => (
  <div className={`page-header ${className}`} {...props}>
    <div>
      {title && <h1 className="page-title">{title}</h1>}
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const Flex = ({ children, direction = 'row', align = 'center', justify = 'start', gap = 4, wrap = false, className = '', ...props }) => (
  <div
    className={`
      flex
      flex-${direction}
      items-${align}
      justify-${justify}
      gap-${gap}
      ${wrap ? 'flex-wrap' : ''}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
);

export const Grid = ({ children, cols = 1, gap = 5, className = '', ...props }) => (
  <div
    className={`
      grid gap-${gap}
      grid-cols-${cols}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
);

// Responsive grid helpers
export const Grid1 = ({ children, className = '', ...props }) => <Grid cols={1} className={className} {...props}>{children}</Grid>;
export const Grid2 = ({ children, className = '', ...props }) => <Grid cols={2} className={`grid-cols-1 lg:grid-cols-2 ${className}`} {...props}>{children}</Grid>;
export const Grid3 = ({ children, className = '', ...props }) => <Grid cols={3} className={`grid-cols-1 lg:grid-cols-3 ${className}`} {...props}>{children}</Grid>;
export const Grid4 = ({ children, className = '', ...props }) => <Grid cols={4} className={`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${className}`} {...props}>{children}</Grid>;

// Container
export const Container = ({ children, size = '7xl', className = '', ...props }) => (
  <div className={`max-w-${size} mx-auto px-4 sm:px-6 lg:px-8 ${className}`} {...props}>
    {children}
  </div>
);

// Section
export const Section = ({ children, className = '', ...props }) => (
  <section className={`py-8 ${className}`} {...props}>
    {children}
  </section>
);

// Divider
export const Divider = ({ className = '', ...props }) => <hr className={`border-primary-100 dark:border-gray-800 ${className}`} {...props} />;

// Spacer
export const Spacer = ({ size = 4, className = '', ...props }) => <div className={`h-${size} ${className}`} {...props} />;

// Visually hidden (for accessibility)
export const VisuallyHidden = ({ children, ...props }) => (
  <span className="sr-only" {...props}>{children}</span>
);

// Focus trap (for modals)
export const FocusTrap = ({ children, active = true, onDeactivate }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return;

    const element = ref.current;
    if (!element) return;

    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    element.addEventListener('keydown', handleTab);
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleTab);
    };
  }, [active]);

  return <div ref={ref}>{children}</div>;
};

// Loading spinner
export const Spinner = ({ size = 'default', className = '', ...props }) => {
  const sizes = {
    sm: 'w-4 h-4',
    default: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <svg
      className={`animate-spin text-primary-600 ${sizes[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

// Loading overlay
export const LoadingOverlay = ({ isLoading, children, message = 'Loading...' }) => (
  <div className="relative">
    {children}
    {isLoading && (
      <div className="absolute inset-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm flex items-center justify-center z-10">
        <div className="card-clay p-8 text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-primary-600 dark:text-gray-400">{message}</p>
        </div>
      </div>
    )}
  </div>
);

// Avatar
export const Avatar = ({ src, alt, name, size = 'default', className = '', ...props }) => {
  const sizes = {
    sm: 'size-8 text-xs',
    default: 'size-10 text-sm',
    lg: 'size-12 text-base',
    xl: 'size-16 text-lg',
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <div
      className={`
        avatar inline-flex items-center justify-center rounded-full
        bg-primary-100 text-primary-700 font-semibold
        dark:bg-primary-900 dark:text-primary-300
        select-none overflow-hidden
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {src ? (
        <img src={src} alt={alt || name || 'Avatar'} className="w-full h-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
};

// Tooltip
export const Tooltip = ({ children, content, position = 'top', className = '', ...props }) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef(null);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrows = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-primary-950 dark:border-t-gray-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary-950 dark:border-b-gray-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-primary-950 dark:border-l-gray-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-primary-950 dark:border-r-gray-900',
  };

  if (!children) return null;

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block cursor-help ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      {...props}
    >
      {children}
      {isVisible && (
        <div
          className={`
            tooltip absolute z-[70] px-3 py-1.5 text-xs font-medium text-white
            bg-primary-950 dark:bg-gray-900 rounded-lg shadow-clay-md
            ${positions[position]}
            animate-fade-in
          `}
          role="tooltip"
        >
          {content}
          <div className={`absolute w-0 h-0 border-4 border-transparent ${arrows[position]}`} />
        </div>
      )}
    </div>
  );
};
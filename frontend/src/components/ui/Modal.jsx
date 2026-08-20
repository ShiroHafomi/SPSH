/**
 * Modal Component - Accessible modal dialog with animations
 */

import { useEffect, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon, getIcon } from './Icons';

const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'default',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  footer,
  hideHeader = false,
  hideFooter = false,
}) => {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);
  const contentRef = useRef(null);

  const sizes = {
    sm: 'max-w-md',
    default: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (!closeOnEscape) return;
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements?.length) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);

      // Focus first focusable element
      setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 0);
    } else {
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={contentRef}
        className={`
          modal-content w-full max-h-[90vh] overflow-hidden animate-scale-in
          ${sizes[size]}
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (title || showCloseButton) && (
          <div className="modal-header flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 id="modal-title" className="text-lg font-bold text-primary-950 dark:text-gray-100">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="mt-1 text-sm text-primary-500 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-primary-400 hover:text-primary-600 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-primary-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                aria-label="Close modal"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="modal-body">
          {children}
        </div>

        {!hideFooter && (footer || (!hideFooter && footer !== null)) && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

Modal.displayName = 'Modal';

// Confirm Dialog - Specialized modal for confirmations
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  icon,
}) => {
  const variants = {
    danger: { icon: 'alertTriangle', color: 'text-danger-600 dark:text-danger-400', btn: 'btn-danger' },
    warning: { icon: 'alertCircle', color: 'text-warning-600 dark:text-warning-400', btn: 'btn-warning' },
    info: { icon: 'info', color: 'text-sky-600 dark:text-sky-400', btn: 'btn-primary' },
    success: { icon: 'checkCircle', color: 'text-success-600 dark:text-success-400', btn: 'btn-success' },
  };

  const config = variants[variant] || variants.danger;
  const IconComponent = icon ? getIcon(icon) : getIcon(config.icon);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      hideFooter={false}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={config.btn} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${config.color.replace('text-', 'bg-').replace('-600', '-100').replace('-400', '-900/40')} ${config.color.replace('-600', '-700').replace('-400', '-300')}`}>
            {IconComponent && <IconComponent className="w-5 h-5" />}
          </div>
          <p className="text-primary-700 dark:text-gray-300 mt-0.5">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';

export { Modal, ConfirmDialog };
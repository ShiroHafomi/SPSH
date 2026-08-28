/**
 * Modal Component - Accessible modal dialog with animations
 */

import { useEffect, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from './Icons';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

let openModalCount = 0;
let bodyOverflowBeforeModal = '';

function lockBodyScroll() {
  if (openModalCount === 0) bodyOverflowBeforeModal = document.body.style.overflow;
  openModalCount += 1;
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  if (openModalCount === 0) return;
  openModalCount -= 1;
  if (openModalCount === 0) document.body.style.overflow = bodyOverflowBeforeModal;
}

const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'default',
  showCloseButton = true,
  closeLabel = 'Close modal',
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
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  const sizes = {
    sm: 'max-w-md',
    default: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && closeOnEscapeRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
        if (!focusableElements?.length) {
          e.preventDefault();
          contentRef.current?.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const focusIsInside = modalRef.current?.contains(document.activeElement);

        if (!focusIsInside || (e.shiftKey && document.activeElement === firstElement)) {
          e.preventDefault();
          (e.shiftKey ? lastElement : firstElement).focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    previousActiveElement.current = document.activeElement;
    lockBodyScroll();

    return () => {
      unlockBodyScroll();
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector(FOCUSABLE_SELECTOR);
      (firstFocusable || contentRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
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
          modal-content flex w-full max-h-[90vh] flex-col overflow-hidden animate-scale-in
          ${sizes[size]}
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {!hideHeader && (title || showCloseButton) && (
          <div className="modal-header flex shrink-0 items-start justify-between gap-4">
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
                aria-label={closeLabel}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="modal-body min-h-0 overflow-y-auto">
          {children}
        </div>

        {!hideFooter && (footer || (!hideFooter && footer !== null)) && (
          <div className="modal-footer shrink-0">
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
  closeLabel,
}) => {
  const variants = {
    danger: { icon: 'alertTriangle', color: 'text-danger-600 dark:text-danger-400', btn: 'danger' },
    warning: { icon: 'alertCircle', color: 'text-warning-600 dark:text-warning-400', btn: 'danger' },
    info: { icon: 'info', color: 'text-sky-600 dark:text-sky-400', btn: 'primary' },
    success: { icon: 'checkCircle', color: 'text-success-600 dark:text-success-400', btn: 'success' },
  };

  const config = variants[variant] || variants.danger;
  const iconName = icon || config.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
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
            <Icon name={iconName} className="w-5 h-5" />
          </div>
          <p className="text-primary-700 dark:text-gray-300 mt-0.5">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';

export { Modal, ConfirmDialog };
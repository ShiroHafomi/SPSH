import { Fragment, useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../hooks/useLanguage';
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
  ariaLabel,
  children,
  size = 'default',
  showCloseButton = true,
  closeLabel,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  footer,
  hideHeader = false,
  hideFooter = false,
}) => {
  const { t } = useLanguage();
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
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
    full: 'max-w-[calc(100vw-2rem)]',
  };

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && closeOnEscapeRef.current) {
      event.preventDefault();
      onCloseRef.current?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusableElements = modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
    if (!focusableElements?.length) {
      event.preventDefault();
      contentRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const focusIsInside = modalRef.current?.contains(document.activeElement);
    if (!focusIsInside || (event.shiftKey && document.activeElement === firstElement)) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousActiveElement.current = document.activeElement;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
      previousActiveElement.current?.focus?.();
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

  return createPortal(
    <div
      ref={modalRef}
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      aria-label={title ? undefined : ariaLabel || t('common.dialog')}
    >
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] animate-fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={contentRef}
        className={`modal-content relative flex max-h-[90vh] w-full flex-col overflow-hidden animate-scale-in ${sizes[size] || sizes.default} ${className}`}
        tabIndex={-1}
      >
        {!hideHeader && (title || description || showCloseButton) && (
          <div className="modal-header shrink-0 items-start">
            <div className="min-w-0 flex-1">
              {title && <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>}
              {description && <p id={descriptionId} className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
            {showCloseButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="-mr-2 -mt-2"
                aria-label={closeLabel || t('common.close')}
              >
                <Icon name="x" className="size-5" />
              </Button>
            )}
          </div>
        )}

        <div className="modal-body min-h-0 overflow-y-auto">{children}</div>

        {!hideFooter && footer !== null && footer !== undefined && (
          <div className="modal-footer shrink-0">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};

Modal.displayName = 'Modal';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  loading = false,
  icon,
  closeLabel,
}) => {
  const { t } = useLanguage();
  const variants = {
    danger: { icon: 'alertTriangle', box: 'bg-danger-100 text-danger-700 dark:bg-danger-950/60 dark:text-danger-300', button: 'danger' },
    warning: { icon: 'alertCircle', box: 'bg-warning-100 text-warning-700 dark:bg-warning-950/60 dark:text-warning-300', button: 'danger' },
    info: { icon: 'info', box: 'bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200', button: 'primary' },
    success: { icon: 'checkCircle', box: 'bg-success-100 text-success-700 dark:bg-success-950/60 dark:text-success-300', button: 'success' },
  };
  const config = variants[variant] || variants.danger;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || t('common.confirm')}
      closeLabel={closeLabel}
      size="sm"
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
            {cancelText || t('common.cancel')}
          </Button>
          <Button variant={config.button} onClick={onConfirm} loading={loading} className="w-full sm:w-auto">
            {confirmText || t('common.confirm')}
          </Button>
        </Fragment>
      }
    >
      <div className="flex items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${config.box}`}>
          <Icon name={icon || config.icon} className="size-5" />
        </div>
        <p className="min-w-0 pt-1 text-ink-muted">{message}</p>
      </div>
    </Modal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';

export { Modal, ConfirmDialog };

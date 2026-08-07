import { useEffect, useRef } from 'react';
import { useLanguage } from '../hooks/useLanguage';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText,
  cancelText,
  variant = 'danger',
  loading = false,
}) {
  const { t } = useLanguage();
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);

  const resolvedConfirmText = confirmText ?? t('common.delete');
  const resolvedCancelText = cancelText ?? t('common.cancel');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      dialogRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && !loading) onConfirm();
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const variantColors = {
    danger: 'bg-danger-600 hover:bg-danger-700 focus:ring-danger-500',
    primary: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
    warning: 'bg-warning-600 hover:bg-warning-700 focus:ring-warning-500',
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        ref={dialogRef}
        className="card p-6 max-w-md w-full"
        tabIndex={-1}
      >
        <h3 id="confirm-title" className="text-lg font-bold text-primary-950 dark:text-gray-100 mb-2">
          {title}
        </h3>
        <p className="text-primary-600 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary">
            {resolvedCancelText}
          </button>
          <button onClick={onConfirm} disabled={loading} className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}>
            {loading ? t('common.deleting') : resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
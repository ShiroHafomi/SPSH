import { forwardRef, useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = forwardRef(function Modal({
  isOpen,
  onClose,
  title,
  size = 'default',
  children,
  'aria-describedby': ariaDescribedBy,
}, ref) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    default: 'max-w-md',
    sm: 'max-w-sm',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={ariaDescribedBy}
      ref={ref}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className={`relative w-full ${sizes[size]} transform overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-xl transition-all animate-slide-up`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-primary-200 dark:border-gray-700">
            <h2 id="modal-title" className="text-lg font-semibold text-primary-950 dark:text-gray-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-primary-400 hover:text-primary-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-lg hover:bg-primary-100 dark:hover:bg-gray-800 transition-colors focus-ring"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
});

Modal.displayName = 'Modal';

export { Modal };
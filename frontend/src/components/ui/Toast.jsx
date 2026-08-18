/**
 * Toast/Notification Components - Accessible toast notifications
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Icon, getIcon } from './Icons';

// Toast Context
const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Toast Provider
export const ToastProvider = ({ children, position = 'top-right', maxToasts = 5, defaultDuration = 5000 }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      duration: defaultDuration,
      ...toast,
    };
    setToasts((prev) => [newToast, ...prev].slice(0, maxToasts));
    return id;
  }, [maxToasts, defaultDuration]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const positions = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
      {children}
      <div
        className={`fixed z-[100] flex flex-col gap-2 ${positions[position]} pointer-events-none`}
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
            onUpdate={(updates) => updateToast(toast.id, updates)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Individual Toast
const Toast = ({ toast, onClose, onUpdate }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev - (100 / (toast.duration / 50));
          if (next <= 0) {
            clearInterval(interval);
            setIsVisible(false);
            setTimeout(onClose, 200);
            return 0;
          }
          return next;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [toast.duration, onClose]);

  const variants = {
    success: {
      bg: 'bg-success-50 dark:bg-success-950/30',
      border: 'border-success-200 dark:border-success-900/50',
      icon: 'checkCircle',
      iconColor: 'text-success-600 dark:text-success-400',
      text: 'text-success-700 dark:text-success-300',
    },
    error: {
      bg: 'bg-danger-50 dark:bg-danger-950/30',
      border: 'border-danger-200 dark:border-danger-900/50',
      icon: 'alertCircle',
      iconColor: 'text-danger-600 dark:text-danger-400',
      text: 'text-danger-700 dark:text-danger-300',
    },
    warning: {
      bg: 'bg-warning-50 dark:bg-warning-950/30',
      border: 'border-warning-200 dark:border-warning-900/50',
      icon: 'alertTriangle',
      iconColor: 'text-warning-600 dark:text-warning-400',
      text: 'text-warning-700 dark:text-warning-300',
    },
    info: {
      bg: 'bg-sky-50 dark:bg-sky-950/30',
      border: 'border-sky-200 dark:border-sky-900/50',
      icon: 'info',
      iconColor: 'text-sky-600 dark:text-sky-400',
      text: 'text-sky-700 dark:text-sky-300',
    },
    default: {
      bg: 'bg-primary-50 dark:bg-primary-950/30',
      border: 'border-primary-200 dark:border-primary-900/50',
      icon: 'info',
      iconColor: 'text-primary-600 dark:text-primary-400',
      text: 'text-primary-700 dark:text-primary-300',
    },
  };

  const variant = variants[toast.type] || variants.default;
  const IconComponent = getIcon(toast.icon || variant.icon);

  if (!isVisible) return null;

  return createPortal(
    <div
      className={`
        toast pointer-events-auto w-full max-w-sm
        card-clay ${variant.bg} ${variant.border} border
        animate-slide-in overflow-hidden
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${variant.iconColor}/10`}>
            {IconComponent && <IconComponent className={`w-5 h-5 ${variant.iconColor}`} />}
          </div>
          <div className="flex-1 min-w-0">
            {toast.title && (
              <p className={`font-semibold ${variant.text}`}>{toast.title}</p>
            )}
            {toast.message && (
              <p className={`text-sm mt-1 ${variant.text}/90`}>{toast.message}</p>
            )}
          </div>
          {toast.action && (
            <button
              onClick={() => {
                toast.action.onClick?.();
                onClose();
              }}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 text-primary-400 hover:text-primary-600 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-primary-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Dismiss"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>
      {toast.duration && toast.duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-current/20"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
    </div>,
    document.body
  );
};

Toast.displayName = 'Toast';

// Helper hook for easier usage
export const useFlash = () => {
  const { addToast } = useToast();

  const addFlash = useCallback((message, type = 'info', options = {}) => {
    return addToast({ message, type, ...options });
  }, [addToast]);

  return { addFlash, addToast };
};

// Toast types helpers
export const toast = {
  success: (message, options = {}) => ({ type: 'success', message, ...options }),
  error: (message, options = {}) => ({ type: 'error', message, ...options }),
  warning: (message, options = {}) => ({ type: 'warning', message, ...options }),
  info: (message, options = {}) => ({ type: 'info', message, ...options }),
};
import { useState, useEffect } from 'react';

export function FlashMessage({ message, type = 'success', onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose?.(), 200);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!visible) return null;

  const colors = {
    success: 'bg-success-50 dark:bg-success-950/30 border-success-200 dark:border-success-800 text-success-700 dark:text-success-300',
    error: 'bg-danger-50 dark:bg-danger-950/30 border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-300',
    info: 'bg-primary-50 dark:bg-primary-950/30 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300',
    warning: 'bg-warning-50 dark:bg-warning-950/30 border-warning-200 dark:border-warning-800 text-warning-700 dark:text-warning-300',
  };

  return (
    <div
      className={`mb-6 p-4 border rounded-xl flex items-center justify-between animate-slide-in ${colors[type] || colors.info}`}
      role="alert"
    >
      <span>{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onClose?.(), 200);
        }}
        className="opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}

export function FlashContainer({ messages, onRemove }) {
  return (
    <div>
      {messages.map((msg, index) => (
        <FlashMessage
          key={index}
          message={msg.message}
          type={msg.type}
          onClose={() => onRemove(index)}
        />
      ))}
    </div>
  );
}
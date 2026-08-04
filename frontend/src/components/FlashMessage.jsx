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
    success: 'bg-success-50 border-success-200 text-success-700',
    error: 'bg-danger-50 border-danger-200 text-danger-700',
    info: 'bg-primary-50 border-primary-200 text-primary-700',
    warning: 'bg-warning-50 border-warning-200 text-warning-700',
  };

  return (
    <div
      className={`mb-6 p-4 border rounded-lg flex items-center justify-between animate-slide-in ${colors[type] || colors.info}`}
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
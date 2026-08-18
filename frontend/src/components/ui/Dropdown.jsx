/**
 * Dropdown Component - Accessible dropdown menu
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon, getIcon } from './Icons';

const Dropdown = ({
  trigger,
  items = [],
  align = 'right',
  className = '',
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  const handleClickOutside = useCallback((event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setIsOpen(false);
        onClose?.();
      }
    }
  }, [onClose]);

  const handleKeyDown = useCallback((event) => {
    if (!isOpen) return;

    const focusableItems = dropdownRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])');
    if (!focusableItems?.length) return;

    const currentIndex = Array.from(focusableItems).findIndex((item) => item === document.activeElement);

    switch (event.key) {
      case 'Escape':
        setIsOpen(false);
        triggerRef.current?.focus();
        onClose?.();
        break;
      case 'ArrowDown':
        event.preventDefault();
        const nextIndex = currentIndex < focusableItems.length - 1 ? currentIndex + 1 : 0;
        focusableItems[nextIndex]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusableItems.length - 1;
        focusableItems[prevIndex]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        focusableItems[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        focusableItems[focusableItems.length - 1]?.focus();
        break;
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClickOutside, handleKeyDown]);

  const dropdownContent = isOpen ? (
    <div
      ref={dropdownRef}
      className={`dropdown-menu ${align === 'left' ? 'left-0' : 'right-0'}`}
      role="menu"
      aria-orientation="vertical"
    >
      {items.map((item, index) => {
        if (item.type === 'divider') {
          return <div key={`divider-${index}`} className="dropdown-divider" role="separator" />;
        }
        if (item.type === 'header') {
          return (
            <div key={`header-${index}`} className="px-3 py-2 text-xs font-semibold text-primary-400 dark:text-gray-500 uppercase tracking-wider">
              {item.label}
            </div>
          );
        }
        return (
          <button
            key={item.key || index}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              item.onClick?.();
              if (!item.keepOpen) {
                setIsOpen(false);
                onClose?.();
              }
            }}
            disabled={item.disabled}
            className={`dropdown-item w-full text-left ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${item.destructive ? 'text-danger-600 dark:text-danger-400' : ''}`}
            aria-disabled={item.disabled}
          >
            {item.icon && (
              <span className="flex-shrink-0 w-5 h-5" aria-hidden="true">
                {typeof item.icon === 'string' ? getIcon(item.icon) : item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-primary-400 dark:text-gray-500 font-mono">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {typeof trigger === 'function' ? trigger({ isOpen }) : trigger}
      </div>
      {createPortal(dropdownContent, document.body)}
    </div>
  );
};

Dropdown.displayName = 'Dropdown';

export { Dropdown };

// Dropdown Trigger button
const DropdownTrigger = ({ children, className = '', ...props }) => (
  <Button variant="ghost" className={className} {...props}>
    {children}
  </Button>
);

DropdownTrigger.displayName = 'DropdownTrigger';

export { DropdownTrigger };
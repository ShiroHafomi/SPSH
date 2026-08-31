/**
 * Input Component - Form input with label, error, hint, and icon support
 */

import { forwardRef, useId } from 'react';
import { Icon } from './Icons';

const Input = forwardRef(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      leftElement,
      rightElement,
      className = '',
      inputClassName = '',
      id: providedId,
      disabled = false,
      required = false,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

    const iconNode = (icon) => {
      if (!icon) return null;
      if (typeof icon === 'string') {
        return <Icon name={icon} className="w-5 h-5" />;
      }
      return icon;
    };

    return (
      <div className={`form-field ${className}`}>
        {label && (
          <label htmlFor={id} className="label">
            {label}
            {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400 dark:text-gray-500">
              {iconNode(leftIcon)}
            </div>
          )}
          {leftElement && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {leftElement}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            aria-required={required}
            className={`
              input
              ${leftIcon || leftElement ? 'pl-10' : ''}
              ${rightIcon || rightElement ? 'pr-10' : ''}
              ${error ? 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500' : ''}
              ${disabled ? 'bg-primary-50 dark:bg-gray-800 cursor-not-allowed' : ''}
              ${inputClassName}
            `}
            {...props}
          />

          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-primary-400 dark:text-gray-500">
              {iconNode(rightIcon)}
            </div>
          )}
          {rightElement && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} className="form-field-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="form-field-hint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };

// Textarea component
const Textarea = forwardRef(
  (
    {
      label,
      error,
      hint,
      className = '',
      textareaClassName = '',
      id: providedId,
      disabled = false,
      required = false,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`form-field ${className}`}>
        {label && (
          <label htmlFor={id} className="label">
            {label}
            {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          aria-required={required}
          rows={rows}
          className={`
            input resize-y min-h-[80px]
            ${error ? 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500' : ''}
            ${disabled ? 'bg-primary-50 dark:bg-gray-800 cursor-not-allowed' : ''}
            ${textareaClassName}
          `}
          {...props}
        />

        {error && (
          <p id={errorId} className="form-field-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="form-field-hint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };

// Select component
const Select = forwardRef(
  (
    {
      label,
      error,
      hint,
      options = [],
      placeholder,
      className = '',
      selectClassName = '',
      id: providedId,
      disabled = false,
      required = false,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`form-field ${className}`}>
        {label && (
          <label htmlFor={id} className="label">
            {label}
            {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <select
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          aria-required={required}
          className={`
            input cursor-pointer appearance-none
            bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%236366f1%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m2%205%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
            bg-[length:1em_1em] bg-[right_0.75rem_center] bg-no-repeat pr-10
            ${error ? 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500' : ''}
            ${disabled ? 'bg-primary-50 dark:bg-gray-800 cursor-not-allowed' : ''}
            ${selectClassName}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {error && (
          <p id={errorId} className="form-field-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="form-field-hint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };

// Checkbox component
const Checkbox = forwardRef(
  (
    {
      label,
      description,
      error,
      className = '',
      id: providedId,
      disabled = false,
      required = false,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const descriptionId = `${id}-description`;
    const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`form-field ${className}`}>
        <label
          htmlFor={id}
          className={`flex min-h-11 items-start gap-3 rounded-lg py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <input
            ref={ref}
            type="checkbox"
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className="mt-0.5 size-4 rounded border-divider text-primary-600 focus:ring-2 focus:ring-primary-500"
            {...props}
          />
          <span className="min-w-0 flex-1">
            {label && (
              <span className="block text-sm font-semibold text-ink">
                {label}
                {required && <span className="ml-1 text-danger-500" aria-hidden="true">*</span>}
              </span>
            )}
            {description && <span id={descriptionId} className="mt-0.5 block text-sm text-ink-muted">{description}</span>}
          </span>
        </label>
        {error && (
          <p id={errorId} className="form-field-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };

// Radio Group component
const RadioGroup = ({
  label,
  options = [],
  error,
  hint,
  className = '',
  name,
  required = false,
  disabled = false,
  value,
  onChange,
}) => {
    const errorId = `${name}-error`;
    const hintId = `${name}-hint`;
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

    return (
      <fieldset className={`form-field ${className}`} aria-describedby={describedBy} disabled={disabled}>
        {label && (
          <legend className="label">
            {label}
            {required && <span className="ml-1 text-danger-500" aria-hidden="true">*</span>}
          </legend>
        )}

        <div className="flex flex-wrap gap-2" aria-required={required}>
          {options.map((option) => {
            const optionDisabled = disabled || option.disabled;
            return (
              <label
                key={option.value}
                className={`flex min-h-11 items-center gap-2 rounded-lg border border-divider px-3 py-2 transition-colors ${
                  optionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={onChange}
                  disabled={optionDisabled}
                  className="size-4 border-divider text-primary-600 focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-ink">{option.label}</span>
              </label>
            );
          })}
        </div>

        {error && (
          <p id={errorId} className="form-field-error" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="form-field-hint">
            {hint}
          </p>
        )}
      </fieldset>
    );
};

RadioGroup.displayName = 'RadioGroup';

export { RadioGroup };
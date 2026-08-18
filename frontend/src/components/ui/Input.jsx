/**
 * Input Component - Form input with label, error, hint, and icon support
 */

import { forwardRef, useId } from 'react';
import { getIcon } from './Icons';

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
        const IconSvg = getIcon(icon);
        return IconSvg ? <IconSvg className="w-5 h-5" aria-hidden="true" /> : null;
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
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
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
    const describedBy = error ? errorId : undefined;

    return (
      <div className={`form-field flex items-start gap-3 ${className}`}>
        <input
          ref={ref}
          type="checkbox"
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className={`
            h-4 w-4 mt-0.5 border-primary-300 text-primary-600
            focus:ring-primary-500 focus:ring-2
            rounded transition-colors
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
          {...props}
        />
        <div className="flex-1">
          {label && (
            <label htmlFor={id} className="label cursor-pointer mb-0">
              {label}
              {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
            </label>
          )}
          {description && <p className="text-xs text-primary-400 dark:text-gray-500 mt-0.5">{description}</p>}
        </div>
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
const RadioGroup = (
  {
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
  } => {
    const errorId = `${name}-error`;
    const hintId = `${name}-hint`;
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`form-field ${className}`}>
        {label && (
          <label className="label">
            {label}
            {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <fieldset aria-describedby={describedBy} disabled={disabled}>
          <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={label} aria-required={required}>
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={onChange}
                  disabled={disabled || option.disabled}
                  className={`
                    h-4 w-4 border-primary-300 text-primary-600
                    focus:ring-primary-500 focus:ring-2
                    ${disabled || option.disabled ? 'cursor-not-allowed opacity-50' : ''}
                  `}
                  aria-label={option.label}
                />
                <span className="text-sm text-primary-700 dark:text-gray-300">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

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

RadioGroup.displayName = 'RadioGroup';

export { RadioGroup };
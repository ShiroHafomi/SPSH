'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useForm, Controller, ControllerProps, Control } from 'react-hook-form';
import { Slot } from '@radix-ui/react-slot';

// Re-export useForm from react-hook-form
export { useForm };

// Form component - properly typed
const Form = React.forwardRef<HTMLFormElement, React.ComponentPropsWithoutRef<'form'> & {}>
  ((props, ref) => <form {...props} ref={ref} />);
Form.displayName = 'Form';

export { Form };

// FormField - use any types to avoid strict generic issues
export const FormField = React.forwardRef<
  React.ElementRef<typeof Slot>,
  Omit<ControllerProps, 'control'> & React.ComponentPropsWithoutRef<typeof Slot> & { control: any }
>(({ control, name, rules, ...props }, ref) => {
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field }) => (
        <Slot {...props} {...field} />
      )}
    />
  );
});
FormField.displayName = 'FormField';

// FormItem
export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {}

export const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('space-y-2', className)} {...props} />
));
FormItem.displayName = 'FormItem';

// FormLabel
export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
));
FormLabel.displayName = 'FormLabel';

// FormControl
export interface FormControlProps extends React.ComponentPropsWithoutRef<typeof Slot> {}

export const FormControl = React.forwardRef<React.ElementRef<typeof Slot>, FormControlProps>(({ className, ...props }, ref) => (
  <Slot ref={ref} className={cn('', className)} {...props} />
));
FormControl.displayName = 'FormControl';

// FormDescription
export interface FormDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const FormDescription = React.forwardRef<HTMLParagraphElement, FormDescriptionProps>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
FormDescription.displayName = 'FormDescription';

// FormMessage
export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(({ className, children, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm font-medium text-destructive', className)} {...props}>
    {children}
  </p>
));
FormMessage.displayName = 'FormMessage';
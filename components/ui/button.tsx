'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * iOS-style buttons: filled shapes with no stroke, 17px semibold label, and
 * feedback that lands the instant a finger goes down rather than on release.
 *
 * Sizes are the caregiver's chrome, not the communicator's board. The board
 * has its own tiles sized from the tap calibration; 44px stays the floor here
 * because that is the smallest reliable touch target.
 */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color,opacity] duration-100 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--focus)] text-[var(--focus-ink)] active:bg-[var(--focus-strong)]',
        secondary: 'bg-[var(--tint-soft)] text-[var(--focus)] active:bg-[var(--tint-strong)]',
        ghost: 'text-[var(--focus)] active:bg-[var(--fill-press)]',
        danger: 'bg-[var(--danger-soft)] text-[var(--danger)] active:opacity-75',
      },
      size: {
        md: 'min-h-[44px] px-5 text-[17px]',
        lg: 'min-h-[50px] px-6 text-[17px]',
        xl: 'min-h-[56px] px-7 text-[17px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

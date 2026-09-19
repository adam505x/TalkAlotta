'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--focus)] text-white hover:opacity-90',
        secondary:
          'border-2 border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--ink-soft)]',
        ghost: 'text-[var(--ink)] hover:bg-black/5',
        danger: 'border-2 border-[#d6336c] bg-[var(--card)] text-[#d6336c]',
      },
      size: {
        // 44px minimum height: the smallest reliable touch target.
        md: 'min-h-[44px] px-4 py-2 text-base',
        lg: 'min-h-[56px] px-6 py-3 text-lg',
        xl: 'min-h-[72px] px-8 py-4 text-xl',
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

'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'text-[var(--teal-ink)] bg-[var(--teal)] hover:opacity-90',
        secondary:
          'border-2 border-[#cfcfc4] bg-white text-[var(--ink)] hover:border-[var(--ink-soft)]',
        selected: 'border-2 border-[var(--teal)] bg-[#eaf3f3] text-[var(--teal)]',
        ghost: 'text-[var(--ink)] hover:bg-black/5',
        danger: 'border-2 border-[var(--danger)] bg-white text-[var(--danger)]',
      },
      size: {
        // 44px minimum height: the smallest reliable touch target.
        md: 'min-h-[44px] px-4 py-2 text-base',
        lg: 'min-h-[56px] px-6 py-3 text-lg',
        xl: 'min-h-[64px] px-8 py-4 text-xl',
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

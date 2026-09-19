'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/cn';

/**
 * A centred card over a dimmed board. Clicking the backdrop or pressing Escape
 * closes it; clicking inside does not.
 */
export function Sheet({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={cn('sheet-card', wide && 'sheet-card--wide')}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="sheet__title">{title}</h2>
        {children}
        <button type="button" className="sheet__cancel" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

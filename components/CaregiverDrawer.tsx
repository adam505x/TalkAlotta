'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Caregiver mode, as a drawer from the left.
 *
 * It deliberately covers only part of the screen. The board stays visible beside
 * it, which is the point: turning on edit mode and then changing a picture should
 * happen while looking at the board being changed, not on a separate screen.
 */

export type CaregiverAction =
  | 'dashboard'
  | 'settings'
  | 'edit-boards'
  | 'saved-boards'
  | 'edit-icons'
  | 'add-image';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ICONS: Record<CaregiverAction, React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke} />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" {...stroke} />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        {...stroke}
      />
    </svg>
  ),
  'edit-boards': (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" {...stroke} />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" {...stroke} />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" {...stroke} />
      <path d="M17.2 17.2h4M19.2 15.2v4" {...stroke} />
    </svg>
  ),
  'saved-boards': (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        {...stroke}
      />
      <path d="M3 11h18" {...stroke} />
    </svg>
  ),
  'edit-icons': (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" {...stroke} />
      <circle cx="8.5" cy="9" r="1.8" {...stroke} />
      <path d="M4.5 16.5l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" {...stroke} />
    </svg>
  ),
  'add-image': (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" {...stroke} />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...stroke} />
    </svg>
  ),
};

const ITEMS: { id: CaregiverAction; label: string; blurb: string }[] = [
  { id: 'dashboard', label: 'Dashboard', blurb: 'Most said sentences and words' },
  { id: 'edit-boards', label: 'Edit boards', blurb: 'Tap a button to change its picture' },
  { id: 'edit-icons', label: 'Edit icons', blurb: 'Change the picture for any word' },
  { id: 'add-image', label: 'Add image', blurb: 'Upload your own photo' },
  { id: 'saved-boards', label: 'Saved boards', blurb: 'Situations already described' },
  { id: 'settings', label: 'Settings', blurb: 'Size, spacing, eyesight, voice' },
];

export function CaregiverDrawer({
  onClose,
  onAction,
  editMode,
}: {
  onClose: () => void;
  onAction: (action: CaregiverAction) => void;
  editMode: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="false" aria-label="Caregiver mode">
        <div className="flex items-center justify-between gap-3">
          <p className="sheet__label">Caregiver mode</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close caregiver mode"
            className="min-h-[44px] px-2 text-xl font-bold"
            style={{ color: '#6c727b' }}
          >
            &#10005;
          </button>
        </div>

        <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
          The board stays visible, so you can make changes while looking at it.
        </p>

        {ITEMS.map((item) => {
          const pressed = item.id === 'edit-boards' && editMode;
          return (
            <button
              key={item.id}
              type="button"
              className="drawer-item"
              aria-pressed={item.id === 'edit-boards' ? editMode : undefined}
              onClick={() => {
                if (item.id === 'settings') {
                  router.push('/settings');
                  return;
                }
                onAction(item.id);
              }}
            >
              <span style={{ color: 'var(--teal)' }}>{ICONS[item.id]}</span>
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-bold leading-tight">
                  {item.label}
                  {pressed ? ' · on' : ''}
                </span>
                <span className="text-xs font-semibold leading-snug" style={{ color: '#6c727b' }}>
                  {item.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </aside>
    </>
  );
}

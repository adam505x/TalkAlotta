'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { searchCountries } from '@/lib/countries';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Type to narrow the list, or open it and scroll. Whatever is typed stands on
 * its own, so a region that is not on the list is still a valid answer.
 */
export function CountrySelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();

  const matches = useMemo(() => searchCountries(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault();
      select(matches[activeIndex].name);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex items-center rounded-[14px]"
        style={{ border: '1px solid var(--line)', background: 'var(--card)' }}
      >
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Country or region"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-[56px] flex-1 rounded-[14px] bg-transparent px-4 text-[17px] outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close the country list' : 'Show all countries'}
          className="flex h-[56px] w-[48px] shrink-0 items-center justify-center"
          style={{ color: 'var(--ink-soft)' }}
        >
          <Chevron open={open} />
        </button>
      </div>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[320px] overflow-y-auto rounded-[14px] py-1"
          style={{
            border: '1px solid var(--line)',
            background: 'var(--card)',
            boxShadow: '0 12px 32px rgb(0 0 0 / 0.14)',
          }}
        >
          {matches.length === 0 ? (
            <li className="px-4 py-4 text-[15px]" style={{ color: 'var(--ink-soft)' }}>
              No country matches that. Continue will use exactly what you typed.
            </li>
          ) : (
            matches.map((country, index) => {
              const selected = country.name === value;
              const active = index === activeIndex;
              return (
                <li key={country.name} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => select(country.name)}
                    onPointerEnter={() => setActiveIndex(index)}
                    className="option-row flex min-h-[50px] w-full items-center px-4 text-left text-[17px]"
                    style={{
                      background: active || selected ? 'var(--tint-soft)' : 'transparent',
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {country.name}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

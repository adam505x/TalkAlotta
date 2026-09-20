'use client';

import { useCallback, useState } from 'react';
import type { WordRole } from '@/lib/core-words';

/**
 * Create a button or a folder.
 *
 * Plain language throughout: a parent picks "Doing word", never "verb", and the
 * word "category" appears nowhere.
 *
 * THE PICTURE IS CHOSEN, NOT GUESSED. Taking the library's first result for a
 * name gives things like a factory for "Liam", and a wrong picture on a
 * communicator's board is worse than no button at all. So typing a word shows
 * what is available and the caregiver picks, with their own photo as the answer
 * for anything the library will never have.
 */

const KINDS: { role: WordRole; label: string; bg: string; fg: string }[] = [
  { role: 'pronoun', label: 'Person', bg: 'var(--role-pronoun-bg)', fg: 'var(--role-pronoun-fg)' },
  { role: 'verb', label: 'Doing word', bg: 'var(--role-verb-bg)', fg: 'var(--role-verb-fg)' },
  { role: 'noun', label: 'Thing', bg: 'var(--role-noun-bg)', fg: 'var(--role-noun-fg)' },
  {
    role: 'adjective',
    label: 'Describing word',
    bg: 'var(--role-adjective-bg)',
    fg: 'var(--role-adjective-fg)',
  },
  {
    role: 'preposition',
    label: 'Saying',
    bg: 'var(--role-preposition-bg)',
    fg: 'var(--role-preposition-fg)',
  },
  {
    role: 'question',
    label: 'Asking word',
    bg: 'var(--role-question-bg)',
    fg: 'var(--role-question-fg)',
  },
];

interface Candidate {
  imageUrl: string;
  name: string;
  score: number;
  source: string;
}

export interface AddRequest {
  kind: 'button' | 'folder';
  label: string;
  role: WordRole;
  /** The picture the caregiver chose, if they chose one. */
  imageUrl?: string;
  /** Existing folder to put a new button in. */
  folderId?: string;
}

export interface AddFolderChoice {
  id: string;
  title: string;
  role: WordRole;
  group: 'always' | 'moment';
}

export function AddThingSheet({
  folderTitle,
  folders,
  currentFolderId,
  canAddButton,
  busy,
  error,
  onAdd,
  onClose,
}: {
  folderTitle: string | null;
  folders: AddFolderChoice[];
  currentFolderId: string | null;
  canAddButton: boolean;
  busy?: boolean;
  error?: string | null;
  onAdd: (request: AddRequest) => void;
  onClose: () => void;
}) {
  const [isFolder, setIsFolder] = useState(!canAddButton);
  const [label, setLabel] = useState('');
  const [folderId, setFolderId] = useState(currentFolderId ?? folders[0]?.id ?? '');
  const chosenFolder = folders.find((folder) => folder.id === folderId) ?? folders[0] ?? null;
  const [role, setRole] = useState<WordRole>(chosenFolder?.role ?? 'noun');

  const [options, setOptions] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  /** Look for pictures. Defaults to the word itself, but anything can be tried. */
  const findPictures = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setSearching(true);
    setSearchError(null);
    setSearchTerm(clean);
    try {
      const res = await fetch(`/api/symbols?q=${encodeURIComponent(clean)}`);
      const body = (await res.json()) as { results?: Candidate[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not look for pictures.');
      setOptions(body.results ?? []);
      setChosen(body.results?.[0]?.imageUrl ?? null);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Could not look for pictures.');
    } finally {
      setSearching(false);
    }
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!label.trim()) return;
          onAdd({
            kind: isFolder ? 'folder' : 'button',
            label: label.trim(),
            role,
            imageUrl: chosen ?? undefined,
            folderId: isFolder ? undefined : folderId,
          });
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Add something new"
      >
        <h2 className="sheet__title">Add something new</h2>

        <div className="seg">
          <button
            type="button"
            className={`seg__opt${!isFolder ? ' is-on' : ''}`}
            onClick={() => setIsFolder(false)}
            disabled={!canAddButton}
            title={canAddButton ? undefined : 'There is no folder to put a button in yet'}
          >
            A button
          </button>
          <button
            type="button"
            className={`seg__opt${isFolder ? ' is-on' : ''}`}
            onClick={() => setIsFolder(true)}
          >
            A folder
          </button>
        </div>

        {!isFolder ? (
          <>
            <span className="sheet__label">Which folder?</span>
            {(['always', 'moment'] as const).map((group) => {
              const rows = folders.filter((folder) => folder.group === group);
              if (rows.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
                    {group === 'always' ? 'Always on the board' : 'For this moment'}
                  </p>
                  <div className="kinds mt-2">
                    {rows.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        className={`kind${folderId === folder.id ? ' is-on' : ''}`}
                        onClick={() => {
                          setFolderId(folder.id);
                          setRole(folder.role);
                        }}
                      >
                        {folder.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {!isFolder && chosenFolder ? (
          <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
            It goes in <b>{chosenFolder.title}</b>
            {folderTitle && chosenFolder.id === currentFolderId ? ', the open folder' : ''}.
          </p>
        ) : null}

        <label className="sheet__label" htmlFor="add-label">
          {isFolder ? 'Folder name' : 'Word'}
        </label>
        <div className="flex gap-2">
          <input
            id="add-label"
            className="sheet__field flex-1"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={isFolder ? 'Swimming club' : 'trampoline'}
            maxLength={40}
            autoFocus
          />
          {!isFolder ? (
            <button
              type="button"
              className="min-h-[52px] rounded-[10px] px-4 font-bold disabled:opacity-50"
              style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
              disabled={!label.trim() || searching}
              onClick={() => void findPictures(label)}
            >
              {searching ? 'Looking...' : 'Find pictures'}
            </button>
          ) : null}
        </div>

        {!isFolder ? (
          <>
            <span className="sheet__label">What kind of word?</span>
            <div className="kinds">
              {KINDS.map((k) => (
                <button
                  key={k.role}
                  type="button"
                  className={`kind${role === k.role ? ' is-on' : ''}`}
                  style={{ background: k.bg, color: k.fg }}
                  onClick={() => setRole(k.role)}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {searchError ? (
              <p
                className="rounded-[10px] p-3 text-sm font-bold"
                style={{ background: '#fdeae7', color: '#a62f1e' }}
              >
                {searchError}
              </p>
            ) : null}

            {options.length > 0 ? (
              <>
                <span className="sheet__label">Pick the picture</span>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {options.map((candidate) => (
                    <li key={candidate.imageUrl}>
                      <button
                        type="button"
                        onClick={() => setChosen(candidate.imageUrl)}
                        aria-pressed={chosen === candidate.imageUrl}
                        className="flex w-full flex-col items-center gap-1 rounded-[10px] p-1.5"
                        style={{
                          border: `3px solid ${
                            chosen === candidate.imageUrl ? 'var(--teal)' : '#cfcfc4'
                          }`,
                          background: '#fff',
                        }}
                      >
                        <img
                          src={candidate.imageUrl}
                          alt={candidate.name}
                          className="aspect-square w-full object-contain"
                        />
                        <span className="w-full truncate text-[10px] font-semibold">
                          {candidate.name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
                  Nothing right for &ldquo;{searchTerm}&rdquo;? Type a different word above and look
                  again. For a person or a favourite object, a photo of your own is usually better
                  than anything the library has.
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold" style={{ color: '#6c727b' }}>
                Press Find pictures to choose one. Without choosing, the closest match is used, which
                for a name is often wrong.
              </p>
            )}
          </>
        ) : null}

        {error ? (
          <p
            className="rounded-[10px] p-3 text-sm font-bold"
            style={{ background: '#fdeae7', color: '#a62f1e' }}
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="min-h-[52px] rounded-[10px] px-5 font-bold disabled:opacity-50"
            style={{ background: 'var(--teal)', color: 'var(--teal-ink)' }}
            disabled={busy || !label.trim() || (!isFolder && !folderId)}
          >
            {busy ? 'Adding...' : 'Add it'}
          </button>
          <button type="button" className="sheet__cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

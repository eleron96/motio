import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';
import { matchKnownPeople } from '@/features/projects/lib/knownPeople';

interface PersonSuggestFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user selects a previously-entered person. */
  onPick: (person: KnownPerson) => void;
  people: readonly KnownPerson[];
  placeholder: string;
  autoFocus?: boolean;
  /** Applied to the underlying <input> so callers can match their form styling. */
  className?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 6;
// Don't suggest until the user has actually started typing a name — an empty
// focused field must look like a plain input, not dump the whole directory.
const MIN_QUERY_LENGTH = 2;

/**
 * A plain text input that suggests people entered elsewhere in the workspace.
 * With no suggestions to show it behaves byte-for-byte like a bare input, so it
 * is safe to drop in whether or not the people-suggest feature is on.
 *
 * Deliberately self-contained (no Popover/Command): it renders inside a Radix
 * DropdownMenu in TeamBlock, and nesting another floating layer there is
 * fragile. Keyboard events are stopped from bubbling so the host menu/form
 * doesn't also act on Arrow/Enter/Escape while the suggestion list is open.
 */
export const PersonSuggestField: React.FC<PersonSuggestFieldProps> = ({
  value,
  onChange,
  onPick,
  people,
  placeholder,
  autoFocus,
  className,
  limit = DEFAULT_LIMIT,
}) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
  }, []);

  const suggestions = useMemo(() => {
    if (people.length === 0) return [];
    const trimmed = value.trim();
    // Nothing until there's a real query — focusing an empty field shows no list.
    if (trimmed.length < MIN_QUERY_LENGTH) return [];
    const matches = matchKnownPeople(people, trimmed);
    const lower = trimmed.toLowerCase();
    // Hide a lone suggestion that already equals the current input — there's
    // nothing left to autofill from it.
    const filtered = matches.filter(
      (person) => !(matches.length === 1 && person.name.toLowerCase() === lower),
    );
    return filtered.slice(0, limit);
  }, [people, value, limit]);

  const showList = open && suggestions.length > 0;

  const pick = (person: KnownPerson) => {
    onPick(person);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      // Only consume Enter when a suggestion is highlighted; otherwise let the
      // surrounding form submit as usual.
      const person = suggestions[highlight];
      if (person) {
        event.preventDefault();
        event.stopPropagation();
        pick(person);
      }
    } else if (event.key === 'Escape') {
      // Close the list first instead of letting the form's Escape (cancel) fire.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a mousedown on a suggestion still lands before we close.
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        // Always full-width: the input sits inside a `relative` wrapper (not a
        // flex child), so without this it shrinks to its intrinsic size and
        // looks narrower than the sibling fields.
        className={`w-full ${className ?? ''}`}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
      />
      {showList && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
          role="listbox"
        >
          <li className="px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t`Previously entered`}
          </li>
          {suggestions.map((person, index) => {
            // Tag and role ride along so a match found by typing one of them is
            // recognisable in the list, not just a bare name.
            const secondary = [person.company, person.tag, person.role, person.email]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={`${person.name} ${person.email ?? ''} ${person.phone ?? ''}`}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so the pick fires before input blur.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(person);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className={`flex w-full flex-col items-start gap-0 px-2 py-1 text-left ${
                    index === highlight ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  <span className="text-[12px] font-medium leading-tight">{person.name}</span>
                  {secondary && (
                    <span className="max-w-full truncate text-[10px] text-muted-foreground">{secondary}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

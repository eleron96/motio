import React, { useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { ChevronDown, X } from 'lucide-react';
import { Tag } from '@/features/planner/types/planner';
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

interface TagMultiSelectProps {
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  disabled?: boolean;
}

/**
 * Mockup-style tag field: selected tags render as removable chips, the inline
 * input suggests existing workspace tags. New tags are NOT created here — tag
 * management stays in workspace settings.
 */
export const TagMultiSelect: React.FC<TagMultiSelectProps> = ({
  tags,
  selectedTagIds,
  onToggleTag,
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [selectedTagIds, tags],
  );
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tags.filter((tag) => (
      !selectedTagIds.includes(tag.id)
      && (!normalized || tag.name.toLowerCase().includes(normalized))
    ));
  }, [query, selectedTagIds, tags]);

  if (tags.length === 0) {
    return <p className="text-xs text-muted-foreground">{t`No tags available yet.`}</p>;
  }

  const pickTag = (tagId: string) => {
    onToggleTag(tagId);
    setQuery('');
    inputRef.current?.focus();
  };

  if (isMobile) {
    // On a phone the chip box is the wrong shape twice over: the suggestion
    // list floats over the form with a scroller a finger cannot reach, and the
    // typed query fights the keyboard for the little room that is left. Here
    // the field is a summary you tap, and the whole tag list is a screen —
    // every tag shown at once, ticked or not, instead of a filtered typeahead.
    const options: MobilePickerOption[] = tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      searchText: tag.name,
      leading: (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
      ),
    }));

    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className={cn(
            'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-left text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground">{disabled ? t`No tags` : t`Select tags`}</span>
          ) : (
            selectedTags.map((tag) => (
              // Plain spans, not buttons: a chip inside a button cannot be a
              // button too. Removing a tag happens by unticking it on the screen.
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))
          )}
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <MobilePickerScreen
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={t`Tags`}
          options={options}
          values={selectedTagIds}
          onValuesChange={(next) => {
            // The parent owns a single-tag toggle, so hand it the one row that
            // actually changed rather than replacing the whole selection.
            const added = next.filter((id) => !selectedTagIds.includes(id));
            const removed = selectedTagIds.filter((id) => !next.includes(id));
            [...added, ...removed].forEach((tagId) => onToggleTag(tagId));
          }}
          searchable={tags.length > 8}
          searchPlaceholder={t`Search tags`}
          emptyLabel={t`No matching tags.`}
        />
      </>
    );
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestions.length > 0) pickTag(suggestions[0].id);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'Backspace' && query === '' && selectedTags.length > 0) {
      event.preventDefault();
      onToggleTag(selectedTags[selectedTags.length - 1].id);
    }
  };

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={containerRef}
          className={cn(
            'flex min-h-[40px] w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5',
            !disabled && 'focus-within:ring-1 focus-within:ring-ring',
            disabled && 'opacity-70',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
              style={{ borderColor: tag.color, color: tag.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
              {!disabled && (
                <button
                  type="button"
                  className="rounded-sm opacity-60 hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleTag(tag.id);
                  }}
                  aria-label={t`Remove tag`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={selectedTags.length === 0 ? t`Type a tag name...` : ''}
              className="min-w-[96px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
          )}
          {disabled && selectedTags.length === 0 && (
            <span className="text-sm text-muted-foreground">{t`No tags`}</span>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[220px] p-1"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Focus lives in the anchor's input (outside the content), so Radix
        // would otherwise dismiss on the first focusout and swallow option
        // clicks. Keep the popover open unless the interaction is truly
        // outside both the content and the anchor.
        onFocusOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (containerRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        {suggestions.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t`No matching tags.`}</div>
        ) : (
          <div
            className="max-h-48 overflow-y-auto overscroll-contain"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/60"
                onClick={() => pickTag(tag.id)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command';
import { cn } from '@/shared/lib/classNames';

export interface PickableUser {
  id: string;
  email: string | null;
  displayName?: string | null;
}

interface AdminUserPickerProps {
  users: PickableUser[];
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
}

const label = (user: PickableUser) => user.email ?? user.displayName ?? user.id;

/**
 * Pick a person by typing. A plain select is fine for a handful of options and
 * useless at seventy: the name you want is somewhere in the scroll, and on an
 * unfamiliar roster you do not know what to scroll towards.
 *
 * Matching runs over both the email and the display name, so "Наиля" and
 * "n.tokocheva" both find the same person.
 */
export const AdminUserPicker: React.FC<AdminUserPickerProps> = ({
  users,
  value,
  onChange,
  placeholder,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return users;
    return users.filter((user) => (
      (user.email ?? '').toLowerCase().includes(needle)
      || (user.displayName ?? '').toLowerCase().includes(needle)
    ));
  }, [users, needle]);

  const selected = users.find((user) => user.id === value);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? label(selected) : placeholder ?? t`Select user`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* cmdk does its own fuzzy filtering; ours matches emails and names the
            way an admin expects, so its filter stays out of the way. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t`Search by name or email`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{t`Nobody found`}</CommandEmpty>
            <CommandGroup>
              {filtered.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  onSelect={() => {
                    onChange(user.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate">{label(user)}</div>
                    {user.displayName && user.email && (
                      <div className="truncate text-xs text-muted-foreground">{user.displayName}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { ChevronDown } from 'lucide-react';
import { Customer } from '@/features/planner/types/planner';
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

type CustomerComboboxProps = {
  value: string | null;
  customers: Customer[];
  onChange: (value: string | null) => void;
  onCreateCustomer: (name: string) => Promise<Customer | null>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export const CustomerCombobox: React.FC<CustomerComboboxProps> = ({
  value,
  customers,
  onChange,
  onCreateCustomer,
  disabled,
  placeholder = t`No customer`,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim();
  const normalizedLower = normalizedQuery.toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedLower) return customers;
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalizedLower));
  }, [customers, normalizedLower]);
  const exactMatch = useMemo(() => (
    normalizedLower
      ? customers.find((customer) => customer.name.trim().toLowerCase() === normalizedLower)
      : null
  ), [customers, normalizedLower]);
  const selectedLabel = value
    ? customers.find((customer) => customer.id === value)?.name ?? placeholder
    : placeholder;

  const handleSelect = (nextValue: string | null) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  const handleCreate = async () => {
    if (!normalizedQuery) return;
    if (exactMatch) {
      handleSelect(exactMatch.id);
      return;
    }
    const created = await onCreateCustomer(normalizedQuery);
    if (created) {
      handleSelect(created.id);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between ${className ?? ''}`}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start" portalled={false}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t`Find or add customer...`}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (normalizedQuery) {
                  void handleCreate();
                }
              }
            }}
          />
          <CommandList
            className="max-h-60 overscroll-contain"
            onWheel={(event) => {
              event.stopPropagation();
            }}
          >
            <CommandEmpty>{t`No customers found.`}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => handleSelect(null)}>
                {t`No customer`}
              </CommandItem>
              {normalizedQuery && !exactMatch && (
                <CommandItem onSelect={() => void handleCreate()}>
                  {t`Create "${normalizedQuery}"`}
                </CommandItem>
              )}
              {filteredCustomers.map((customer) => (
                <CommandItem key={customer.id} onSelect={() => handleSelect(customer.id)}>
                  {customer.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import type { Customer, Project } from '@/features/planner/types/planner';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';

interface CustomersMobileListProps {
  customers: Customer[];
  search: string;
  onSearchChange: (value: string) => void;
  /** All projects, to say how many belong to each customer. */
  projects: Project[];
  onOpenCustomer: (customer: Customer) => void;
}

/** Customers as a list you tap into, instead of a sidebar squeezed into a drawer. */
export const CustomersMobileList: React.FC<CustomersMobileListProps> = ({
  customers,
  search,
  onSearchChange,
  projects,
  onOpenCustomer,
}) => {
  const projectCountByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => {
      if (!project.customerId) return;
      counts.set(project.customerId, (counts.get(project.customerId) ?? 0) + 1);
    });
    return counts;
  }, [projects]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">
        <SearchInput
          value={search}
          onValueChange={onSearchChange}
          placeholder={t`Search customers...`}
          className="w-full"
          inputClassName="h-11 rounded-xl text-sm"
          clearLabel={t`Clear search`}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 py-3">
        {customers.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">{t`No customers yet.`}</p>
        ) : (
          <MobileListGroup>
            {customers.map((customer) => {
              const count = projectCountByCustomer.get(customer.id) ?? 0;
              return (
                <MobileListRow
                  key={customer.id}
                  title={customer.name}
                  subtitle={customer.industry || undefined}
                  value={count > 0 ? count : undefined}
                  chevron
                  onClick={() => onOpenCustomer(customer)}
                />
              );
            })}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { t } from '@lingui/macro';
import { Check } from 'lucide-react';
import type { Customer, MemberGroup } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { cn } from '@/shared/lib/classNames';

interface ProjectsMobileFiltersScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  customerFilterIds: string[];
  onToggleCustomer: (customerId: string) => void;
  memberGroups: MemberGroup[];
  ownerGroupFilterIds: string[];
  onToggleOwnerGroup: (groupId: string) => void;
  groupByCustomer: boolean;
  onToggleGroupByCustomer: () => void;
  showArchived: boolean;
  onToggleShowArchived: () => void;
  nameSort: 'asc' | 'desc';
  onToggleNameSort: () => void;
  onClearAll: () => void;
}

/**
 * The project list's filters, phone-style.
 *
 * On the desktop these are four popovers in a narrow sidebar; each puts a
 * scrollable list inside a floating layer, which a finger cannot reach. Here
 * every option is a row on a screen that scrolls normally.
 */
export const ProjectsMobileFiltersScreen: React.FC<ProjectsMobileFiltersScreenProps> = ({
  open,
  onOpenChange,
  customers,
  customerFilterIds,
  onToggleCustomer,
  memberGroups,
  ownerGroupFilterIds,
  onToggleOwnerGroup,
  groupByCustomer,
  onToggleGroupByCustomer,
  showArchived,
  onToggleShowArchived,
  nameSort,
  onToggleNameSort,
  onClearAll,
}) => {
  // A drawn box rather than a checkbox: the row is the button, and a control
  // nested in a button is invalid markup whose taps land twice.
  const tick = (checked: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px]',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
      )}
    >
      {checked && <Check className="h-4 w-4" />}
    </span>
  );

  return (
    <MobileScreenShell open={open} onOpenChange={onOpenChange} title={t`Filters`}>
      <div className="space-y-5">
        <MobileListGroup title={t`Sorting`}>
          <MobileListRow
            title={t`Name`}
            value={nameSort === 'asc' ? t`A-Z` : t`Z-A`}
            onClick={onToggleNameSort}
          />
          <MobileListRow
            title={t`Group by customer`}
            right={(
              <Switch
                size="touch"
                checked={groupByCustomer}
                onCheckedChange={onToggleGroupByCustomer}
                aria-label={t`Group by customer`}
              />
            )}
          />
          <MobileListRow
            title={t`Show archived`}
            right={(
              <Switch
                size="touch"
                checked={showArchived}
                onCheckedChange={onToggleShowArchived}
                aria-label={t`Show archived`}
              />
            )}
          />
        </MobileListGroup>

        <MobileListGroup
          title={t`Customers`}
          note={customers.length === 0 ? t`No customers yet.` : undefined}
        >
          {customers.map((customer) => {
            const checked = customerFilterIds.includes(customer.id);
            return (
              <MobileListRow
                key={customer.id}
                title={customer.name}
                right={tick(checked)}
                selected={checked}
                onClick={() => onToggleCustomer(customer.id)}
              />
            );
          })}
        </MobileListGroup>

        <MobileListGroup
          title={t`Owner team`}
          note={memberGroups.length === 0 ? t`No groups yet.` : undefined}
        >
          {memberGroups.map((group) => {
            const checked = ownerGroupFilterIds.includes(group.id);
            return (
              <MobileListRow
                key={group.id}
                title={group.name}
                right={tick(checked)}
                selected={checked}
                onClick={() => onToggleOwnerGroup(group.id)}
              />
            );
          })}
        </MobileListGroup>

        <Button type="button" variant="outline" className="h-12 w-full" onClick={onClearAll}>
          {t`Clear filters`}
        </Button>
      </div>
    </MobileScreenShell>
  );
};

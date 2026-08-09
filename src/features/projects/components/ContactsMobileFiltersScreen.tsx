import React, { useState } from 'react';
import { t } from '@lingui/macro';
import type { ContactFilterOption } from '@/features/projects/lib/contactList';
import { Button } from '@/shared/ui/button';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

type FilterCategory = 'company' | 'tag' | 'role' | null;

interface ContactsMobileFiltersScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: ContactFilterOption[];
  companyKeys: string[];
  onCompanyKeysChange: (keys: string[]) => void;
  tags: ContactFilterOption[];
  tagKeys: string[];
  onTagKeysChange: (keys: string[]) => void;
  roles: ContactFilterOption[];
  roleKeys: string[];
  onRoleKeysChange: (keys: string[]) => void;
  onClearAll: () => void;
}

/**
 * Company / tag / role filters for the contacts directory, phone-style.
 *
 * Each category gets a screen of its own with a search box: a directory of any
 * size ends up with more companies and roles than fit on one screen, and
 * scrolling three stacked lists to find one of them is the thing this replaces.
 * The desktop keeps its three popovers.
 */
export const ContactsMobileFiltersScreen: React.FC<ContactsMobileFiltersScreenProps> = ({
  open,
  onOpenChange,
  companies,
  companyKeys,
  onCompanyKeysChange,
  tags,
  tagKeys,
  onTagKeysChange,
  roles,
  roleKeys,
  onRoleKeysChange,
  onClearAll,
}) => {
  const [category, setCategory] = useState<FilterCategory>(null);

  const toOptions = (
    options: ContactFilterOption[],
    noneLabel: string,
  ): MobilePickerOption[] => options.map((option) => ({
    value: option.key,
    label: option.label ?? noneLabel,
    note: String(option.count),
    searchText: option.label ?? noneLabel,
  }));

  // "3 selected" beats listing them: a category can hold dozens of values.
  const summary = (selected: string[], options: ContactFilterOption[], noneLabel: string) => {
    if (selected.length === 0) return t`All`;
    if (selected.length === 1) {
      const found = options.find((option) => option.key === selected[0]);
      return found ? (found.label ?? noneLabel) : t`1 selected`;
    }
    return t`${selected.length} selected`;
  };

  const totalSelected = companyKeys.length + tagKeys.length + roleKeys.length;

  return (
    <>
      <MobileScreenShell open={open} onOpenChange={onOpenChange} title={t`Filters`}>
        <div className="space-y-4">
          <MobileListGroup>
            <MobileListRow
              title={t`Company`}
              value={summary(companyKeys, companies, t`No company`)}
              chevron
              onClick={() => setCategory('company')}
            />
            <MobileListRow
              title={t`Tag`}
              value={summary(tagKeys, tags, t`No tag`)}
              chevron
              onClick={() => setCategory('tag')}
            />
            <MobileListRow
              title={t`Role`}
              value={summary(roleKeys, roles, t`No role`)}
              chevron
              onClick={() => setCategory('role')}
            />
          </MobileListGroup>

          {totalSelected > 0 && (
            <Button type="button" variant="outline" className="h-12 w-full" onClick={onClearAll}>
              {t`Clear filters`}
            </Button>
          )}
        </div>
      </MobileScreenShell>

      <MobilePickerScreen
        open={category === 'company'}
        onOpenChange={(next) => { if (!next) setCategory(null); }}
        title={t`Company`}
        options={toOptions(companies, t`No company`)}
        values={companyKeys}
        onValuesChange={onCompanyKeysChange}
        searchable
        searchPlaceholder={t`Search companies...`}
        emptyLabel={t`Nothing to filter by yet.`}
      />

      <MobilePickerScreen
        open={category === 'tag'}
        onOpenChange={(next) => { if (!next) setCategory(null); }}
        title={t`Tag`}
        options={toOptions(tags, t`No tag`)}
        values={tagKeys}
        onValuesChange={onTagKeysChange}
        searchable
        searchPlaceholder={t`Search tags...`}
        emptyLabel={t`Nothing to filter by yet.`}
      />

      <MobilePickerScreen
        open={category === 'role'}
        onOpenChange={(next) => { if (!next) setCategory(null); }}
        title={t`Role`}
        options={toOptions(roles, t`No role`)}
        values={roleKeys}
        onValuesChange={onRoleKeysChange}
        searchable
        searchPlaceholder={t`Search roles...`}
        emptyLabel={t`Nothing to filter by yet.`}
      />
    </>
  );
};

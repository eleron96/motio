import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  DashboardAssigneeOption,
  DashboardFilterField,
  DashboardFilterGroup,
  DashboardFilterOperator,
  DashboardFilterRule,
  DashboardOption,
  DashboardStatus,
} from '@/features/dashboard/types/dashboard';
import { filterDashboardAssigneeOptions } from '@/features/dashboard/lib/dashboardAssigneeOptions';
import { createWidgetId } from '@/features/dashboard/lib/dashboardUtils';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { t } from '@lingui/macro';

const UNASSIGNED_FILTER_VALUE = '__unassigned__';

interface WidgetFilterGroupsEditorProps {
  filterGroups: DashboardFilterGroup[];
  setFilterGroups: React.Dispatch<React.SetStateAction<DashboardFilterGroup[]>>;
  statuses: DashboardStatus[];
  projects: DashboardOption[];
  assignees: DashboardAssigneeOption[];
  groups: DashboardOption[];
  /** Offer disabled people as rule values too (a rule may still point at one). */
  includeDisabledAssignees: boolean;
}

/**
 * "Advanced filters" of a task widget: groups of rules (user, group, status,
 * project equals / not equals), matched with AND or OR inside a group.
 */
export const WidgetFilterGroupsEditor: React.FC<WidgetFilterGroupsEditorProps> = ({
  filterGroups,
  setFilterGroups,
  statuses,
  projects,
  assignees,
  groups,
  includeDisabledAssignees,
}) => {
  const filterFieldOptions: Array<{ value: DashboardFilterField; label: string }> = [
    { value: 'assignee', label: t`User` },
    { value: 'group', label: t`Group` },
    { value: 'status', label: t`Status` },
    { value: 'project', label: t`Project` },
  ];

  const filterOperatorOptions: Array<{ value: DashboardFilterOperator; label: string }> = [
    { value: 'eq', label: t`Equals` },
    { value: 'neq', label: t`Not equals` },
  ];

  const groupMatchOptions: Array<{ value: DashboardFilterGroup['match']; label: string }> = [
    { value: 'and', label: t`Match all rules (AND)` },
    { value: 'or', label: t`Match any rule (OR)` },
  ];

  const createRule = (field: DashboardFilterField = 'assignee'): DashboardFilterRule => ({
    id: createWidgetId(),
    field,
    operator: 'eq',
    value: '',
  });

  const createGroup = (): DashboardFilterGroup => ({
    id: createWidgetId(),
    match: 'and',
    rules: [createRule()],
  });

  const orderedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.name.localeCompare(b.name)),
    [statuses],
  );

  const orderedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const orderedAssignees = useMemo(
    () => [...assignees].sort((a, b) => a.name.localeCompare(b.name)),
    [assignees],
  );

  const orderedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  );

  const addFilterGroup = () => {
    setFilterGroups((current) => [...current, createGroup()]);
  };

  const removeFilterGroup = (groupId: string) => {
    setFilterGroups((current) => current.filter((group) => group.id !== groupId));
  };

  const updateFilterGroup = (groupId: string, updates: Partial<DashboardFilterGroup>) => {
    setFilterGroups((current) => current.map((group) => (
      group.id === groupId ? { ...group, ...updates } : group
    )));
  };

  const addRuleToGroup = (groupId: string) => {
    setFilterGroups((current) => current.map((group) => (
      group.id === groupId ? { ...group, rules: [...group.rules, createRule()] } : group
    )));
  };

  const removeRuleFromGroup = (groupId: string, ruleId: string) => {
    setFilterGroups((current) => current.map((group) => (
      group.id === groupId
        ? { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }
        : group
    )));
  };

  const updateRule = (groupId: string, ruleId: string, updates: Partial<DashboardFilterRule>) => {
    setFilterGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        rules: group.rules.map((rule) => (
          rule.id === ruleId ? { ...rule, ...updates } : rule
        )),
      };
    }));
  };

  const getRuleOptions = (field: DashboardFilterField, selectedValue?: string) => {
    if (field === 'project') {
      return orderedProjects.map((project) => ({
        ...project,
        name: formatProjectLabel(project.name, project.code),
      }));
    }
    if (field === 'group') {
      return orderedGroups;
    }
    if (field === 'status') {
      return orderedStatuses.map((status) => ({
        id: status.id,
        name: formatStatusLabel(status.name, status.emoji),
      }));
    }
    const assigneeOptions = filterDashboardAssigneeOptions({
      assignees: orderedAssignees,
      includeDisabledAssignees: includeDisabledAssignees,
      selectedAssigneeId: selectedValue,
    });
    return [
      { id: UNASSIGNED_FILTER_VALUE, name: t`Unassigned` },
      ...assigneeOptions,
    ];
  };

  return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>{t`Advanced filters`}</Label>
          <Button variant="outline" size="sm" onClick={addFilterGroup}>
            <Plus className="h-4 w-4" />
            {t`Add group`}
          </Button>
        </div>
        {filterGroups.length === 0 && (
          <div className="text-xs text-muted-foreground">
            {t`No advanced filters. Add a group to build custom rules.`}
          </div>
        )}
        {filterGroups.map((group, index) => (
          <div key={group.id} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{t`Group ${index + 1}`}</div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Select
                  value={group.match}
                  onValueChange={(value) => updateFilterGroup(group.id, { match: value as DashboardFilterGroup['match'] })}
                >
                  <SelectTrigger className="w-full max-w-full sm:w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groupMatchOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFilterGroup(group.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {group.rules.length === 0 && (
              <div className="text-xs text-muted-foreground">{t`No rules yet.`}</div>
            )}
            {group.rules.map((rule) => {
              const options = getRuleOptions(rule.field, rule.value);
              return (
                <div
                  key={rule.id}
                  className="grid min-w-0 items-center gap-2 md:grid-cols-[1.1fr_0.9fr_1.3fr_auto] [&>*]:min-w-0"
                >
                  <Select
                    value={rule.field}
                    onValueChange={(value) => updateRule(group.id, rule.id, {
                      field: value as DashboardFilterField,
                      value: '',
                    })}
                  >
                    <SelectTrigger className="min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filterFieldOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={rule.operator}
                    onValueChange={(value) => updateRule(group.id, rule.id, { operator: value as DashboardFilterOperator })}
                  >
                    <SelectTrigger className="min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filterOperatorOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={rule.value}
                    onValueChange={(value) => updateRule(group.id, rule.id, { value })}
                    disabled={options.length === 0}
                  >
                    <SelectTrigger className="min-w-0">
                      <SelectValue placeholder={options.length ? t`Select value` : t`No options`} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-end"
                    onClick={() => removeRuleFromGroup(group.id, rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            <Button variant="outline" size="sm" onClick={() => addRuleToGroup(group.id)}>
              <Plus className="h-4 w-4" />
              {t`Add rule`}
            </Button>
          </div>
        ))}
      </div>
  );
};

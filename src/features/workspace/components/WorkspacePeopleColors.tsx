import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Button } from '@/shared/ui/button';
import { ColorPicker } from '@/shared/ui/color-picker';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import { buildTimeOffColorMap } from '@/features/planner/lib/timeOffPalette';
import { canEditPersonColor, isPersonColor } from '@/shared/lib/personColor';
import { Block } from '@/features/workspace/components/settingsBlocks';

/**
 * The palette side of workspace people: who is drawn in which colour on the
 * dashboard, the calendar and behind their initials. Kept apart from the access
 * tabs because the rights differ — anyone may recolour themselves, only an
 * admin may recolour the rest.
 */
export const WorkspacePeopleColors: React.FC = () => {
  const { assignees, setAssigneeColor } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    setAssigneeColor: state.setAssigneeColor,
  })));

  const { user, currentWorkspaceRole } = useAuthStore(useShallow((state) => ({
    user: state.user,
    currentWorkspaceRole: state.currentWorkspaceRole,
  })));

  const isAdmin = currentWorkspaceRole === 'admin';

  const [savingColorId, setSavingColorId] = useState<string | null>(null);
  const [peopleColorError, setPeopleColorError] = useState('');

  const colorPeople = useMemo(() => (
    (assignees ?? [])
      .filter((assignee) => assignee.isActive)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
  ), [assignees]);
  // What each person is drawn in right now: their own colour, or the automatic
  // one the calendar would pick. The swatch must show the colour in effect, not
  // an empty state, or "no colour chosen" would read as "no colour at all".
  const effectiveColorById = useMemo(() => buildTimeOffColorMap(assignees ?? []), [assignees]);

  const handlePersonColorChange = async (assigneeId: string, color: string | null) => {
    setSavingColorId(assigneeId);
    setPeopleColorError('');
    const result = await setAssigneeColor(assigneeId, color);
    if (result.error) {
      setPeopleColorError(result.error);
    }
    setSavingColorId(null);
  };

  return (
    <div className="space-y-5">
      <Block
        title={t`Colours`}
        description={t`A person's colour is used on dashboard charts, on their day-off circles in the calendar and behind their initials.`}
      >
        {peopleColorError && (
          <p className="text-sm text-destructive">{peopleColorError}</p>
        )}
        {colorPeople.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`No people in this workspace yet.`}</p>
        ) : (
          <div className="space-y-1">
            {colorPeople.map((person) => {
              const canEditPerson = canEditPersonColor({
                isAdmin,
                assigneeUserId: person.userId,
                currentUserId: user?.id,
              });
              const hasOwnColor = isPersonColor(person.color);
              return (
                <div
                  key={person.id}
                  className="flex items-center gap-3 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
                >
                  <UserAvatar
                    size="sm"
                    name={person.name}
                    colorSeed={person.userId ?? person.id}
                    color={effectiveColorById.get(person.id)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {person.name}
                  </span>
                  {hasOwnColor && canEditPerson && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                      disabled={savingColorId === person.id}
                      onClick={() => void handlePersonColorChange(person.id, null)}
                    >
                      {t`Auto`}
                    </Button>
                  )}
                  <ColorPicker
                    value={effectiveColorById.get(person.id) ?? PERSON_PRESET_COLORS[0]}
                    presets={PERSON_PRESET_COLORS}
                    allowCustom={false}
                    disabled={!canEditPerson || savingColorId === person.id}
                    aria-label={t`Colour of ${person.name}`}
                    onChange={(color) => void handlePersonColorChange(person.id, color)}
                  />
                </div>
              );
            })}
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            {t`You can change your own colour. Only an admin can recolour the rest of the team.`}
          </p>
        )}
      </Block>
    </div>
  );
};

import React from 'react';
import { t } from '@lingui/macro';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import type { AccountlessPeopleFlow } from '@/features/members/hooks/useAccountlessPeople';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';

type AccountlessPersonDialogsProps = {
  flow: AccountlessPeopleFlow;
  roleLabels: Record<WorkspaceRole, string>;
  isMobile: boolean;
  /** The person just added or edited, to select in the list. */
  onSaved: (assigneeId: string) => void;
};

const INVITE_ROLES: WorkspaceRole[] = ['viewer', 'editor', 'admin'];

/**
 * Team page: add or edit a person without an account, and invite one from
 * their row. Rendered only while the server setting is on.
 */
export const AccountlessPersonDialogs = ({
  flow,
  roleLabels,
  isMobile,
  onSaved,
}: AccountlessPersonDialogsProps) => {
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const { personForm, inviteForm, saving, error } = flow;
  const isEditing = Boolean(personForm?.assigneeId);

  return (
    <>
      <Dialog open={Boolean(personForm)} onOpenChange={(open) => { if (!open) flow.closeForms(); }}>
        <DialogContent
          className="w-[95vw] max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? t`Edit person` : t`Add a person without an account`}</DialogTitle>
            <DialogDescription>
              {t`They get a row on the timeline and can be given tasks and time off, but cannot sign in and get no notifications. You can invite them later, and they keep the row.`}
            </DialogDescription>
          </DialogHeader>
          {personForm && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void flow.savePerson().then((assigneeId) => {
                  if (assigneeId) onSaved(assigneeId);
                });
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="accountless-name">{t`Name on the timeline`}</Label>
                <Input
                  id="accountless-name"
                  ref={nameInputRef}
                  value={personForm.name}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(event) => flow.setPersonForm({ ...personForm, name: event.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="accountless-email">{t`Email (optional)`}</Label>
                <Input
                  id="accountless-email"
                  type="email"
                  value={personForm.email}
                  maxLength={254}
                  autoComplete="off"
                  onChange={(event) => flow.setPersonForm({ ...personForm, email: event.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="accountless-phone">{t`Phone (optional)`}</Label>
                <Input
                  id="accountless-phone"
                  type="tel"
                  value={personForm.phone}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(event) => flow.setPersonForm({ ...personForm, phone: event.target.value })}
                  disabled={saving}
                />
              </div>
              {error && <div className="text-sm text-destructive" role="alert">{error}</div>}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={flow.closeForms} disabled={saving}>
                  {t`Cancel`}
                </Button>
                <Button type="submit" disabled={saving || !personForm.name.trim()}>
                  {isEditing ? t`Save` : t`Add`}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(inviteForm)} onOpenChange={(open) => { if (!open) flow.closeForms(); }}>
        <DialogContent
          className="w-[95vw] max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            emailInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{inviteForm ? t`Invite ${inviteForm.name}` : t`Invite`}</DialogTitle>
            <DialogDescription>
              {t`When they accept, this row with its tasks and time off becomes theirs: they see the timeline and get notifications.`}
            </DialogDescription>
          </DialogHeader>
          {inviteForm && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void flow.sendInvite();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="accountless-invite-email">{t`Email`}</Label>
                <Input
                  id="accountless-invite-email"
                  ref={emailInputRef}
                  type="email"
                  value={inviteForm.email}
                  maxLength={254}
                  autoComplete="off"
                  onChange={(event) => flow.setInviteForm({ ...inviteForm, email: event.target.value })}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label>{t`Role`}</Label>
                <SegmentedControl surface="filled" className="w-full">
                  {INVITE_ROLES.map((role) => (
                    <SegmentedControlItem
                      key={role}
                      size={isMobile ? 'touch' : undefined}
                      fullWidth
                      active={inviteForm.role === role}
                      onClick={() => flow.setInviteForm({ ...inviteForm, role })}
                    >
                      {roleLabels[role]}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>
              {error && <div className="text-sm text-destructive" role="alert">{error}</div>}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={flow.closeForms} disabled={saving}>
                  {t`Cancel`}
                </Button>
                <Button type="submit" disabled={saving || !inviteForm.email.trim()}>
                  {t`Send invitation`}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

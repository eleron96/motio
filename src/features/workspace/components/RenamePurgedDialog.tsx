import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import {
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
  type DisplayNameValidationErrorCode,
} from '@/shared/lib/displayNameValidation';

interface RenamePurgedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  currentDisplayName: string | null;
  /**
   * Should call the store action (or a thin wrapper) and return `{ error?: string }`.
   * We don't call the store directly here so the dialog is easy to unit-test.
   */
  onSubmit: (userId: string, newName: string) => Promise<{ error?: string }>;
}

const describeError = (code: DisplayNameValidationErrorCode): string => {
  switch (code) {
    case 'empty':
      return t`Name cannot be empty.`;
    case 'too_short':
      return t`Name must be at least 2 characters.`;
    case 'too_long':
      return t`Name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
    case 'contains_mention':
      return t`Name cannot contain @.`;
    case 'contains_url':
      return t`Name cannot contain a URL.`;
    case 'reserved_word':
      return t`This name is reserved.`;
    default:
      return t`Invalid name.`;
  }
};

export const RenamePurgedDialog: React.FC<RenamePurgedDialogProps> = ({
  open,
  onOpenChange,
  userId,
  currentDisplayName,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentDisplayName ?? '');
      setTouched(false);
      setSubmitting(false);
      setServerError(null);
    }
  }, [open, currentDisplayName]);

  const validation = useMemo(() => validateDisplayName(name), [name]);
  const showValidationError = touched && !validation.ok && validation.error;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!validation.ok || !userId) return;

    setSubmitting(true);
    const { error } = await onSubmit(userId, validation.trimmed);
    setSubmitting(false);
    if (error) {
      setServerError(error);
      return;
    }
    onOpenChange(false);
  };

  const disabled = submitting || !userId || !validation.ok;

  return (
    <Dialog open={open} onOpenChange={(next) => (submitting ? null : onOpenChange(next))}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t`Rename deleted member`}</DialogTitle>
          <DialogDescription>
            {t`Replace the display name of a deleted (purged) account. The change applies everywhere this user is referenced.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rename-purged-input">{t`New display name`}</Label>
            <Input
              id="rename-purged-input"
              value={name}
              maxLength={DISPLAY_NAME_MAX_LENGTH + 20}
              onChange={(event) => {
                setName(event.target.value);
                setTouched(true);
              }}
              disabled={submitting}
              aria-invalid={Boolean(showValidationError)}
              data-testid="rename-purged-input"
            />
            <div className="text-[11px] text-muted-foreground">
              {t`2–${DISPLAY_NAME_MAX_LENGTH} characters. No URLs, @, or reserved words.`}
            </div>
            {showValidationError && validation.error && (
              <div className="text-xs text-destructive" role="alert">
                {describeError(validation.error)}
              </div>
            )}
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertTitle>{t`Rename failed`}</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={disabled}>
              {submitting ? t`Saving...` : t`Save`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

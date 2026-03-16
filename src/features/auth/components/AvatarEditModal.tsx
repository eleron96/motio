import React, { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { uploadAvatar, deleteAvatar } from '@/shared/lib/avatarStorage';
import { t } from '@lingui/macro';
import { Upload, X } from 'lucide-react';

interface AvatarEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentAvatarUrl: string | null;
  /** Called after a successful upload or delete with the new URL (null = deleted) */
  onAvatarChange: (url: string | null) => void;
}

export const AvatarEditModal: React.FC<AvatarEditModalProps> = ({
  open,
  onOpenChange,
  userId,
  currentAvatarUrl,
  onAvatarChange,
}) => {
  const [draggingOver, setDraggingOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError(t`Please select an image file.`);
        return;
      }
      setError('');
      setLoading(true);
      let url: string | undefined;
      let uploadError: string | undefined;
      try {
        ({ url, error: uploadError } = await uploadAvatar(userId, file));
      } catch (e) {
        setLoading(false);
        setError((e as Error).message ?? 'Upload failed');
        return;
      }
      setLoading(false);
      if (uploadError) {
        setError(uploadError);
        return;
      }
      onAvatarChange(url ?? null);
      onOpenChange(false);
    },
    [userId, onAvatarChange, onOpenChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDraggingOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingOver(true);
  };

  const handleDragLeave = () => setDraggingOver(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleClear = async () => {
    if (!currentAvatarUrl) return;
    setError('');
    setLoading(true);
    let deleteError: string | undefined;
    try {
      ({ error: deleteError } = await deleteAvatar(userId));
    } catch (e) {
      setLoading(false);
      setError((e as Error).message ?? 'Delete failed');
      return;
    }
    setLoading(false);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    onAvatarChange(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Edit photo`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Upload or remove your profile photo.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            className={[
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
              draggingOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/30 hover:border-primary hover:bg-muted/40',
              loading ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t`Drag & drop or click to select a photo`}
            </p>
            <p className="text-xs text-muted-foreground/70">JPG, PNG, WEBP — max 10 MB</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Clear button — only when photo exists */}
          {currentAvatarUrl && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 text-destructive hover:text-destructive"
              onClick={handleClear}
              disabled={loading}
            >
              <X className="h-4 w-4" />
              {t`Clear photo`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

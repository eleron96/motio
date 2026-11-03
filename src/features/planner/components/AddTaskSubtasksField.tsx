import React from 'react';
import { ImagePlus, Plus, X } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { AutoGrowTextarea } from '@/shared/ui/auto-grow-textarea';
import { ImageLightbox } from '@/shared/ui/image-lightbox';
import { SubtaskImageStrip } from '@/features/planner/components/SubtaskImages';
import type { DraftSubtasks } from '@/features/planner/hooks/useDraftSubtasks';

interface AddTaskSubtasksFieldProps {
  draftSubtasks: DraftSubtasks;
  markChanged: () => void;
}

/**
 * Subtasks of the task being created, each with its pictures. Enter breaks
 * the line; a new subtask comes from the button below the list.
 */
export const AddTaskSubtasksField: React.FC<AddTaskSubtasksFieldProps> = ({ draftSubtasks, markChanged }) => {
  const {
    subtasks,
    focusSubtaskIdRef,
    draftSubtaskImages,
    subtaskImagesError,
    subtaskImageInputRef,
    subtaskImageTargetRef,
    subtaskLightboxImage,
    setSubtaskLightboxImage,
    handleAddDraftSubtask,
    handleDraftSubtaskTitleChange,
    handleRemoveSubtask,
    handlePickSubtaskImages,
    handleSubtaskImagePaste,
  } = draftSubtasks;

  return (
    <div className="space-y-1.5">
      <Label className="block">{t`Subtasks`}</Label>
      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="group flex items-start gap-2.5"
            >
              <span
                className="mt-2.5 h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-input"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <AutoGrowTextarea
                  ref={(element) => {
                    if (element && focusSubtaskIdRef.current === subtask.id) {
                      element.focus();
                      focusSubtaskIdRef.current = null;
                    }
                  }}
                  onPaste={handleSubtaskImagePaste(subtask.id)}
                  value={subtask.title}
                  onChange={(event) => handleDraftSubtaskTitleChange(subtask.id, event.target.value)}
                  onKeyDown={(event) => {
                    // Enter breaks the line; a new subtask comes from the button below.
                    // A draft holding pictures is not removed by a stray Backspace.
                    if (
                      event.key === 'Backspace'
                      && subtask.title === ''
                      && draftSubtaskImages.imagesFor(subtask.id).length === 0
                    ) {
                      event.preventDefault();
                      handleRemoveSubtask(subtask.id);
                    }
                  }}
                  onBlur={() => {
                    // Trailing blank lines are dropped on save anyway; shed
                    // them here so the field stops showing phantom height.
                    const trimmed = subtask.title.trim();
                    if (trimmed !== subtask.title) {
                      handleDraftSubtaskTitleChange(subtask.id, trimmed);
                    }
                  }}
                  rows={1}
                  placeholder={t`Subtask title`}
                  className="min-h-[36px] min-w-0 w-full text-sm"
                />
                <SubtaskImageStrip
                  images={draftSubtaskImages.imagesFor(subtask.id)}
                  uploadingCount={draftSubtaskImages.uploadingFor(subtask.id)}
                  resolveSrc={draftSubtaskImages.resolveSrc}
                  canRemove
                  onOpen={setSubtaskLightboxImage}
                  onRemove={(mediaId) => draftSubtaskImages.remove(subtask.id, mediaId)}
                />
              </div>
              {draftSubtaskImages.canAttachTo(subtask.id) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1.5 h-6 w-6 shrink-0 opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                  onClick={() => handlePickSubtaskImages(subtask.id)}
                  aria-label={t`Add image`}
                  title={t`Add image`}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1.5 h-6 w-6 shrink-0 opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                onClick={() => handleRemoveSubtask(subtask.id)}
                aria-label={t`Remove subtask`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {subtaskImagesError && (
        <p className="text-xs text-destructive" role="alert">{subtaskImagesError}</p>
      )}
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-fit gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={handleAddDraftSubtask}
      >
        <Plus className="h-3.5 w-3.5" />
        {t`Add subtask`}
      </Button>
      <input
        ref={subtaskImageInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="draft-subtask-image-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          const target = subtaskImageTargetRef.current;
          if (files.length > 0 && target) {
            markChanged();
            draftSubtaskImages.attach(target, files);
          }
        }}
      />
      <ImageLightbox image={subtaskLightboxImage} onClose={() => setSubtaskLightboxImage(null)} />
    </div>
  );
};

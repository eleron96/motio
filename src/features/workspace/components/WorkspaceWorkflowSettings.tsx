import React, { useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Checkbox } from '@/shared/ui/checkbox';
import { Plus, Trash2, CheckCircle2, Ban } from 'lucide-react';
import { ColorPicker } from '@/shared/ui/color-picker';
import { EmojiPicker } from '@/shared/ui/emoji-picker';
import { Textarea } from '@/shared/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { t } from '@lingui/macro';
import { DEFAULT_COLOR_PICKER_VALUE, DEFAULT_STATUS_COLOR } from '@/shared/lib/colors';
import { Block } from '@/features/workspace/components/settingsBlocks';
import { useShallow } from 'zustand/react/shallow';

const autoResize = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

const StatusNameInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    autoResize(ref.current);
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onInput={(e) => autoResize(e.currentTarget)}
      className="flex-1 min-w-0 min-h-8 h-8 resize-none leading-tight py-1 overflow-hidden"
    />
  );
};

interface WorkspaceWorkflowSettingsProps {
  /** Called before every catalog edit, so the dashboard can refresh when settings close. */
  onCatalogChange: () => void;
}

/** Settings → Workflow: the workspace's statuses, task types and tags. */
export const WorkspaceWorkflowSettings: React.FC<WorkspaceWorkflowSettingsProps> = ({ onCatalogChange }) => {
  const {
    statuses, addStatus: addStatusAction, updateStatus: updateStatusAction, deleteStatus: deleteStatusAction,
    taskTypes, addTaskType: addTaskTypeAction, updateTaskType: updateTaskTypeAction, deleteTaskType: deleteTaskTypeAction,
    tags, addTag: addTagAction, updateTag: updateTagAction, deleteTag: deleteTagAction,
  } = usePlannerStore(useShallow((state) => ({
    statuses: state.statuses,
    addStatus: state.addStatus,
    updateStatus: state.updateStatus,
    deleteStatus: state.deleteStatus,
    taskTypes: state.taskTypes,
    addTaskType: state.addTaskType,
    updateTaskType: state.updateTaskType,
    deleteTaskType: state.deleteTaskType,
    tags: state.tags,
    addTag: state.addTag,
    updateTag: state.updateTag,
    deleteTag: state.deleteTag,
  })));

  const markCatalogTouched = <TArgs extends unknown[], TResult>(
    action: (...args: TArgs) => TResult,
  ) => (...args: TArgs): TResult => {
    onCatalogChange();
    return action(...args);
  };

  const addStatus = markCatalogTouched(addStatusAction);
  const updateStatus = markCatalogTouched(updateStatusAction);
  const deleteStatus = markCatalogTouched(deleteStatusAction);
  const addTaskType = markCatalogTouched(addTaskTypeAction);
  const updateTaskType = markCatalogTouched(updateTaskTypeAction);
  const deleteTaskType = markCatalogTouched(deleteTaskTypeAction);
  const addTag = markCatalogTouched(addTagAction);
  const updateTag = markCatalogTouched(updateTagAction);
  const deleteTag = markCatalogTouched(deleteTagAction);

  const [newStatusEmoji, setNewStatusEmoji] = useState('');
  const [newStatusName, setNewStatusName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    addStatus({
      name: newStatusName.trim(),
      emoji: newStatusEmoji.trim() || null,
      color: DEFAULT_STATUS_COLOR,
      isFinal: false,
      isCancelled: false,
    });
    setNewStatusName('');
    setNewStatusEmoji('');
  };

  const handleAddType = () => {
    if (!newTypeName.trim()) return;
    addTaskType({ name: newTypeName.trim(), icon: null });
    setNewTypeName('');
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    addTag({ name: newTagName.trim(), color: DEFAULT_COLOR_PICKER_VALUE });
    setNewTagName('');
  };

  return (
    <div className="space-y-5">
      <Block title={t`Statuses`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <EmojiPicker
              value={newStatusEmoji}
              onChange={setNewStatusEmoji}
              className="w-16 text-center"
              onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
            />
            <Input
              placeholder={t`New status name...`}
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
            />
            <Button onClick={handleAddStatus} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <span className="w-16">{t`Emoji`}</span>
            <span className="flex-1">{t`Status`}</span>
            <div className="flex w-10 justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t`Final`}</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex w-10 justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                    <Ban className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t`Cancelled`}</TooltipContent>
              </Tooltip>
            </div>
            <span className="w-8" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            {statuses.map((status) => (
              <div key={status.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                <EmojiPicker
                  value={status.emoji ?? ''}
                  onChange={(emoji) => updateStatus(status.id, { emoji })}
                  className="w-16 h-8 text-center"
                />
                <StatusNameInput
                  value={status.name}
                  onChange={(next) => updateStatus(status.id, { name: next })}
                />
                <label className="flex w-10 items-center justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Checkbox
                        checked={status.isFinal}
                        onCheckedChange={(checked) => {
                          const nextFinal = checked === true;
                          updateStatus(
                            status.id,
                            nextFinal
                              ? { isFinal: true, isCancelled: false }
                              : { isFinal: false },
                          );
                        }}
                        aria-label={t`Final status`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t`Final`}</TooltipContent>
                  </Tooltip>
                </label>
                <label className="flex w-10 items-center justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Checkbox
                        checked={status.isCancelled}
                        onCheckedChange={(checked) => {
                          const nextCancelled = checked === true;
                          updateStatus(
                            status.id,
                            nextCancelled
                              ? { isCancelled: true, isFinal: false }
                              : { isCancelled: false },
                          );
                        }}
                        aria-label={t`Cancelled status`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t`Cancelled`}</TooltipContent>
                  </Tooltip>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteStatus(status.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title={t`Task types`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={t`New type name...`}
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
            />
            <Button onClick={handleAddType} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {taskTypes.map((type) => (
              <div key={type.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Input
                  value={type.name}
                  onChange={(e) => updateTaskType(type.id, { name: e.target.value })}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTaskType(type.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title={t`Tags`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={t`New tag name...`}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            />
            <Button onClick={handleAddTag} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <ColorPicker
                  value={tag.color}
                  onChange={(color) => updateTag(tag.id, { color })}
                />
                <Input
                  value={tag.name}
                  onChange={(e) => updateTag(tag.id, { name: e.target.value })}
                  className="flex-1 h-8"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTag(tag.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Block>
    </div>
  );
};

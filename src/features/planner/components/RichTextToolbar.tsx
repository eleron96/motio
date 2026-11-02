import React from 'react';
import { Image } from 'lucide-react';
import { RICH_TEXT_TOOLBAR_GROUPS as toolbarGroups } from '@/features/planner/lib/richTextToolbarGroups';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';


interface RichTextToolbarProps {
  framed: boolean;
  disabled: boolean;
  onCommand: (command: string, value?: string) => void;
  onInsertImage: () => void;
}

/** Formatting buttons of the rich-text editor; they never take focus from the text. */
export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  framed,
  disabled,
  onCommand,
  onInsertImage,
}) => (
  <div
    className={cn(
      'flex flex-wrap items-center gap-0.5',
      framed
        ? 'border-b border-border/60 bg-secondary/70 px-2 py-1.5'
        : 'rounded-md border border-input bg-muted/30 p-1',
    )}
  >
    {toolbarGroups.map((group, groupIndex) => (
      <React.Fragment key={groupIndex}>
        {groupIndex > 0 && (
          <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
        )}
        {group.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onCommand(item.command, item.value)}
              aria-label={item.label}
              title={item.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </React.Fragment>
    ))}
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onInsertImage}
      aria-label="Insert image"
      title="Insert image"
    >
      <Image className="h-4 w-4" />
    </Button>
  </div>
);

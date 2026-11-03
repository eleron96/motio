import React from 'react';
import { Copy, MoreVertical, RotateCw, Trash2 } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import type { Customer, Project } from '@/features/planner/types/planner';

interface TaskDetailHeaderProps {
  currentProject: Project | undefined;
  currentProjectCustomer: Customer | null | undefined;
  isRepeating: boolean;
  draftTitle: string;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  isReadOnly: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** The task card's header: the project crumb, the large title and the actions menu. */
export const TaskDetailHeader: React.FC<TaskDetailHeaderProps> = ({
  currentProject,
  currentProjectCustomer,
  isRepeating,
  draftTitle,
  onTitleChange,
  onTitleBlur,
  isReadOnly,
  onDuplicate,
  onDelete,
}) => (
  // On wide screens the header block stops where the tinted parameters panel
  // begins, so the title never crosses into it. The wrapper is positioned so
  // the actions button below anchors to this header rather than to the phone
  // screen, where it would paint over the back arrow.
  <div className="relative">
    <div className="relative px-6 pb-3 pr-20 pt-5 lg:mr-[340px] lg:pr-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {currentProject ? (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: currentProject.color }}
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">
              {formatProjectLabel(currentProject.name, currentProject.code)}
            </span>
            {currentProject.archived && (
              <span className="text-[10px] text-muted-foreground">({t`Archived`})</span>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {currentProjectCustomer
                ? `${t`Customer`}: ${currentProjectCustomer.name}`
                : t`No customer`}
            </span>
          </>
        ) : (
          <span>{t`No project`}</span>
        )}
        {isRepeating && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <RotateCw className="h-3 w-3" aria-hidden="true" />
              {t`Repeat`}
            </span>
          </>
        )}
      </div>
      <Input
        id="title"
        value={draftTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        onBlur={onTitleBlur}
        placeholder={t`Task title`}
        aria-label={t`Title`}
        className="-mx-2 mt-1 h-auto rounded-md border-0 bg-transparent px-2 py-1 text-2xl font-bold tracking-tight shadow-none hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-2xl"
        disabled={isReadOnly}
      />
    </div>

    {!isReadOnly && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-3 h-8 w-8 text-muted-foreground lg:right-10 lg:top-2.5"
            aria-label={t`Task actions`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {t`Duplicate task`}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {t`Delete task`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
);

import React from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { cn } from '@/shared/lib/classNames';

interface MobilePageSheetLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  browseLabel: React.ReactNode;
  sheetTitle: React.ReactNode;
  sheetContent: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const MobilePageSheetLayout: React.FC<MobilePageSheetLayoutProps> = ({
  open,
  onOpenChange,
  browseLabel,
  sheetTitle,
  sheetContent,
  summary,
  children,
  className,
  contentClassName,
}) => (
  <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => onOpenChange(true)}
        >
          <PanelLeft className="h-4 w-4" />
          {browseLabel}
        </Button>
        {summary && (
          <div className="min-w-0 text-xs text-muted-foreground">
            <div className="truncate">
              {summary}
            </div>
          </div>
        )}
      </div>
    </div>

    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', contentClassName)}>
      {children}
    </div>

    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="flex h-full w-[min(100vw,24rem)] flex-col gap-0 p-0 sm:max-w-[24rem]"
      >
        <SheetHeader className="border-b border-border px-4 py-4 text-left">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          {sheetContent}
        </div>
      </SheetContent>
    </Sheet>
  </div>
);

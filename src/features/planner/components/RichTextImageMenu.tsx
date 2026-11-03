import React from 'react';
import { t } from '@lingui/macro';
import type { MenuPosition } from '@/features/planner/hooks/useRichTextImageMenu';

interface RichTextImageMenuProps {
  menuRef: React.RefObject<HTMLDivElement>;
  position: MenuPosition | null;
  onOpenImage: () => void;
  onRemoveImage: () => void;
}

export const RichTextImageMenu: React.FC<RichTextImageMenuProps> = ({
  menuRef,
  position,
  onOpenImage,
  onRemoveImage,
}) => {
  if (!position) return null;
  return (
    <div
      ref={menuRef}
      className="rte-image-menu absolute z-[60] min-w-[160px] rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
      style={{ left: position.x, top: position.y }}
    >
      <button
        type="button"
        className="w-full rounded-sm px-2 py-1 text-left hover:bg-muted"
        onClick={onOpenImage}
      >
        {t`Open fullscreen`}
      </button>
      <button
        type="button"
        className="w-full rounded-sm px-2 py-1 text-left hover:bg-muted"
        onClick={onRemoveImage}
      >
        {t`Remove image`}
      </button>
    </div>
  );
};

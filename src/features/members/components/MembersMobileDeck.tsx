import React from 'react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { MobilePillSubnav, type MobilePillSubnavItem } from '@/shared/ui/mobile-pill-subnav';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { MembersMobileList, type MembersMobileListProps } from '@/features/members/components/MembersMobileList';

/**
 * Order of the phone sections. The pill strip, the swipe deck and the dots all
 * read from this one list, so they cannot disagree about what comes next.
 */
const MOBILE_SECTIONS: Array<{ id: 'tasks' | 'groups' }> = [
  { id: 'tasks' },
  { id: 'groups' },
];

type MembersMode = 'tasks' | 'groups';

interface MembersMobileDeckProps {
  mode: MembersMode;
  onModeChange: (mode: MembersMode) => void;
  listProps: Omit<MembersMobileListProps, 'mode'>;
}

/** The phone's first level: People and Groups as swipeable pages under a pill strip. */
export const MembersMobileDeck: React.FC<MembersMobileDeckProps> = ({ mode, onModeChange, listProps }) => {
  const mobileSectionIndex = Math.max(
    0,
    MOBILE_SECTIONS.findIndex((section) => section.id === mode),
  );
  const setMode = onModeChange;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* The strip scrolls sideways itself, so it must swallow the gesture
          instead of letting the deck page under the finger. */}
      <div data-swipe-ignore className="shrink-0 border-b border-border bg-card">
        <MobilePillSubnav
          items={MOBILE_SECTIONS.map((section) => ({
            id: section.id,
            label: section.id === 'tasks' ? t`People` : t`Groups`,
          })) as MobilePillSubnavItem[]}
          activeId={mode}
          onChange={(id) => setMode(id as 'tasks' | 'groups')}
          ariaLabel={t`People sections`}
        />
      </div>

      {/* Each deck page is the list itself; tapping a row walks into it. */}
      <MobileSwipeDeck
        index={mobileSectionIndex}
        count={MOBILE_SECTIONS.length}
        onIndexChange={(next) => setMode(MOBILE_SECTIONS[next].id)}
      >
        {MOBILE_SECTIONS.map((section) => (
          <div key={section.id} className="flex h-full min-h-0 flex-col overflow-hidden">
            <MembersMobileList mode={section.id} {...listProps} />
          </div>
        ))}
      </MobileSwipeDeck>

      <div
        // Safari reports safe-area-inset-bottom as 0 without
        // viewport-fit=cover, so the clearance has to be a real gap.
        className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-card pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
      >
        {MOBILE_SECTIONS.map((section, index) => (
          <span
            key={section.id}
            aria-hidden="true"
            className={cn(
              'h-1.5 rounded-full transition-all duration-200',
              index === mobileSectionIndex ? 'w-4 bg-foreground' : 'w-1.5 bg-border',
            )}
          />
        ))}
      </div>
    </div>
  );
};

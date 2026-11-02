import React, { useState } from 'react';
import { t } from '@lingui/macro';
import {
  ChartGantt,
  Hand,
  MousePointerClick,
  PanelsTopLeft,
  Pointer,
  SquarePen,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';

type IntroCard = {
  key: string;
  icon: LucideIcon;
  title: string;
  text?: string;
  gestures?: { icon: LucideIcon; label: string }[];
};

/**
 * The phone gets its own first meeting: the desktop tour points at elements
 * the phone layout doesn't have, so it never ran there and a newcomer on a
 * phone was told nothing. These cards say what the screen is and which touch
 * does what — the part no one guesses: a tap only peeks at a task.
 * Viewers skip the card about adding tasks and the hold menu, whose actions
 * are all greyed out for them.
 */
const buildCards = (canEdit: boolean): IntroCard[] => {
  const cards: IntroCard[] = [
    {
      key: 'timeline',
      icon: ChartGantt,
      title: t`Your team's shared timeline`,
      text: t`Each row is a person, each bar is one of their tasks. Scroll down for the whole team, sideways for other days.`,
    },
    {
      key: 'gestures',
      icon: Pointer,
      title: t`Tap, double-tap, hold`,
      gestures: [
        { icon: Pointer, label: t`Tap a task for a quick look` },
        { icon: MousePointerClick, label: t`Double-tap to open it` },
        ...(canEdit ? [{ icon: Hand, label: t`Hold for quick actions` }] : []),
      ],
    },
  ];

  if (canEdit) {
    cards.push({
      key: 'create',
      icon: SquarePen,
      title: t`Add a task`,
      text: t`Tap the pencil button at the bottom, or double-tap an empty day in someone's row.`,
    });
  }

  cards.push({
    key: 'sections',
    icon: PanelsTopLeft,
    title: t`Sections`,
    text: t`Timeline, Dashboard, Projects and Team are at the top: tap one or swipe along the header. Your avatar opens the menu and settings.`,
  });

  return cards;
};

type MobileOnboardingCardsProps = {
  open: boolean;
  canEdit: boolean;
  /** Finished or skipped — either way the intro is done. */
  onClose: () => void;
};

export const MobileOnboardingCards: React.FC<MobileOnboardingCardsProps> = ({
  open,
  canEdit,
  onClose,
}) => {
  const cards = buildCards(canEdit);
  const [index, setIndex] = useState(0);
  const isLast = index === cards.length - 1;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="bottom"
        hideCloseButton
        aria-describedby={undefined}
        // Тап мимо шторки её не закрывает: случайное касание засчитало бы
        // знакомство пройденным навсегда. Выход — «Пропустить» или до конца.
        onInteractOutside={(event) => event.preventDefault()}
        className="gap-0 rounded-t-2xl p-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
        data-testid="mobile-onboarding-cards"
      >
        <SheetTitle className="sr-only">{t`Getting started`}</SheetTitle>

        <MobileSwipeDeck index={index} count={cards.length} onIndexChange={setIndex}>
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="flex flex-col items-start gap-3 px-6 pb-2 pt-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold leading-snug">{card.title}</h2>
                {card.text && (
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{card.text}</p>
                )}
                {card.gestures && (
                  <ul className="flex w-full flex-col gap-2.5">
                    {card.gestures.map(({ icon: GestureIcon, label }) => (
                      <li key={label} className="flex items-center gap-3 text-[15px] text-muted-foreground">
                        <GestureIcon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </MobileSwipeDeck>

        <div className="flex justify-center gap-1.5 py-4" aria-hidden="true">
          {cards.map((card, cardIndex) => (
            <span
              key={card.key}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                cardIndex === index ? 'w-5 bg-primary' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6">
          <Button variant="ghost" className="press h-11 px-3 text-muted-foreground" onClick={onClose}>
            {t`Skip`}
          </Button>
          <Button
            className="press h-11 min-w-[7.5rem]"
            onClick={() => (isLast ? onClose() : setIndex(index + 1))}
          >
            {isLast ? t`Got it` : t`Next`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

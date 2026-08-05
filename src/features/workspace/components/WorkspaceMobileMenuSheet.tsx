import React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Bell, Building2, Settings, UserCog } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { t } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { roleLabel } from '@/features/auth/lib/inboxLabels';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { ReleaseNotesDialog } from '@/features/auth/components/ReleaseNotesDialog';
import { Sheet, SheetClose, SheetOverlay, SheetPortal, SheetTitle } from '@/shared/ui/sheet';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';

/** Pulled down this far past the collapsed size and released — dismissed. */
const DISMISS_DISTANCE = 90;
/**
 * Movement before a touch counts as a drag rather than a tap. Above the ~10px
 * tap slop of mobile browsers, so a slightly sloppy tap still opens its row.
 */
const DRAG_START_PX = 16;
/** Past this much travel the release must not also fire the row's click. */
const CLICK_SWALLOW_DISTANCE = 16;
/** Travel that commits a snap to the next stop (expand up / collapse down). */
const SNAP_TRAVEL = 70;
/** The sheet never grows past this — the gap keeps the rounded corners visible. */
const EXPANDED_HEIGHT = 'calc(100svh - 12px)';
/** Height of the grabber strip, part of the sheet's natural size. */
const GRABBER_H = 24;
/** Snap animation for settling between the stops. */
const SETTLE = 'height 320ms cubic-bezier(0.32, 0.72, 0, 1)';
/** When a settle animation ends, the explicit height hands back to `auto`. */
const SETTLE_MS = 340;

interface WorkspaceMobileMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenAccountSettings: () => void;
  onOpenWorkspaces: () => void;
  /** Omitted where the inbox doesn't exist (the /demo sandbox). */
  onOpenNotifications?: () => void;
  unreadCount?: number;
  settingsDisabled?: boolean;
  showSettingsButton?: boolean;
}

/**
 * The phone menu: a bottom sheet under the thumb instead of the old left drawer.
 * It is a chooser — every row leads somewhere (workspace switch, workspace
 * settings, notifications, account settings) and the destinations open as
 * full-screen stack screens on top of it.
 *
 * Two stops: collapsed (its natural, content-sized height — plain `height:
 * auto`, nothing measured at mount) and full screen. Dragging up grows the
 * sheet — the extra space opens between the groups and the footer, which
 * carries the app version and stays pinned to the bottom edge by `mt-auto`.
 * Dragging down collapses and then dismisses it. The only measurements happen
 * at gesture time, when layout is guaranteed live.
 */
export const WorkspaceMobileMenuSheet: React.FC<WorkspaceMobileMenuSheetProps> = ({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenAccountSettings,
  onOpenWorkspaces,
  onOpenNotifications,
  unreadCount = 0,
  settingsDisabled = false,
  showSettingsButton = true,
}) => {
  const location = useLocation();
  const lastPathnameRef = React.useRef(location.pathname);
  const user = useAuthStore((state) => state.user);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const profileAvatarUrl = useAuthStore((state) => state.profileAvatarUrl);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);

  const signedInLabel = getAccountSignedInLabel(user, t`Unknown user`);
  const initials = getAccountInitials(profileDisplayName, signedInLabel);
  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);

  const [expanded, setExpanded] = React.useState(false);
  /** Explicit height while dragging or settling; null = the stance's own CSS. */
  const [heightPx, setHeightPx] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = React.useState(false);

  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const settleTimerRef = React.useRef<number | null>(null);
  const gestureRef = React.useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    h0: number;
    startedExpanded: boolean;
    dy: number;
    dragging: boolean;
  } | null>(null);
  // A finished drag must not also fire the row's click on release.
  const swallowClickRef = React.useRef(false);

  React.useEffect(() => {
    if (lastPathnameRef.current === location.pathname) return;
    lastPathnameRef.current = location.pathname;
    onOpenChange(false);
  }, [location.pathname, onOpenChange]);

  const clearSettleTimer = React.useCallback(() => {
    if (settleTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (open) return;
    setExpanded(false);
    setHeightPx(null);
    setDragging(false);
    gestureRef.current = null;
    swallowClickRef.current = false;
    clearSettleTimer();
  }, [open, clearSettleTimer]);

  React.useEffect(() => () => {
    if (settleTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(settleTimerRef.current);
    }
  }, []);

  /** After the settle animation lands, hand the height back to the stance CSS. */
  const scheduleHeightRelease = React.useCallback(() => {
    clearSettleTimer();
    if (typeof window === 'undefined') {
      setHeightPx(null);
      return;
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      setHeightPx(null);
    }, SETTLE_MS);
  }, [clearSettleTimer]);

  /** The sheet's content-sized height — measured live, only at gesture time. */
  const naturalHeight = () => (
    GRABBER_H
    + (scrollRef.current?.scrollHeight ?? 0)
    + (footerRef.current?.offsetHeight ?? 0)
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A drag that ends without a click (every touch drag) would otherwise leave
    // the flag armed and eat the NEXT tap. Any click owed to the previous
    // gesture has already been dispatched by the time a new pointer goes down.
    swallowClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      h0: sheetRef.current?.offsetHeight ?? 0,
      startedExpanded: expanded,
      dy: 0,
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - gesture.y0;
    const deltaX = event.clientX - gesture.x0;

    if (!gesture.dragging) {
      if (Math.abs(deltaY) < DRAG_START_PX && Math.abs(deltaX) < DRAG_START_PX) return;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) {
        gestureRef.current = null;
        return;
      }
      const scroller = scrollRef.current;
      if (deltaY < 0) {
        // Upwards grows the sheet — unless it is already full or the list has
        // its own scrolling to do, where the gesture belongs to the scroller.
        const scrollable = !!scroller && scroller.scrollHeight > scroller.clientHeight + 1;
        if (gesture.startedExpanded || scrollable) {
          gestureRef.current = null;
          return;
        }
      } else {
        // Downwards collapses/dismisses — but only once the list is at its
        // top; mid-list it is a scroll.
        if ((scroller?.scrollTop ?? 0) > 0) {
          gestureRef.current = null;
          return;
        }
      }
      gesture.dragging = true;
      setDragging(true);
      // Not implemented in jsdom, and absent on some older mobile engines.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    gesture.dy = deltaY;
    // Only a real pull swallows the click; a tap that wobbles past the tap slop
    // still activates its row.
    if (Math.abs(deltaY) > CLICK_SWALLOW_DISTANCE) swallowClickRef.current = true;
    // The bottom edge is fixed; the top edge follows the finger. max-height
    // caps growth, the floor keeps the sheet from inverting.
    setHeightPx(Math.max(80, gesture.h0 - deltaY));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture?.dragging) return;
    setDragging(false);

    const { dy, h0, startedExpanded } = gesture;

    if (startedExpanded) {
      const natural = naturalHeight();
      // Past the collapsed size and then some — that pull means "away".
      const dismissAt = Math.max(h0 - natural, 0) + DISMISS_DISTANCE;
      if (dy > dismissAt) {
        onOpenChange(false);
        return;
      }
      if (dy >= SNAP_TRAVEL) {
        setExpanded(false);
        setHeightPx(Math.max(80, Math.min(natural, h0)));
        scheduleHeightRelease();
        return;
      }
      // Not far enough — glide back to full height.
      setHeightPx(null);
      return;
    }

    if (dy > DISMISS_DISTANCE) {
      onOpenChange(false);
      return;
    }
    if (dy <= -SNAP_TRAVEL) {
      setExpanded(true);
      setHeightPx(null);
      return;
    }
    // Not far enough — glide back to the natural size, then hand to auto.
    setHeightPx(Math.max(80, h0));
    scheduleHeightRelease();
  };

  // An interrupted gesture (second finger, a system edge swipe, the OS taking
  // over) is not a release: put the sheet back rather than dismissing it.
  const handlePointerCancel = () => {
    gestureRef.current = null;
    swallowClickRef.current = false;
    setDragging(false);
    setHeightPx(null);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const pick = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={sheetRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[22px] border-t bg-background shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:duration-500 data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=closed]:slide-out-to-bottom"
          style={{
            maxHeight: EXPANDED_HEIGHT,
            height: heightPx !== null ? `${heightPx}px` : (expanded ? EXPANDED_HEIGHT : undefined),
            transition: dragging ? 'none' : SETTLE,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClickCapture={handleClickCapture}
        >
          <SheetTitle className="sr-only">{t`Menu`}</SheetTitle>

          {/* The visual design has no corner X, but a screen-reader or keyboard
              user cannot flick the sheet away or hit the scrim — this gives them
              a real control, visible only once focused. */}
          <SheetClose className="sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:bg-card focus:ring-2 focus:ring-ring">
            {t`Close menu`}
          </SheetClose>

          {/* Grabber — the affordance for the drag (which is caught anywhere on
              the sheet). touch-action none makes it a reliable handle even where
              the browser would otherwise claim the gesture for scrolling. */}
          <div className="flex h-6 shrink-0 items-center justify-center" style={{ touchAction: 'none' }}>
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 pt-1.5"
            style={{ touchAction: dragging ? 'none' : 'pan-y' }}
          >
            <div className="flex items-center gap-3 px-1.5 pt-1">
              <PersonAvatar
                userId={user?.id}
                avatarUrl={profileAvatarUrl}
                initials={initials}
                colorSeed={user?.id}
                size="xl"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold leading-tight">
                  {profileDisplayName || signedInLabel}
                </p>
                {profileDisplayName && (
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{signedInLabel}</p>
                )}
              </div>
            </div>

            <MobileListGroup title={t`Workspace`}>
              <MobileListRow
                icon={<Building2 className="h-[17px] w-[17px]" />}
                title={currentWorkspace?.name ?? t`Select workspace`}
                subtitle={currentWorkspaceRole ? roleLabel(currentWorkspaceRole) : undefined}
                chevron
                onClick={pick(onOpenWorkspaces)}
              />
            </MobileListGroup>

            {(showSettingsButton || onOpenNotifications) && (
              <MobileListGroup title={t`Tools`}>
                {showSettingsButton ? (
                  <MobileListRow
                    icon={<Settings className="h-[17px] w-[17px]" />}
                    title={t`Workspace settings`}
                    chevron
                    disabled={settingsDisabled}
                    onClick={pick(onOpenSettings)}
                  />
                ) : null}
                {onOpenNotifications ? (
                  <MobileListRow
                    icon={<Bell className="h-[17px] w-[17px]" />}
                    title={t`Notifications`}
                    subtitle={t`Open invites and task updates.`}
                    badge={unreadCount}
                    chevron
                    onClick={pick(onOpenNotifications)}
                  />
                ) : null}
              </MobileListGroup>
            )}

            <MobileListGroup title={t`Account`}>
              <MobileListRow
                icon={<UserCog className="h-[17px] w-[17px]" />}
                title={t`Account settings`}
                chevron
                onClick={pick(onOpenAccountSettings)}
              />
            </MobileListGroup>
          </div>

          {/* Version and author at the sheet's bottom edge: right under the
              content when collapsed, pinned to the screen bottom (mt-auto) when
              the sheet is pulled to full height. */}
          <div
            ref={footerRef}
            className="mt-auto shrink-0 px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.9rem)] pt-5 text-center text-[11px] leading-relaxed text-muted-foreground"
          >
            {/* Tapping the version opens the release notes, same as the desktop
                account-settings footer. */}
            <button
              type="button"
              onClick={() => setReleaseNotesOpen(true)}
              className="mx-auto block px-3 py-0.5 leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {`v${APP_VERSION}`}
            </button>
            <div>
              © Motio,{` `}
              <a
                href="https://nikog.net"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                NIKO G.
              </a>
            </div>
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>

      <ReleaseNotesDialog open={releaseNotesOpen} onOpenChange={setReleaseNotesOpen} />
    </Sheet>
  );
};

type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/**
 * ⌘K on a Mac, Ctrl+K on Windows and Linux (either works everywhere). Matched
 * by the physical key, so it works in any layout: on a Russian one Ctrl+K types
 * «л». Not with Alt (AltGr on Windows is Ctrl+Alt and types characters) nor
 * with Shift (Ctrl+Shift+K opens the Firefox console).
 */
export const isSearchShortcut = (event: ShortcutKey): boolean => (
  (event.metaKey || event.ctrlKey)
  && !event.altKey
  && !event.shiftKey
  && (event.code === 'KeyK' || event.key.toLowerCase() === 'k')
);

/**
 * "/" — the character, or the key that types it in an English layout (it types
 * "." in a Russian one).
 */
export const isSearchSlash = (event: ShortcutKey): boolean => (
  !event.metaKey
  && !event.ctrlKey
  && !event.altKey
  && (event.key === '/' || (event.code === 'Slash' && !event.shiftKey))
);

/** Whether the platform names the shortcut with ⌘ (Apple) rather than Ctrl. */
export const isApplePlatform = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform);

export const searchShortcutLabel = (platform: string): string => (
  isApplePlatform(platform) ? '⌘K' : 'Ctrl+K'
);

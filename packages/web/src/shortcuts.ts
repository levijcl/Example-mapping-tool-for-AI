type ShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
};

function isTextInput(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable === true;
}

/**
 * Board-level undo/redo for Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y.
 * Returns null while typing in a text field, so the browser's own text undo still works there.
 */
export function boardShortcut(event: ShortcutEvent): 'undo' | 'redo' | null {
  if (isTextInput(event.target)) return null;
  if (!event.metaKey && !event.ctrlKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.metaKey) return 'redo';
  return null;
}

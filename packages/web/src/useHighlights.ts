import { useCallback, useEffect, useRef, useState } from 'react';

export const HIGHLIGHT_MS = 2000;

/** Tracks card IDs recently changed by the AI; each one is highlighted for HIGHLIGHT_MS. */
export function useHighlights() {
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());

  const flash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setHighlighted((current) => new Set([...current, ...ids]));
    for (const id of ids) {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setHighlighted((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }, HIGHLIGHT_MS),
      );
    }
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { highlighted, flash };
}

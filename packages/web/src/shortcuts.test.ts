import { describe, expect, it } from 'vitest';
import { boardShortcut } from './shortcuts';

const press = (
  key: string,
  mods: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {},
  target: unknown = null,
) =>
  boardShortcut({
    key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    target: target as EventTarget | null,
  });

describe('boardShortcut', () => {
  it('maps Cmd/Ctrl+Z to undo and with Shift to redo', () => {
    expect(press('z', { meta: true })).toBe('undo');
    expect(press('z', { ctrl: true })).toBe('undo');
    expect(press('Z', { meta: true, shift: true })).toBe('redo');
    expect(press('z', { ctrl: true, shift: true })).toBe('redo');
  });

  it('maps Ctrl+Y to redo', () => {
    expect(press('y', { ctrl: true })).toBe('redo');
    expect(press('y', { meta: true })).toBeNull();
  });

  it('ignores keys without a modifier and other keys', () => {
    expect(press('z')).toBeNull();
    expect(press('a', { meta: true })).toBeNull();
  });

  it('leaves text fields to the browser', () => {
    expect(press('z', { meta: true }, { tagName: 'TEXTAREA' })).toBeNull();
    expect(press('z', { meta: true }, { tagName: 'INPUT' })).toBeNull();
    expect(press('z', { meta: true }, { tagName: 'DIV', isContentEditable: true })).toBeNull();
    expect(press('z', { meta: true }, { tagName: 'DIV', isContentEditable: false })).toBe('undo');
  });
});

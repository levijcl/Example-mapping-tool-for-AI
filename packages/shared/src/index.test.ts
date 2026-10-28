import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT } from './index';

describe('shared', () => {
  it('exposes the default port', () => {
    expect(DEFAULT_PORT).toBe(4319);
  });
});

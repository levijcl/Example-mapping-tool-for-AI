import { describe, expect, it } from 'vitest';
import { isLocalHost, isLocalOrigin } from './local-only';

describe('isLocalHost', () => {
  it.each(['127.0.0.1:4319', 'localhost:4319', 'localhost', '[::1]:4319'])('allows %s', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([undefined, '', 'evil.com', 'evil.com:4319', '127.0.0.1.evil.com'])(
    'rejects %s',
    (host) => {
      expect(isLocalHost(host)).toBe(false);
    },
  );
});

describe('isLocalOrigin', () => {
  it.each([undefined, 'http://127.0.0.1:5173', 'http://localhost:4319'])('allows %s', (origin) => {
    expect(isLocalOrigin(origin)).toBe(true);
  });

  it.each(['https://evil.com', 'null', 'http://127.0.0.1.evil.com'])('rejects %s', (origin) => {
    expect(isLocalOrigin(origin)).toBe(false);
  });
});

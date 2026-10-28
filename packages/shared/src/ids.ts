import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export type IdPrefix = 'b' | 'r' | 'e' | 'q';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

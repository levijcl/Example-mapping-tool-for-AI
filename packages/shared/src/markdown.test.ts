import { describe, expect, it } from 'vitest';
import { exportMarkdown } from './markdown';
import type { Board } from './schema';

const base: Board = {
  id: 'b_1',
  title: 'Coupons',
  story: 'As a shopper I can pay with a coupon',
  rules: [
    {
      id: 'r_1',
      text: 'Minimum spend $1000',
      examples: [
        { id: 'e_1', text: '$900 cart → rejected' },
        { id: 'e_2', text: '$1000 cart → accepted' },
      ],
    },
    { id: 'r_2', text: 'One coupon per order', examples: [] },
  ],
  questions: [
    { id: 'q_1', text: 'Does tax count?', status: 'resolved', resolution: 'No, pre-tax only' },
    { id: 'q_2', text: 'Can coupons expire?', status: 'open' },
  ],
  version: 3,
  createdAt: '',
  updatedAt: '',
};

describe('exportMarkdown', () => {
  it('renders a full board', () => {
    expect(exportMarkdown(base)).toMatchInlineSnapshot(`
      "# Coupons

      ## Story

      As a shopper I can pay with a coupon

      ## Rules

      ### 1. Minimum spend $1000

      - $900 cart → rejected
      - $1000 cart → accepted

      ### 2. One coupon per order

      _(no examples)_

      ## Questions

      - [x] Does tax count? — No, pre-tax only
      - [ ] Can coupons expire?
      "
    `);
  });

  it('renders an empty board', () => {
    expect(exportMarkdown({ ...base, story: '', rules: [], questions: [] })).toMatchInlineSnapshot(`
      "# Coupons

      ## Story

      _(empty)_

      ## Rules

      _(none)_

      ## Questions

      _(none)_
      "
    `);
  });
});

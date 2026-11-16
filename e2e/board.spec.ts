import { test } from './fixtures';
import { TheBoard, TheQuestions, TheRules } from './domain/questions';
import {
  AddExample,
  AddQuestion,
  AddRule,
  CreateBoard,
  MoveExample,
  OpenTheApp,
  ReloadTheApp,
  ResolveQuestion,
  RewordRule,
  TakeAScreenshot,
} from './domain/tasks';

const story = 'Pay with a coupon';

test.beforeEach(async ({ human }) => {
  await human.attemptsTo(OpenTheApp());
});

test('AI changes appear live in the browser and are highlighted', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('AI live updates', { story }));
  await human.sees(TheBoard.title()).toBe('AI live updates');

  await ai.attemptsTo(
    AddRule('Orders must total at least $1000', { examples: ['$900 cart → coupon rejected'] }),
    AddQuestion('Does tax count toward the minimum?'),
  );

  await human.sees(TheRules.all()).toEqual(['Orders must total at least $1000']);
  await human.sees(TheRules.isHighlighted('Orders must total at least $1000')).toBe(true);
  await human
    .sees(TheRules.examplesOf('Orders must total at least $1000'))
    .toEqual(['$900 cart → coupon rejected']);
  await human.sees(TheQuestions.open()).toEqual(['Does tax count toward the minimum?']);
  await human.attemptsTo(TakeAScreenshot('ai-live-updates'));

  await human.sees(TheRules.isHighlighted('Orders must total at least $1000')).toBe(false);
});

test('manual edits in the browser are visible to the AI', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('Manual edits', { story }));
  await human.sees(TheBoard.title()).toBe('Manual edits');
  await ai.attemptsTo(AddRule('Old rule'));

  await human.attemptsTo(
    RewordRule('Old rule').to('One coupon per order'),
    AddExample('Two coupons → second one rejected').toTheRule('One coupon per order'),
    AddQuestion('What about gift cards?'),
  );
  await human.sees(TheQuestions.open()).toEqual(['What about gift cards?']);
  await human.sees(TheRules.isHighlighted('One coupon per order')).toBe(false);

  await ai.sees(TheRules.all()).toEqual(['One coupon per order']);
  await ai
    .sees(TheRules.examplesOf('One coupon per order'))
    .toEqual(['Two coupons → second one rejected']);
  await ai.sees(TheQuestions.open()).toEqual(['What about gift cards?']);

  await human.attemptsTo(ResolveQuestion('What about gift cards?'));
  await ai.sees(TheQuestions.resolved()).toEqual(['What about gift cards?']);
});

test('dragging an example to another rule persists across reload', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('Drag and drop', { story }));
  await human.sees(TheBoard.title()).toBe('Drag and drop');
  await ai.attemptsTo(
    AddRule('Rule A', { examples: ['Example 1', 'Example 2'] }),
    AddRule('Rule B'),
  );

  await human.attemptsTo(MoveExample('Example 1').toTheRule('Rule B'));
  await ai.sees(TheRules.examplesOf('Rule B')).toEqual(['Example 1']);

  await human.attemptsTo(ReloadTheApp());
  await human.sees(TheRules.examplesOf('Rule B')).toEqual(['Example 1']);
  await human.sees(TheRules.examplesOf('Rule A')).toEqual(['Example 2']);
  await human.attemptsTo(TakeAScreenshot('after-drag'));
});

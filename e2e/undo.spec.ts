import { test } from './fixtures';
import { TheBoard, TheHistory, TheQuestions, TheRules } from './domain/questions';
import {
  AddQuestion,
  AddRule,
  CreateBoard,
  DraftAQuestionAndUndoTheTyping,
  OpenTheApp,
  Redo,
  TakeAScreenshot,
  Undo,
} from './domain/tasks';

test.beforeEach(async ({ human }) => {
  await human.attemptsTo(OpenTheApp());
});

test('keyboard undo/redo reverts board changes but not text being typed', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('Undo with keyboard'));
  await human.sees(TheBoard.title()).toBe('Undo with keyboard');
  await human.sees(TheHistory.canUndo()).toBe(false);

  // Cmd/Ctrl+Z inside a text field is the browser's text undo, not a board undo.
  await human.attemptsTo(AddQuestion('First question'), DraftAQuestionAndUndoTheTyping('draft'));
  await human.sees(TheQuestions.open()).toEqual(['First question']);
  await human.sees(TheHistory.canUndo()).toBe(true);

  await human.attemptsTo(Undo.withTheKeyboard());
  await human.sees(TheQuestions.open()).toEqual([]);
  await human.sees(TheHistory.canRedo()).toBe(true);
  await ai.sees(TheQuestions.open()).toEqual([]);

  await human.attemptsTo(Redo.withTheKeyboard());
  await human.sees(TheQuestions.open()).toEqual(['First question']);
  await human.sees(TheHistory.canRedo()).toBe(false);
});

test('the AI can undo, and the human can redo with the button', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('Undo by AI'));
  await human.sees(TheBoard.title()).toBe('Undo by AI');
  await ai.attemptsTo(AddRule('Rule from AI', { examples: ['Example from AI'] }));
  await human.sees(TheRules.all()).toEqual(['Rule from AI']);

  await ai.attemptsTo(Undo.theLastChange());
  await ai.sees(TheHistory.canRedo()).toBe(true);
  await human.sees(TheRules.all()).toEqual([]);

  await human.attemptsTo(Redo.theLastChange());
  await human.sees(TheRules.examplesOf('Rule from AI')).toEqual(['Example from AI']);
  await ai.sees(TheRules.all()).toEqual(['Rule from AI']);
  await human.attemptsTo(TakeAScreenshot('undo-redo'));
});

import type { Locator, Page } from '@playwright/test';
import { Ability } from '../screenplay';

/** Integration layer: lets an actor use the board through a browser. */
export class BrowseTheWeb extends Ability {
  readonly screen: BoardScreen;

  private constructor(readonly page: Page) {
    super();
    this.screen = new BoardScreen(page);
  }

  static using(page: Page): BrowseTheWeb {
    return new BrowseTheWeb(page);
  }
}

/** Where things are on the board screen. The only code that knows the DOM structure. */
export class BoardScreen {
  readonly connectionStatus: Locator;
  readonly boards: Locator;
  readonly boardTitle: Locator;
  readonly story: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;
  readonly ruleCards: Locator;
  readonly questions: Locator;
  readonly openQuestions: Locator;
  readonly resolvedQuestions: Locator;

  constructor(private readonly page: Page) {
    this.connectionStatus = page.getByText(/Connecting to server|Disconnected from server/);
    this.boards = page.getByRole('navigation', { name: 'Boards' });
    this.boardTitle = page.getByRole('button', { name: 'Edit board title' });
    this.story = page.getByRole('button', { name: 'Edit story' });
    this.undoButton = page.getByRole('button', { name: 'Undo', exact: true });
    this.redoButton = page.getByRole('button', { name: 'Redo', exact: true });
    this.ruleCards = page.getByRole('button', { name: 'Edit rule', exact: true });
    this.questions = page.getByRole('region', { name: 'Questions' });
    this.openQuestions = this.questions.getByRole('button', { name: 'Edit question', exact: true });
    this.resolvedQuestions = this.cards(this.questions)
      .filter({ has: page.getByRole('button', { name: 'Reopen question' }) })
      .locator('p');
  }

  /** The column holding a rule and its examples. */
  rule(text: string): Locator {
    return this.page.getByRole('region', { name: `Rule: ${text}`, exact: true });
  }

  ruleCard(text: string): Locator {
    return this.card(this.rule(text), 'rule', text);
  }

  examplesOf(ruleText: string): Locator {
    return this.rule(ruleText).getByRole('button', { name: 'Edit example', exact: true });
  }

  exampleCard(text: string): Locator {
    return this.card(this.page.locator('body'), 'example', text);
  }

  questionCard(text: string): Locator {
    return this.card(this.questions, 'question', text);
  }

  /** The "+ Rule", "+ Example", "+ Question" or "+ New board" button within `scope`. */
  addButton(scope: Locator | Page, label: string): Locator {
    return scope.getByRole('button', { name: `+ ${label}`, exact: true });
  }

  private cards(scope: Locator): Locator {
    return scope.locator('[data-testid]');
  }

  private card(scope: Locator, kind: string, text: string): Locator {
    const editButton = this.page
      .getByRole('button', { name: `Edit ${kind}`, exact: true })
      .filter({ hasText: exactly(text) });
    return this.cards(scope).filter({ has: editButton });
  }
}

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

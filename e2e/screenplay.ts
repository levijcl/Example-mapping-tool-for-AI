/**
 * A minimal Screenplay core (BDD in Action, 2nd ed., "portable test automation").
 *
 * - Specification layer (`*.spec.ts`): what the actors do and see, in business language.
 * - Domain layer (`domain/`): Tasks and Questions. Each one lists an implementation per
 *   Ability, and the actor's abilities pick which one runs.
 * - Integration layer (`integration/`): Abilities, the only code that knows about the DOM or MCP.
 */
import { expect, test } from '@playwright/test';

export abstract class Ability {}

/** An Ability class. Not a constructor type, so abilities can keep their constructors private. */
type AbilityType<A extends Ability> = { readonly prototype: A; readonly name: string };

export interface Activity {
  performAs(actor: Actor): Promise<void>;
  toString(): string;
}

export interface Question<T> {
  answeredBy(actor: Actor): Promise<T>;
  toString(): string;
}

export class Actor {
  private readonly abilities = new Map<AbilityType<Ability>, Ability>();

  constructor(readonly name: string) {}

  whoCan(...abilities: Ability[]): this {
    for (const ability of abilities)
      this.abilities.set(ability.constructor as AbilityType<Ability>, ability);
    return this;
  }

  can(type: AbilityType<Ability>): boolean {
    return this.abilities.has(type);
  }

  abilityTo<A extends Ability>(type: AbilityType<A>): A {
    const ability = this.abilities.get(type);
    if (!ability) throw new Error(`${this.name} does not have the ability to ${type.name}`);
    return ability as A;
  }

  async attemptsTo(...activities: Activity[]): Promise<void> {
    for (const activity of activities)
      await test.step(`${this.name} ${activity}`, () => activity.performAs(this));
  }

  answer<T>(question: Question<T>): Promise<T> {
    return question.answeredBy(this);
  }

  /** Retrying assertion on what this actor observes, e.g. `await ai.sees(TheRules.all()).toEqual([...])`. */
  sees<T>(question: Question<T>) {
    return expect.poll(() => this.answer(question), { message: `${this.name} sees ${question}` });
  }
}

type Via<T> = { ability: AbilityType<Ability>; run: (actor: Actor) => Promise<T> };

/** One implementation of a task or question, used when the actor has `ability`. */
export function via<A extends Ability, T>(
  ability: AbilityType<A>,
  run: (ability: A, actor: Actor) => Promise<T>,
): Via<T> {
  return { ability, run: (actor) => run(actor.abilityTo(ability), actor) };
}

/** Runs the first implementation the actor has the ability for. */
function performVia<T>(actor: Actor, description: string, implementations: Via<T>[]): Promise<T> {
  const chosen = implementations.find(({ ability }) => actor.can(ability));
  if (!chosen) {
    const needed = implementations.map(({ ability }) => ability.name).join(' or ');
    throw new Error(`${actor.name} cannot ${description}: needs ${needed}`);
  }
  return chosen.run(actor);
}

export function task(description: string, ...implementations: Via<void>[]): Activity {
  return {
    performAs: (actor) => performVia(actor, description, implementations),
    toString: () => description,
  };
}

export function question<T>(description: string, ...implementations: Via<T>[]): Question<T> {
  return {
    answeredBy: (actor) => performVia(actor, `answer ${description}`, implementations),
    toString: () => description,
  };
}

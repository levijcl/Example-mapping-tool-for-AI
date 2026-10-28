import { z } from 'zod';

export const TEXT_MAX_LENGTH = 500;

const text = z.string().trim().min(1).max(TEXT_MAX_LENGTH);
const optionalText = z.string().trim().max(TEXT_MAX_LENGTH);
const index = z.number().int().min(0);

export const ExampleSchema = z.object({ id: z.string(), text });

export const RuleSchema = z.object({
  id: z.string(),
  text,
  examples: z.array(ExampleSchema),
});

export const QuestionSchema = z.object({
  id: z.string(),
  text,
  status: z.enum(['open', 'resolved']),
  resolution: optionalText.optional(),
});

export const BoardSchema = z.object({
  id: z.string(),
  title: text,
  story: optionalText,
  rules: z.array(RuleSchema),
  questions: z.array(QuestionSchema),
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Example = z.infer<typeof ExampleSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Board = z.infer<typeof BoardSchema>;

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTitle'), title: text }),
  z.object({ type: z.literal('setStory'), text: optionalText }),
  z.object({
    type: z.literal('addRule'),
    text,
    index: index.optional(),
    examples: z.array(text).optional(),
  }),
  z.object({ type: z.literal('updateRule'), ruleId: z.string(), text }),
  z.object({ type: z.literal('deleteRule'), ruleId: z.string() }),
  z.object({ type: z.literal('moveRule'), ruleId: z.string(), toIndex: index }),
  z.object({ type: z.literal('addExample'), ruleId: z.string(), text, index: index.optional() }),
  z.object({ type: z.literal('updateExample'), exampleId: z.string(), text }),
  z.object({ type: z.literal('deleteExample'), exampleId: z.string() }),
  z.object({
    type: z.literal('moveExample'),
    exampleId: z.string(),
    toRuleId: z.string(),
    toIndex: index.optional(),
  }),
  z.object({ type: z.literal('addQuestion'), text }),
  z.object({ type: z.literal('updateQuestion'), questionId: z.string(), text }),
  z.object({
    type: z.literal('resolveQuestion'),
    questionId: z.string(),
    resolution: optionalText.optional(),
  }),
  z.object({ type: z.literal('reopenQuestion'), questionId: z.string() }),
  z.object({ type: z.literal('deleteQuestion'), questionId: z.string() }),
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];

export type Actor = 'human' | 'ai';

export type BoardSummary = {
  id: string;
  title: string;
  updatedAt: string;
  ruleCount: number;
  openQuestionCount: number;
};

export function summarizeBoard(board: Board): BoardSummary {
  return {
    id: board.id,
    title: board.title,
    updatedAt: board.updatedAt,
    ruleCount: board.rules.length,
    openQuestionCount: board.questions.filter((q) => q.status === 'open').length,
  };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

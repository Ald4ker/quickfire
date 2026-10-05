import { describe, expect, it } from '@jest/globals';
import { remapLegacyQuestionHistory, retireLegacyQuestionKeys } from '@/convex/seed';
import { buildCanonicalPool } from '@/convex/lib/contentRules';
import { getConvexHandler } from '../helpers/convexHandler';
import { createConvexTestCtx, type ConvexDoc } from '../helpers/convexTestCtx';

const PAIR = { legacyKey: 'astronomy:100:0', canonicalKey: 'q1996' };
const UNRELATED_LEGACY = 'astronomy:100:9';

type RetireArgs = {
  locale: string;
  dryRun?: boolean;
  questions: { legacyKey: string; canonicalKey: string }[];
};
type RetireResult = {
  retired: number;
  alreadyRetired: number;
  missingLegacy: number;
  missingCanonical: number;
};
type RemapArgs = {
  dryRun?: boolean;
  batchSize: number;
  cursor?: string;
  mapping: { legacyKey: string; canonicalKey: string }[];
};
type RemapResult = { remapped: number; scanned: number; isDone: boolean; cursor: string | null };

type TestCtx = ReturnType<typeof createConvexTestCtx>;

interface QuestionRow {
  _id: string;
  categoryId: string;
  canonicalKey: string;
  locale: string;
  status: string;
  promptImageKey?: string;
  [key: string]: unknown;
}

const retire = getConvexHandler<TestCtx, RetireArgs, RetireResult>(retireLegacyQuestionKeys);
const remap = getConvexHandler<TestCtx, RemapArgs, RemapResult>(remapLegacyQuestionHistory);

function questionDoc(args: {
  id: string;
  canonicalKey: string;
  locale?: string;
  status?: string;
  promptImageKey?: string;
}): QuestionRow {
  return {
    _id: args.id,
    categoryId: 'categories_1',
    canonicalKey: args.canonicalKey,
    prompt: `prompt ${args.canonicalKey}`,
    answer: 'answer',
    pointValue: 100,
    locale: args.locale ?? 'en',
    status: args.status ?? 'active',
    ...(args.promptImageKey ? { promptImageKey: args.promptImageKey } : {}),
  };
}

function historyDoc(args: { id: string; deviceId: string; canonicalKey: string; askedAt: number }): ConvexDoc {
  return {
    _id: args.id,
    deviceId: args.deviceId,
    canonicalKey: args.canonicalKey,
    categoryId: 'categories_1',
    askedAt: args.askedAt,
  };
}

function questionsCtx(rows: QuestionRow[]): TestCtx {
  return createConvexTestCtx({ tables: { questions: rows } });
}

/** Mirrors convex/content.ts: `active` rows in the caller's locales are the playable pool. */
function playablePool(rows: QuestionRow[], localeChain = ['en']) {
  return buildCanonicalPool(
    rows.filter((row) => row.status === 'active' && localeChain.includes(row.locale)),
    localeChain
  );
}

describe('retireLegacyQuestionKeys', () => {
  it('retires the position-keyed row once its canonical twin exists', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
    ]);

    const result = await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(result).toEqual({ retired: 1, alreadyRetired: 0, missingLegacy: 0, missingCanonical: 0 });
    expect(ctx.tables.questions.find((row) => row._id === 'q_legacy')?.status).toBe('retired');
    expect(ctx.tables.questions.find((row) => row._id === 'q_canonical')?.status).toBe('active');
  });

  it('never hides a question whose replacement is missing', async () => {
    const ctx = questionsCtx([questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey })]);

    const result = await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(result).toEqual({ retired: 0, alreadyRetired: 0, missingLegacy: 0, missingCanonical: 1 });
    expect(ctx.tables.questions[0].status).toBe('active');
    expect(ctx.patches).toEqual([]);
  });

  it('is idempotent', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
    ]);

    await retire(ctx, { locale: 'en', questions: [PAIR] });
    const second = await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(second).toEqual({ retired: 0, alreadyRetired: 1, missingLegacy: 0, missingCanonical: 0 });
  });

  it('reports a dry run without writing', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
    ]);

    const result = await retire(ctx, { locale: 'en', dryRun: true, questions: [PAIR] });

    expect(result.retired).toBe(1);
    expect(ctx.patches).toEqual([]);
    expect(ctx.tables.questions[0].status).toBe('active');
  });

  it('leaves legacy rows that are not in the mapping alone', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
      questionDoc({ id: 'q_unrelated', canonicalKey: UNRELATED_LEGACY }),
    ]);

    await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(ctx.tables.questions.find((row) => row._id === 'q_unrelated')?.status).toBe('active');
  });

  it('only touches the requested locale', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy_en', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_legacy_fr', canonicalKey: PAIR.legacyKey, locale: 'fr' }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
    ]);

    const result = await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(result.retired).toBe(1);
    expect(ctx.tables.questions.find((row) => row._id === 'q_legacy_fr')?.status).toBe('active');
  });

  it('keeps the picture asset on the surviving canonical row', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey, promptImageKey: 'flags/tr.png' }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey, promptImageKey: 'flags/tr.png' }),
    ]);

    await retire(ctx, { locale: 'en', questions: [PAIR] });

    expect(ctx.tables.questions.find((row) => row._id === 'q_canonical')).toMatchObject({
      status: 'active',
      promptImageKey: 'flags/tr.png',
    });
  });

  it('stops both copies of one question from reaching the playable pool', async () => {
    const rows = [
      questionDoc({ id: 'q_legacy', canonicalKey: PAIR.legacyKey }),
      questionDoc({ id: 'q_legacy_fr', canonicalKey: PAIR.legacyKey, locale: 'fr' }),
      questionDoc({ id: 'q_canonical', canonicalKey: PAIR.canonicalKey }),
    ];
    const ctx = questionsCtx(rows);

    expect(playablePool(rows, ['en'])).toHaveLength(2);

    await retire(ctx, { locale: 'en', questions: [PAIR] });

    const after = playablePool(ctx.tables.questions as QuestionRow[], ['en']);
    expect(after).toHaveLength(1);
    expect(after[0]?.canonicalKey).toBe(PAIR.canonicalKey);
  });
});

describe('remapLegacyQuestionHistory', () => {
  function historyCtx(): TestCtx {
    return createConvexTestCtx({
      tables: {
        device_question_history: [
          historyDoc({ id: 'h1', deviceId: 'd1', canonicalKey: PAIR.legacyKey, askedAt: 1 }),
          historyDoc({ id: 'h2', deviceId: 'd1', canonicalKey: PAIR.canonicalKey, askedAt: 2 }),
          historyDoc({ id: 'h3', deviceId: 'd2', canonicalKey: UNRELATED_LEGACY, askedAt: 3 }),
        ],
      },
    });
  }

  function keys(ctx: TestCtx): unknown[] {
    return ctx.tables.device_question_history.map((row) => row.canonicalKey);
  }

  it('pages through the table and remaps only known legacy keys', async () => {
    const ctx = historyCtx();

    const first = await remap(ctx, { batchSize: 2, mapping: [PAIR] });
    expect(first).toEqual({ remapped: 1, scanned: 2, isDone: false, cursor: '2' });

    const second = await remap(ctx, { batchSize: 2, cursor: first.cursor ?? undefined, mapping: [PAIR] });
    expect(second).toEqual({ remapped: 0, scanned: 1, isDone: true, cursor: null });

    expect(keys(ctx)).toEqual([PAIR.canonicalKey, PAIR.canonicalKey, UNRELATED_LEGACY]);
  });

  it('resumes safely after an interruption without double counting', async () => {
    const ctx = historyCtx();
    const pages: RemapResult[] = [];
    let cursor: string | undefined;

    for (let i = 0; i < 5; i += 1) {
      const page = await remap(ctx, { batchSize: 1, cursor, mapping: [PAIR] });
      pages.push(page);
      if (page.cursor === null) break;
      cursor = page.cursor;
    }

    expect(pages.map((page) => page.remapped)).toEqual([1, 0, 0]);
    expect(pages.map((page) => page.isDone)).toEqual([false, false, true]);
    expect(keys(ctx)).toEqual([PAIR.canonicalKey, PAIR.canonicalKey, UNRELATED_LEGACY]);
  });

  it('is a no-op once the mapping has been applied', async () => {
    const ctx = historyCtx();

    await remap(ctx, { batchSize: 100, mapping: [PAIR] });
    const second = await remap(ctx, { batchSize: 100, mapping: [PAIR] });

    expect(second).toEqual({ remapped: 0, scanned: 3, isDone: true, cursor: null });
  });

  it('reports a dry run without writing', async () => {
    const ctx = historyCtx();

    const result = await remap(ctx, { batchSize: 100, dryRun: true, mapping: [PAIR] });

    expect(result.remapped).toBe(1);
    expect(ctx.patches).toEqual([]);
    expect(keys(ctx)).toEqual([PAIR.legacyKey, PAIR.canonicalKey, UNRELATED_LEGACY]);
  });

  it('ignores legacy keys a different mapping chunk owns', async () => {
    const ctx = historyCtx();

    const result = await remap(ctx, {
      batchSize: 100,
      mapping: [{ legacyKey: 'other:100:0', canonicalKey: 'q42' }],
    });

    expect(result.remapped).toBe(0);
    expect(keys(ctx)).toEqual([PAIR.legacyKey, PAIR.canonicalKey, UNRELATED_LEGACY]);
  });
});

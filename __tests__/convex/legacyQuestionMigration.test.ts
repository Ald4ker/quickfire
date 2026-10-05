import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { remapLegacyQuestionHistory, retireLegacyQuestionKeys } from '@/convex/seed';
import {
  LEGACY_QUESTION_KEY_PAIRS,
  LEGACY_QUESTION_KEY_VERSION,
} from '@/convex/seed/legacyQuestionKeys';
import {
  buildCanonicalPool,
  filterExcludingCanonicalKeys,
} from '@/convex/lib/contentRules';
import { getConvexHandler } from '../helpers/convexHandler';
import { createConvexTestCtx, type ConvexDoc } from '../helpers/convexTestCtx';

type RetireArgs = {
  expectedMapVersion: string;
  offset: number;
  batchSize: number;
  dryRun?: boolean;
};
type RetireResult = {
  retired: number;
  alreadyRetired: number;
  missingLegacy: number;
  missingCanonical: number;
  inactiveCanonical: number;
  categoryMismatch: number;
  invalidPair: number;
  offset: number;
  processed: number;
  total: number;
  nextOffset: number | null;
  mapVersion: string;
  dryRun: boolean;
};
type RemapArgs = { expectedMapVersion: string; batchSize: number; cursor?: string; dryRun?: boolean };
type RemapResult = {
  remapped: number;
  missingTarget: number;
  inactiveTarget: number;
  categoryMismatch: number;
  unmappedLegacyKeys: number;
  scanned: number;
  isDone: boolean;
  cursor: string | null;
  mapVersion: string;
  dryRun: boolean;
};

type TestCtx = ReturnType<typeof createConvexTestCtx>;

interface QuestionRow extends ConvexDoc {
  categoryId: string;
  canonicalKey: string;
  locale: string;
  status: string;
  promptImageKey?: string;
}

const seedRows = JSON.parse(
  readFileSync(join(process.cwd(), 'convex', 'seed', 'questions.json'), 'utf8')
) as { canonicalKey: string; promptImageKey?: string }[];

const [FIRST_LEGACY, FIRST_CANONICAL] = LEGACY_QUESTION_KEY_PAIRS[0]!;
const SECOND_LEGACY = LEGACY_QUESTION_KEY_PAIRS[1]![0];
const PICTURE_CANONICAL_KEY = seedRows.find((row) => row.promptImageKey)!.canonicalKey;
const PICTURE_INDEX = LEGACY_QUESTION_KEY_PAIRS.findIndex(
  ([, canonicalKey]) => canonicalKey === PICTURE_CANONICAL_KEY
);
const UNOWNED_LEGACY_KEY = 'not-in-the-snapshot:100:0';

const retire = getConvexHandler<TestCtx, RetireArgs, RetireResult>(retireLegacyQuestionKeys);
const remap = getConvexHandler<TestCtx, RemapArgs, RemapResult>(remapLegacyQuestionHistory);

/** Every call must name the frozen snapshot it expects; only the mismatch tests vary it. */
function runRetire(ctx: TestCtx, args: Omit<RetireArgs, 'expectedMapVersion'>) {
  return retire(ctx, { expectedMapVersion: LEGACY_QUESTION_KEY_VERSION, ...args });
}

function runRemap(ctx: TestCtx, args: Omit<RemapArgs, 'expectedMapVersion'>) {
  return remap(ctx, { expectedMapVersion: LEGACY_QUESTION_KEY_VERSION, ...args });
}

function questionDoc(args: {
  id: string;
  canonicalKey: string;
  locale?: string;
  status?: string;
  categoryId?: string;
  promptImageKey?: string;
}): QuestionRow {
  return {
    _id: args.id,
    categoryId: args.categoryId ?? 'categories_1',
    canonicalKey: args.canonicalKey,
    prompt: `prompt ${args.canonicalKey}`,
    answer: 'answer',
    pointValue: 100,
    locale: args.locale ?? 'en',
    status: args.status ?? 'active',
    ...(args.promptImageKey ? { promptImageKey: args.promptImageKey } : {}),
  };
}

function historyDoc(args: {
  id: string;
  deviceId: string;
  canonicalKey: string;
  categoryId?: string;
  questionId?: string;
  askedAt?: number;
}): ConvexDoc {
  return {
    _id: args.id,
    deviceId: args.deviceId,
    canonicalKey: args.canonicalKey,
    categoryId: args.categoryId ?? 'categories_1',
    questionId: args.questionId,
    askedAt: args.askedAt ?? 1,
  };
}

function questionsCtx(rows: QuestionRow[]): TestCtx {
  return createConvexTestCtx({ tables: { questions: rows } });
}

function historyCtx(rows: ConvexDoc[]): TestCtx {
  return createConvexTestCtx({ tables: { device_question_history: rows } });
}

function questionRows(ctx: TestCtx, id: string) {
  return ctx.tables.questions.find((row) => row._id === id) as QuestionRow | undefined;
}

/** Mirrors convex/content.ts: only `active` rows in the caller's locales are playable. */
function playablePool(rows: QuestionRow[], localeChain = ['en']) {
  return buildCanonicalPool(
    rows.filter((row) => row.status === 'active' && localeChain.includes(row.locale)),
    localeChain
  );
}

describe('retireLegacyQuestionKeys', () => {
  it('retires the position-keyed row when an active replacement exists in the same category', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result).toMatchObject({
      retired: 1,
      alreadyRetired: 0,
      missingLegacy: 0,
      missingCanonical: 0,
      inactiveCanonical: 0,
      categoryMismatch: 0,
      invalidPair: 0,
      offset: 0,
      processed: 1,
      total: LEGACY_QUESTION_KEY_PAIRS.length,
      nextOffset: 1,
      dryRun: false,
    });
    expect(result.mapVersion).toBe(LEGACY_QUESTION_KEY_VERSION);
    expect(questionRows(ctx, 'legacy')?.status).toBe('retired');
    expect(questionRows(ctx, 'canonical')?.status).toBe('active');
  });

  it('keeps the legacy row playable when the replacement is missing', async () => {
    const ctx = questionsCtx([questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY })]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result.missingCanonical).toBe(1);
    expect(result.retired).toBe(0);
    expect(questionRows(ctx, 'legacy')?.status).toBe('active');
    expect(ctx.patches).toEqual([]);
  });

  it('keeps the legacy row playable when the replacement is not active', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL, status: 'retired' }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result.inactiveCanonical).toBe(1);
    expect(result.retired).toBe(0);
    expect(questionRows(ctx, 'legacy')?.status).toBe('active');
  });

  it('keeps the legacy row playable when the replacement sits in another category', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY, categoryId: 'categories_1' }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL, categoryId: 'categories_2' }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result.categoryMismatch).toBe(1);
    expect(result.retired).toBe(0);
    expect(questionRows(ctx, 'legacy')?.status).toBe('active');
  });

  it('counts an already retired legacy row without writing again', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY, status: 'retired' }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result.alreadyRetired).toBe(1);
    expect(result.retired).toBe(0);
    expect(ctx.patches).toEqual([]);
  });

  it('is idempotent', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    await runRetire(ctx, { offset: 0, batchSize: 1 });
    const second = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(second.retired).toBe(0);
    expect(second.alreadyRetired).toBe(1);
  });

  it('only walks the requested slice of the frozen snapshot', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'first', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'second', canonicalKey: SECOND_LEGACY }),
    ]);

    const result = await runRetire(ctx, { offset: 1, batchSize: 1 });

    expect(result.offset).toBe(1);
    expect(result.processed).toBe(1);
    expect(questionRows(ctx, 'first')?.status).toBe('active');
    expect(questionRows(ctx, 'second')?.status).toBe('active');
    expect(result.missingCanonical).toBe(1);
  });

  it('reports a dry run without writing', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1, dryRun: true });

    expect(result.retired).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(ctx.patches).toEqual([]);
    expect(questionRows(ctx, 'legacy')?.status).toBe('active');
  });

  it('leaves legacy-shaped rows the snapshot does not own alone', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'owned', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
      questionDoc({ id: 'unowned', canonicalKey: UNOWNED_LEGACY_KEY }),
    ]);

    await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(questionRows(ctx, 'unowned')?.status).toBe('active');
  });

  it('leaves other locales alone', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy_fr', canonicalKey: FIRST_LEGACY, locale: 'fr' }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    const result = await runRetire(ctx, { offset: 0, batchSize: 1 });

    expect(result.missingLegacy).toBe(1);
    expect(questionRows(ctx, 'legacy_fr')?.status).toBe('active');
  });

  it('keeps the picture asset on the surviving canonical row', async () => {
    const ctx = questionsCtx([
      questionDoc({
        id: 'legacy',
        canonicalKey: LEGACY_QUESTION_KEY_PAIRS[PICTURE_INDEX]![0],
        promptImageKey: 'flags/tr.png',
      }),
      questionDoc({
        id: 'canonical',
        canonicalKey: PICTURE_CANONICAL_KEY,
        promptImageKey: 'flags/tr.png',
      }),
    ]);

    const result = await runRetire(ctx, { offset: PICTURE_INDEX, batchSize: 1 });

    expect(result.retired).toBe(1);
    expect(questionRows(ctx, 'canonical')).toMatchObject({
      status: 'active',
      promptImageKey: 'flags/tr.png',
    });
  });

  it('stops both copies of one question from reaching the playable pool', async () => {
    const rows = [
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'legacy_fr', canonicalKey: FIRST_LEGACY, locale: 'fr' }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ];
    const ctx = questionsCtx(rows);

    expect(playablePool(rows, ['en'])).toHaveLength(2);

    await runRetire(ctx, { offset: 0, batchSize: 1 });

    const after = playablePool(ctx.tables.questions as QuestionRow[], ['en']);
    expect(after).toHaveLength(1);
    expect(after[0]?.canonicalKey).toBe(FIRST_CANONICAL);
  });
});

describe('remapLegacyQuestionHistory', () => {
  async function historyWithReplacement(
    replacement: { status?: string; categoryId?: string; missing?: boolean }
  ) {
    const ctx = historyCtx([
      historyDoc({
        id: 'h1',
        deviceId: 'd1',
        canonicalKey: FIRST_LEGACY,
        categoryId: 'categories_1',
        questionId: 'legacy_question',
      }),
      historyDoc({ id: 'h2', deviceId: 'd2', canonicalKey: FIRST_CANONICAL, askedAt: 2 }),
      historyDoc({ id: 'h3', deviceId: 'd3', canonicalKey: 'unrelated', askedAt: 3 }),
    ]);
    if (!replacement.missing) {
      ctx.tables.questions = [
        questionDoc({
          id: 'canonical',
          canonicalKey: FIRST_CANONICAL,
          status: replacement.status,
          categoryId: replacement.categoryId,
        }),
      ];
    } else {
      ctx.tables.questions = [];
    }
    return ctx;
  }

  it('remaps a record once its replacement is active and in the same category', async () => {
    const ctx = await historyWithReplacement({});

    const result = await runRemap(ctx, { batchSize: 10 });

    expect(result).toMatchObject({
      remapped: 1,
      missingTarget: 0,
      inactiveTarget: 0,
      categoryMismatch: 0,
      unmappedLegacyKeys: 0,
      scanned: 3,
      isDone: true,
      cursor: null,
      dryRun: false,
    });
    expect(result.mapVersion).toBe(LEGACY_QUESTION_KEY_VERSION);
    expect(ctx.tables.device_question_history.map((row) => row.canonicalKey)).toEqual([
      FIRST_CANONICAL,
      FIRST_CANONICAL,
      'unrelated',
    ]);
  });

  it('leaves the record untouched when the replacement is missing', async () => {
    const ctx = await historyWithReplacement({ missing: true });

    const result = await runRemap(ctx, { batchSize: 10 });

    expect(result.missingTarget).toBe(1);
    expect(result.remapped).toBe(0);
    expect(ctx.patches).toEqual([]);
    expect(ctx.tables.device_question_history[0]).toMatchObject({
      canonicalKey: FIRST_LEGACY,
      categoryId: 'categories_1',
      questionId: 'legacy_question',
    });
  });

  it('leaves the record untouched when the replacement is not active', async () => {
    const ctx = await historyWithReplacement({ status: 'retired' });

    const result = await runRemap(ctx, { batchSize: 10 });

    expect(result.inactiveTarget).toBe(1);
    expect(result.remapped).toBe(0);
    expect(ctx.tables.device_question_history[0]?.canonicalKey).toBe(FIRST_LEGACY);
  });

  it('leaves the record untouched when the replacement sits in another category', async () => {
    const ctx = await historyWithReplacement({ categoryId: 'categories_2' });

    const result = await runRemap(ctx, { batchSize: 10 });

    expect(result.categoryMismatch).toBe(1);
    expect(result.remapped).toBe(0);
    expect(ctx.tables.device_question_history[0]?.canonicalKey).toBe(FIRST_LEGACY);
  });

  it('counts position keys the snapshot does not own without rewriting them', async () => {
    const ctx = historyCtx([
      historyDoc({ id: 'h1', deviceId: 'd1', canonicalKey: UNOWNED_LEGACY_KEY }),
    ]);

    const result = await runRemap(ctx, { batchSize: 10 });

    expect(result.unmappedLegacyKeys).toBe(1);
    expect(result.remapped).toBe(0);
    expect(ctx.patches).toEqual([]);
    expect(ctx.tables.device_question_history[0]?.canonicalKey).toBe(UNOWNED_LEGACY_KEY);
  });

  it('is idempotent', async () => {
    const ctx = await historyWithReplacement({});

    await runRemap(ctx, { batchSize: 10 });
    const second = await runRemap(ctx, { batchSize: 10 });

    expect(second.remapped).toBe(0);
    expect(second.isDone).toBe(true);
  });

  it('resumes from the cursor after an interruption without skipping or repeating', async () => {
    const ctx = await historyWithReplacement({});
    const pages: RemapResult[] = [];
    let cursor: string | undefined;

    for (let i = 0; i < 5; i += 1) {
      const page = await runRemap(ctx, { batchSize: 1, cursor });
      pages.push(page);
      if (page.cursor === null) break;
      cursor = page.cursor;
    }

    expect(pages.map((page) => page.remapped)).toEqual([1, 0, 0]);
    expect(pages.map((page) => page.isDone)).toEqual([false, false, true]);
    expect(pages.map((page) => page.scanned)).toEqual([1, 1, 1]);
    expect(ctx.tables.device_question_history.map((row) => row.canonicalKey)).toEqual([
      FIRST_CANONICAL,
      FIRST_CANONICAL,
      'unrelated',
    ]);
  });

  it('reports a dry run without writing', async () => {
    const ctx = await historyWithReplacement({});

    const result = await runRemap(ctx, { batchSize: 10, dryRun: true });

    expect(result.remapped).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(ctx.patches).toEqual([]);
    expect(ctx.tables.device_question_history[0]?.canonicalKey).toBe(FIRST_LEGACY);
  });
});

describe('device history still suppresses repeats when the migration skips', () => {
  it('keeps excluding a question whose retirement was skipped', async () => {
    const ctx = createConvexTestCtx({
      tables: {
        questions: [
          questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
          questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL, status: 'retired' }),
        ],
        device_question_history: [
          historyDoc({ id: 'h1', deviceId: 'd1', canonicalKey: FIRST_LEGACY }),
        ],
      },
    });

    const retired = await runRetire(ctx, { offset: 0, batchSize: 1 });
    const remapped = await runRemap(ctx, { batchSize: 10 });

    expect(retired.inactiveCanonical).toBe(1);
    expect(remapped.inactiveTarget).toBe(1);
    const asked = new Set(
      ctx.tables.device_question_history.map((row) => row.canonicalKey as string)
    );
    expect(asked).toEqual(new Set([FIRST_LEGACY]));

    const pool = playablePool(ctx.tables.questions as QuestionRow[], ['en']);
    expect(pool.map((question) => question.canonicalKey)).toEqual([FIRST_LEGACY]);
    expect(filterExcludingCanonicalKeys(pool, asked)).toEqual([]);
  });

  it('keeps excluding the question after a completed retirement and remap', async () => {
    const ctx = createConvexTestCtx({
      tables: {
        questions: [
          questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
          questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
        ],
        device_question_history: [
          historyDoc({ id: 'h1', deviceId: 'd1', canonicalKey: FIRST_LEGACY }),
        ],
      },
    });

    await runRetire(ctx, { offset: 0, batchSize: 1 });
    const remapped = await runRemap(ctx, { batchSize: 10 });

    expect(remapped).toMatchObject({ remapped: 1, missingTarget: 0, inactiveTarget: 0 });
    const asked = new Set(
      ctx.tables.device_question_history.map((row) => row.canonicalKey as string)
    );
    expect(asked).toEqual(new Set([FIRST_CANONICAL]));

    const pool = playablePool(ctx.tables.questions as QuestionRow[], ['en']);
    expect(pool.map((question) => question.canonicalKey)).toEqual([FIRST_CANONICAL]);
    expect(filterExcludingCanonicalKeys(pool, asked)).toEqual([]);
  });

  it('would repeat the question if history moved while the legacy row stayed active', () => {
    // Guards the reason the remap verifies its target: rewriting history to the canonical
    // key while the playable row is still the legacy one loses the suppression.
    const rows = [questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY })];
    const pool = playablePool(rows, ['en']);
    const askedAfterABadRemap = new Set([FIRST_CANONICAL]);

    expect(filterExcludingCanonicalKeys(pool, askedAfterABadRemap)).toHaveLength(1);
  });
});

describe('frozen map fencing', () => {
  it('retirement refuses a mismatched snapshot before reading or writing', async () => {
    const ctx = questionsCtx([
      questionDoc({ id: 'legacy', canonicalKey: FIRST_LEGACY }),
      questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL }),
    ]);

    await expect(
      retire(ctx, { expectedMapVersion: 'deadbeef1234', offset: 0, batchSize: 1 })
    ).rejects.toThrow(/frozen_question_key_map_mismatch/);

    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.patches).toEqual([]);
    expect(questionRows(ctx, 'legacy')?.status).toBe('active');
  });

  it('history remap refuses a mismatched snapshot before reading or writing', async () => {
    const ctx = createConvexTestCtx({
      tables: {
        questions: [questionDoc({ id: 'canonical', canonicalKey: FIRST_CANONICAL })],
        device_question_history: [
          historyDoc({ id: 'h1', deviceId: 'd1', canonicalKey: FIRST_LEGACY }),
        ],
      },
    });

    await expect(
      remap(ctx, { expectedMapVersion: 'deadbeef1234', batchSize: 10 })
    ).rejects.toThrow(/frozen_question_key_map_mismatch/);

    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.patches).toEqual([]);
    expect(ctx.tables.device_question_history[0]?.canonicalKey).toBe(FIRST_LEGACY);
  });

  it('names both the deployment and the caller snapshot in the refusal', async () => {
    const ctx = questionsCtx([]);

    await expect(
      retire(ctx, { expectedMapVersion: 'deadbeef1234', offset: 0, batchSize: 1 })
    ).rejects.toThrow(new RegExp(LEGACY_QUESTION_KEY_VERSION));
    await expect(
      remap(ctx, { expectedMapVersion: 'deadbeef1234', batchSize: 10 })
    ).rejects.toThrow(/deadbeef1234/);
  });
});

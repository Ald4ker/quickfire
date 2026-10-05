/**
 * Internal seed mutations. Call via dashboard or npx convex run.
 * Usage: npx convex run seed:seedCategories '[]'
 * For bulk import, use a script that reads the JSON and calls these.
 */

import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_TOKEN_PRODUCTS } from './lib/paymentCatalog';
import {
  LEGACY_QUESTION_KEY_PAIRS,
  LEGACY_QUESTION_KEY_VERSION,
  LEGACY_SEED_LOCALE,
} from './seed/legacyQuestionKeys';

export const seedCategories = internalMutation({
  args: {
    categories: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        themeGroup: v.optional(v.string()),
        artwork: v.optional(v.string()),
        enabled: v.boolean(),
        questionCount: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const cat of args.categories) {
      const existing = await ctx.db
        .query('categories')
        .withIndex('by_slug', (q) => q.eq('slug', cat.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert('categories', {
          slug: cat.slug,
          title: cat.title,
          themeGroup: cat.themeGroup,
          artwork: cat.artwork,
          enabled: cat.enabled,
          questionCount: cat.questionCount,
        });
      } else {
        await ctx.db.patch(existing._id, {
          title: cat.title,
          themeGroup: cat.themeGroup,
          artwork: cat.artwork,
          enabled: cat.enabled,
          questionCount: cat.questionCount,
        });
      }
    }
  },
});

export const seedCategoryTranslations = internalMutation({
  args: {
    translations: v.array(
      v.object({
        categorySlug: v.string(),
        locale: v.string(),
        title: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const translation of args.translations) {
      const category = await ctx.db
        .query('categories')
        .withIndex('by_slug', (i) => i.eq('slug', translation.categorySlug))
        .unique();

      if (!category) continue;

      const existing = await ctx.db
        .query('category_translations')
        .withIndex('by_category_locale', (q) =>
          q.eq('categoryId', category._id).eq('locale', translation.locale)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { title: translation.title });
        continue;
      }

      await ctx.db.insert('category_translations', {
        categoryId: category._id,
        locale: translation.locale,
        title: translation.title,
      });
    }
  },
});

export const seedQuestions = internalMutation({
  args: {
    questions: v.array(
      v.object({
        categorySlug: v.string(),
        canonicalKey: v.string(),
        prompt: v.string(),
        answer: v.string(),
        pointValue: v.number(),
        locale: v.string(),
        status: v.string(),
        promptImageKey: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const q of args.questions) {
      const category = await ctx.db
        .query('categories')
        .withIndex('by_slug', (i) => i.eq('slug', q.categorySlug))
        .unique();
      if (!category) {
        skipped += 1;
        continue;
      }

      const existing = await ctx.db
        .query('questions')
        .withIndex('by_canonical_locale', (i) =>
          i.eq('canonicalKey', q.canonicalKey).eq('locale', q.locale)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          categoryId: category._id,
          prompt: q.prompt,
          answer: q.answer,
          pointValue: q.pointValue,
          status: q.status,
          promptImageKey: q.promptImageKey,
        });
        updated += 1;
        continue;
      }

      await ctx.db.insert('questions', {
        categoryId: category._id,
        canonicalKey: q.canonicalKey,
        prompt: q.prompt,
        answer: q.answer,
        pointValue: q.pointValue,
        locale: q.locale,
        status: q.status,
        promptImageKey: q.promptImageKey,
      });
      inserted += 1;
    }

    return { inserted, updated, skipped };
  },
});

/**
 * Position keys are `<slug>:<points>:<index>`; canonical keys are `q<UserID>`.
 * Both handlers fail closed on anything that does not match its namespace.
 */
const LEGACY_KEY_SHAPE = /^[a-z0-9-]+:(100|200|300):\d+$/;
const CANONICAL_KEY_SHAPE = /^q\d+$/;

/** Built once per isolate from the frozen snapshot; nothing rebuilds it from live content. */
const CANONICAL_BY_LEGACY_KEY = new Map<string, string>(LEGACY_QUESTION_KEY_PAIRS);

/**
 * Fence the deployment before it touches data. The caller must name the frozen snapshot it
 * expects; a deployment running a different one refuses the call instead of rewriting rows
 * against the wrong map. Checked before any query or write.
 */
function assertFrozenMap(expectedMapVersion: string) {
  if (expectedMapVersion !== LEGACY_QUESTION_KEY_VERSION) {
    throw new Error(
      `frozen_question_key_map_mismatch: this deployment carries ${LEGACY_QUESTION_KEY_VERSION}, ` +
        `the caller expects ${expectedMapVersion}. Deploy the code for the snapshot you mean to migrate with.`
    );
  }
}

/**
 * Retire the position-keyed rows (`<slug>:<points>:<index>`) that the `q<UserID>` seed
 * replaced. Without this, a deployment seeded before the key change keeps both the old and
 * the new copy of every question active, and players see each question twice.
 *
 * The pairs come from the frozen snapshot generated at the transition
 * (convex/seed/legacyQuestionKeys.ts), never from current source data, so a later reorder,
 * rename or addition cannot move an old key onto a different question.
 *
 * Rows are patched to `retired`, never deleted, so every `_id` reference
 * (`device_question_history.questionId`, reports, score events) stays valid and the change
 * is undone by patching the status back.
 *
 * Fail closed. A legacy row is retired only when all of this holds:
 * - both keys match their own namespace (a corrupted snapshot retires nothing);
 * - the replacement row exists, is `active`, and sits in the same category;
 * - the legacy row itself is still `active`.
 * Anything else is counted and left untouched, so a question is never hidden without a live
 * replacement and unrelated content is never swept up. `missingLegacy` and `alreadyRetired`
 * are the expected states of a fresh deployment and a repeated run; the other counters are
 * reported as failures by the push script.
 *
 * Bounded: one call walks `batchSize` pairs and writes at most that many rows. Each call is
 * atomic on its own; the whole migration is not, so both copies can be playable until the
 * retirement catches up.
 *
 * `expectedMapVersion` is required and checked at entry, so a mismatched deployment rejects
 * the call before reading or writing anything.
 */
export const retireLegacyQuestionKeys = internalMutation({
  args: {
    expectedMapVersion: v.string(),
    offset: v.number(),
    batchSize: v.number(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertFrozenMap(args.expectedMapVersion);
    const start = Math.max(0, Math.floor(args.offset));
    const end = Math.min(
      LEGACY_QUESTION_KEY_PAIRS.length,
      start + Math.max(0, Math.floor(args.batchSize))
    );

    let retired = 0;
    let alreadyRetired = 0;
    let missingLegacy = 0;
    let missingCanonical = 0;
    let inactiveCanonical = 0;
    let categoryMismatch = 0;
    let invalidPair = 0;

    for (let index = start; index < end; index += 1) {
      const pair = LEGACY_QUESTION_KEY_PAIRS[index]!;
      const legacyKey = pair[0];
      const canonicalKey = pair[1];
      if (!LEGACY_KEY_SHAPE.test(legacyKey) || !CANONICAL_KEY_SHAPE.test(canonicalKey)) {
        invalidPair += 1;
        continue;
      }

      const legacy = await ctx.db
        .query('questions')
        .withIndex('by_canonical_locale', (q) =>
          q.eq('canonicalKey', legacyKey).eq('locale', LEGACY_SEED_LOCALE)
        )
        .unique();
      if (!legacy) {
        missingLegacy += 1;
        continue;
      }
      if (legacy.status !== 'active') {
        alreadyRetired += 1;
        continue;
      }

      const canonical = await ctx.db
        .query('questions')
        .withIndex('by_canonical_locale', (q) =>
          q.eq('canonicalKey', canonicalKey).eq('locale', LEGACY_SEED_LOCALE)
        )
        .unique();
      if (!canonical) {
        missingCanonical += 1;
        continue;
      }
      if (canonical.status !== 'active') {
        inactiveCanonical += 1;
        continue;
      }
      if (canonical.categoryId !== legacy.categoryId) {
        categoryMismatch += 1;
        continue;
      }

      if (!args.dryRun) {
        await ctx.db.patch(legacy._id, { status: 'retired' });
      }
      retired += 1;
    }

    return {
      retired,
      alreadyRetired,
      missingLegacy,
      missingCanonical,
      inactiveCanonical,
      categoryMismatch,
      invalidPair,
      offset: start,
      processed: end - start,
      total: LEGACY_QUESTION_KEY_PAIRS.length,
      nextOffset: end < LEGACY_QUESTION_KEY_PAIRS.length ? end : null,
      mapVersion: LEGACY_QUESTION_KEY_VERSION,
      dryRun: Boolean(args.dryRun),
    };
  },
});

/**
 * Rewrite `device_question_history.canonicalKey` from a retired position key to its
 * `q<UserID>` key, so a question a player has already been asked is not offered again under
 * its new identity. Without this the only effect of the key change is that history written
 * under the old keys stops filtering, which costs players one round of repeats.
 *
 * The table is walked with Convex's opaque pagination, so the caller can stop between calls
 * and resume from `cursor`: each call reads at most `batchSize` rows. `canonicalKey` is not
 * the pagination key, so patching mid-walk cannot skip or double-visit anything, and a
 * repeated run is a no-op because remapped rows no longer match the snapshot.
 *
 * A record is rewritten only when its mapped replacement exists, is `active`, and sits in
 * the same category as the history record. Skipped records keep their canonicalKey,
 * questionId and categoryId exactly as they were (`questionId` keeps pointing at the
 * retired row, which is deliberately still present), and the skip is counted so the caller
 * can report it instead of claiming success.
 *
 * `expectedMapVersion` is required and checked at entry, so a mismatched deployment rejects
 * the call before reading or writing anything.
 */
export const remapLegacyQuestionHistory = internalMutation({
  args: {
    expectedMapVersion: v.string(),
    dryRun: v.optional(v.boolean()),
    batchSize: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFrozenMap(args.expectedMapVersion);

    const page = await ctx.db.query('device_question_history').paginate({
      cursor: args.cursor ?? null,
      numItems: Math.max(1, Math.floor(args.batchSize)),
    });

    let remapped = 0;
    let missingTarget = 0;
    let inactiveTarget = 0;
    let categoryMismatch = 0;
    let unmappedLegacyKeys = 0;

    for (const row of page.page) {
      const canonicalKey = CANONICAL_BY_LEGACY_KEY.get(row.canonicalKey);
      if (!canonicalKey) {
        // History written before the frozen snapshot cannot be mapped; report, never guess.
        if (LEGACY_KEY_SHAPE.test(row.canonicalKey)) unmappedLegacyKeys += 1;
        continue;
      }

      const target = await ctx.db
        .query('questions')
        .withIndex('by_canonical_locale', (q) =>
          q.eq('canonicalKey', canonicalKey).eq('locale', LEGACY_SEED_LOCALE)
        )
        .unique();
      if (!target) {
        missingTarget += 1;
        continue;
      }
      if (target.status !== 'active') {
        inactiveTarget += 1;
        continue;
      }
      if (target.categoryId !== row.categoryId) {
        categoryMismatch += 1;
        continue;
      }

      if (!args.dryRun) {
        await ctx.db.patch(row._id, { canonicalKey });
      }
      remapped += 1;
    }

    return {
      remapped,
      missingTarget,
      inactiveTarget,
      categoryMismatch,
      unmappedLegacyKeys,
      scanned: page.page.length,
      isDone: page.isDone,
      cursor: page.isDone ? null : page.continueCursor,
      mapVersion: LEGACY_QUESTION_KEY_VERSION,
      dryRun: Boolean(args.dryRun),
    };
  },
});

/** Disable categories whose slugs are not in the current seed import. */
export const retireCategoriesNotInSeed = internalMutation({
  args: {
    activeSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const active = new Set(args.activeSlugs);
    const categories = await ctx.db.query('categories').collect();
    let retired = 0;

    for (const category of categories) {
      if (active.has(category.slug) || !category.enabled) {
        continue;
      }

      await ctx.db.patch(category._id, { enabled: false });
      retired += 1;
    }

    return { retired };
  },
});

export const seedTokenProducts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const product of DEFAULT_TOKEN_PRODUCTS) {
      const existing = await ctx.db
        .query('token_products')
        .withIndex('by_product_key', (q) => q.eq('productKey', product.productKey))
        .unique();

      if (existing) {
        continue;
      }

      await ctx.db.insert('token_products', {
        ...product,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * One-shot: set every wallet balance to a fixed amount.
 * Usage: npx convex run seed:resetAllWalletBalances '{"balance":120}'
 */
export const resetAllWalletBalances = internalMutation({
  args: {
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.balance) || args.balance < 0) {
      throw new Error('invalid_balance');
    }

    const wallets = await ctx.db.query('wallets').collect();
    const now = Date.now();
    let updated = 0;

    for (const wallet of wallets) {
      const delta = args.balance - wallet.balance;
      if (delta === 0) {
        continue;
      }

      await ctx.db.insert('wallet_transactions', {
        walletId: wallet._id,
        type: 'admin_adjustment',
        amount: delta,
        createdAt: now,
        status: 'posted',
        source: 'admin',
        metadata: {
          reason: `bulk_reset_to_${args.balance}`,
        },
      });
      await ctx.db.patch(wallet._id, { balance: args.balance });
      updated += 1;
    }

    return { total: wallets.length, updated, balance: args.balance };
  },
});

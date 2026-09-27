import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { requireUser } from './lib/auth';
import { buildCanonicalPool, selectUnaskedWithFallback } from './lib/contentRules';

/** Unique locales to read, in priority order, always ending with English. */
function normalizeLocaleChain(localeChain: readonly string[] | undefined): string[] {
  const chain: string[] = [];
  for (const locale of localeChain ?? []) {
    if (locale && !chain.includes(locale)) chain.push(locale);
  }
  if (!chain.includes('en')) chain.push('en');
  return chain;
}

/**
 * Active question rows for one category, only in the locales the caller can use.
 * Reads through `by_category_locale_status`, so 17 seeded locales cost nothing
 * to a player who plays in one or two of them.
 */
async function collectCategoryRows(
  ctx: { db: { query: (table: 'questions') => any } },
  categoryId: Doc<'categories'>['_id'],
  localeChain: readonly string[]
): Promise<Doc<'questions'>[]> {
  const rows: Doc<'questions'>[] = [];
  for (const locale of localeChain) {
    const localeRows: Doc<'questions'>[] = await ctx.db
      .query('questions')
      .withIndex('by_category_locale_status', (q: any) =>
        q.eq('categoryId', categoryId).eq('locale', locale).eq('status', 'active')
      )
      .collect();
    rows.push(...localeRows);
  }
  return rows;
}

export const listPlayableCategories = query({
  args: {
    localeChain: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const localeChain = normalizeLocaleChain(args.localeChain);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .collect();

    return await Promise.all(
      categories.map(async (category) => {
        // `questionCount` is written at seed time (unique English keys). Count English rows
        // only for categories seeded before the field existed.
        let questionCount = category.questionCount;
        if (questionCount === undefined) {
          const englishRows = await ctx.db
            .query('questions')
            .withIndex('by_category_locale_status', (q) =>
              q.eq('categoryId', category._id).eq('locale', 'en').eq('status', 'active')
            )
            .collect();
          questionCount = new Set(englishRows.map((question) => question.canonicalKey)).size;
        }

        for (const locale of localeChain) {
          const translation = await ctx.db
            .query('category_translations')
            .withIndex('by_category_locale', (q) =>
              q.eq('categoryId', category._id).eq('locale', locale)
            )
            .unique();

          if (translation) {
            return {
              ...category,
              title: translation.title,
              questionCount,
              resolvedLocale: locale,
              fellBackToEnglish: locale === 'en',
            };
          }
        }

        return {
          ...category,
          questionCount,
          resolvedLocale: 'en',
          fellBackToEnglish: true,
        };
      })
    );
  },
});

export const getModeQuestionPool = query({
  args: {
    mode: v.string(),
    localeChain: v.optional(v.array(v.string())),
    categoryIds: v.optional(v.array(v.id('categories'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 36;
    const localeChain = normalizeLocaleChain(args.localeChain);
    const merged = new Map<string, any>();

    const categoryIds =
      args.categoryIds && args.categoryIds.length > 0
        ? args.categoryIds
        : (
            await ctx.db
              .query('categories')
              .withIndex('by_enabled', (q) => q.eq('enabled', true))
              .collect()
          ).map((category) => category._id);
    const perCategory = Math.ceil(limit / Math.max(categoryIds.length, 1));

    for (const catId of categoryIds) {
      const categoryQuestions = await collectCategoryRows(ctx, catId, localeChain);

      const byCanonical = new Map<string, typeof categoryQuestions>();
      for (const question of categoryQuestions) {
        const bucket = byCanonical.get(question.canonicalKey) ?? [];
        bucket.push(question);
        byCanonical.set(question.canonicalKey, bucket);
      }

      let takenFromCategory = 0;
      for (const variants of byCanonical.values()) {
        const localized = pickLocalizedQuestion(variants, localeChain);
        if (!localized || merged.has(localized.canonicalKey)) {
          continue;
        }
        merged.set(localized.canonicalKey, localized);
        takenFromCategory += 1;
        if (takenFromCategory >= perCategory || merged.size >= limit) {
          break;
        }
      }
      if (merged.size >= limit) {
        break;
      }
    }

    return Array.from(merged.values()).slice(0, limit);
  },
});

function pickLocalizedQuestion<T extends { canonicalKey: string; locale: string }>(
  variants: T[],
  localeChain: string[]
) {
  for (const locale of localeChain) {
    const question = variants.find((variant) => variant.locale === locale);
    if (question) {
      return {
        ...question,
        resolvedFromFallback: locale !== localeChain[0],
      };
    }
  }

  return undefined;
}

export const getUnaskedQuestions = query({
  args: {
    deviceId: v.string(),
    mode: v.string(),
    categoryIds: v.array(v.id('categories')),
    localeChain: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    seed: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const limit = args.limit ?? 36;
    const localeChain = normalizeLocaleChain(args.localeChain);

    const history = await ctx.db
      .query('device_question_history')
      .withIndex('by_device', (q) => q.eq('deviceId', args.deviceId))
      .collect();
    const asked = new Set(history.map((h) => h.canonicalKey));

    const rows: Doc<'questions'>[] = [];
    for (const catId of args.categoryIds) {
      rows.push(...(await collectCategoryRows(ctx, catId, localeChain)));
    }

    const pool = buildCanonicalPool(rows, localeChain);
    const { selection } = selectUnaskedWithFallback(pool, asked, limit, args.seed);
    void args.mode;
    return selection;
  },
});

export const recordAskedQuestions = mutation({
  args: {
    deviceId: v.string(),
    sessionId: v.optional(v.string()),
    entries: v.array(
      v.object({
        canonicalKey: v.string(),
        categoryId: v.id('categories'),
        questionId: v.optional(v.id('questions')),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const now = Date.now();
    for (const e of args.entries) {
      await ctx.db.insert('device_question_history', {
        deviceId: args.deviceId,
        canonicalKey: e.canonicalKey,
        categoryId: e.categoryId,
        questionId: e.questionId,
        sessionId: args.sessionId,
        askedAt: now,
      });
    }
  },
});

const REPORT_REASONS = new Set([
  'factually_incorrect',
  'ambiguous',
  'unclear',
  'unfair',
  'mismatch',
  'outdated',
  'broken',
  'inappropriate',
  'bad_unfun',
  'other',
]);

const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MAX_IN_WINDOW = 8;

export const submitQuestionReport = mutation({
  args: {
    questionId: v.string(),
    canonicalKey: v.string(),
    categoryId: v.optional(v.string()),
    categoryName: v.optional(v.string()),
    locale: v.optional(v.string()),
    prompt: v.string(),
    answer: v.string(),
    reasons: v.array(v.string()),
    problemLocation: v.union(
      v.literal('question'),
      v.literal('answer'),
      v.literal('both')
    ),
    otherText: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  returns: v.id('question_reports'),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const reasons = [...new Set(args.reasons)].filter((reason) => REPORT_REASONS.has(reason));
    if (reasons.length === 0) {
      throw new Error('Select at least one issue');
    }
    const otherText = args.otherText?.trim();
    if (reasons.includes('other') && !otherText) {
      throw new Error('Describe the issue');
    }

    const now = Date.now();
    const recent = await ctx.db
      .query('question_reports')
      .withIndex('by_user_and_created', (q) =>
        q.eq('userId', user._id).gte('createdAt', now - REPORT_WINDOW_MS)
      )
      .take(REPORT_MAX_IN_WINDOW);
    if (recent.length >= REPORT_MAX_IN_WINDOW) {
      throw new Error('Too many reports. Try again later.');
    }

    return await ctx.db.insert('question_reports', {
      userId: user._id,
      questionId: args.questionId.slice(0, 200),
      canonicalKey: args.canonicalKey.slice(0, 200),
      categoryId: args.categoryId?.slice(0, 200),
      categoryName: args.categoryName?.slice(0, 200),
      locale: args.locale?.slice(0, 32),
      prompt: args.prompt.slice(0, 4000),
      answer: args.answer.slice(0, 4000),
      reasons,
      problemLocation: args.problemLocation,
      otherText: reasons.includes('other') ? otherText?.slice(0, 500) : undefined,
      sessionId: args.sessionId?.slice(0, 200),
      createdAt: now,
    });
  },
});

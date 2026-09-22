/**
 * Internal seed mutations. Call via dashboard or npx convex run.
 * Usage: npx convex run seed:seedCategories '[]'
 * For bulk import, use a script that reads the JSON and calls these.
 */

import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { DEFAULT_TOKEN_PRODUCTS } from './lib/paymentCatalog';

export const seedCategories = internalMutation({
  args: {
    categories: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        themeGroup: v.optional(v.string()),
        artwork: v.optional(v.string()),
        enabled: v.boolean(),
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
        });
      } else {
        await ctx.db.patch(existing._id, {
          title: cat.title,
          themeGroup: cat.themeGroup,
          artwork: cat.artwork,
          enabled: cat.enabled,
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

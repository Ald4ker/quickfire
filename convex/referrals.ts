import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { requireUser } from './lib/auth';
import { ensureWalletDoc } from './lib/ensureWallet';
import { ensureCanonicalPurchaserAccountForUser } from './lib/purchaserAccounts';
import {
  REFERRAL_NEW_ACCOUNT_MAX_GAMES,
  REFERRAL_REWARD_TOKENS,
  buildReferralCodeFromSeed,
  evaluateReferralApply,
  normalizeReferralCode,
} from './lib/referralRules';

/** Classic sessions + rapid-fire runs; stop once past the new-account cap. */
async function countUserGames(ctx: MutationCtx, userId: Id<'users'>): Promise<number> {
  const need = REFERRAL_NEW_ACCOUNT_MAX_GAMES + 1;
  const sessions = await ctx.db
    .query('game_sessions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(need);
  if (sessions.length >= need) {
    return sessions.length;
  }

  const rapid = await ctx.db
    .query('rapid_fire_runs')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(need - sessions.length);
  return sessions.length + rapid.length;
}

async function allocateUniqueReferralCode(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<string> {
  const idHash = Array.from(String(userId)).reduce(
    (acc, ch) => (acc + ch.charCodeAt(0)) >>> 0,
    0
  );

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = buildReferralCodeFromSeed([idHash, Date.now(), attempt, Math.floor(Math.random() * 1e9)]);
    const clash = await ctx.db
      .query('users')
      .withIndex('by_referral_code', (q) => q.eq('referralCode', code))
      .unique();
    if (!clash) {
      return code;
    }
  }

  // Extremely unlikely fallback: longer code from user id chars.
  return normalizeReferralCode(`BF${String(userId).slice(-10)}`).slice(0, 12);
}

export const getMyReferral = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const successfulReferralCount = user.successfulReferralCount ?? 0;

    // Invitees who applied this user's code (indexed on users.referredByUserId).
    const invitees = await ctx.db
      .query('users')
      .withIndex('by_referred_by', (q) => q.eq('referredByUserId', user._id))
      .collect();

    invitees.sort(
      (a, b) => (b.referralAppliedAt ?? 0) - (a.referralAppliedAt ?? 0)
    );

    return {
      code: user.referralCode ?? null,
      alreadyRedeemed: user.referredByUserId != null,
      referredByUserId: user.referredByUserId ?? null,
      referralAppliedAt: user.referralAppliedAt ?? null,
      rewardTokens: REFERRAL_REWARD_TOKENS,
      successfulReferralCount,
      // Prefer live invitee rows; fall back to denormalized counter if count lags.
      referrals: invitees.map((invitee) => ({
        userId: invitee._id,
        appliedAt: invitee.referralAppliedAt ?? null,
        name: invitee.name ?? null,
      })),
    };
  },
});

/** Ensure the signed-in user has a unique referral code (lazy mint). */
export const ensureMyCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.referralCode) {
      return { code: user.referralCode };
    }

    const code = await allocateUniqueReferralCode(ctx, user._id);
    await ctx.db.patch(user._id, { referralCode: code });
    return { code };
  },
});

/**
 * Apply someone else's referral code.
 * Both parties get REFERRAL_REWARD_TOKENS when the invitee is still a new account
 * (fewer than 3 classic/rapid-fire games played).
 */
export const applyCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const normalized = normalizeReferralCode(args.code);

    const inviter = normalized
      ? await ctx.db
          .query('users')
          .withIndex('by_referral_code', (q) => q.eq('referralCode', normalized))
          .unique()
      : null;

    const gamesPlayed = await countUserGames(ctx, user._id);
    const check = evaluateReferralApply({
      normalizedCode: normalized,
      inviterFound: inviter != null,
      isSelf: inviter?._id === user._id,
      alreadyRedeemed: user.referredByUserId != null,
      gamesPlayed,
    });

    if (!check.ok) {
      return { success: false as const, error: check.reason };
    }

    if (!inviter) {
      return { success: false as const, error: 'invalid_code' as const };
    }

    const inviteePurchaser = await ensureCanonicalPurchaserAccountForUser(ctx, user);
    if (!inviteePurchaser) {
      throw new Error('Purchaser account creation failed');
    }
    const inviteeWallet = await ensureWalletDoc(ctx, inviteePurchaser.appUserId, user._id);

    const inviterPurchaser = await ensureCanonicalPurchaserAccountForUser(ctx, inviter);
    if (!inviterPurchaser) {
      throw new Error('Inviter purchaser account creation failed');
    }
    const inviterWallet = await ensureWalletDoc(ctx, inviterPurchaser.appUserId, inviter._id);

    const inviteeKey = `referral_invitee:${user._id}`;
    const inviterKey = `referral_inviter:${inviter._id}:${user._id}`;

    const existingInviteeTx = await ctx.db
      .query('wallet_transactions')
      .withIndex('by_wallet_idempotency', (q) =>
        q.eq('walletId', inviteeWallet._id).eq('idempotencyKey', inviteeKey)
      )
      .unique();

    if (existingInviteeTx) {
      return {
        success: true as const,
        tokensGranted: REFERRAL_REWARD_TOKENS,
        duplicate: true as const,
      };
    }

    const now = Date.now();
    const reward = REFERRAL_REWARD_TOKENS;

    await ctx.db.insert('wallet_transactions', {
      walletId: inviteeWallet._id,
      type: 'referral_invitee_grant',
      amount: reward,
      createdAt: now,
      status: 'posted',
      source: 'referral',
      idempotencyKey: inviteeKey,
      metadata: {
        inviterUserId: inviter._id,
        code: normalized,
      },
    });
    await ctx.db.patch(inviteeWallet._id, { balance: inviteeWallet.balance + reward });

    const existingInviterTx = await ctx.db
      .query('wallet_transactions')
      .withIndex('by_wallet_idempotency', (q) =>
        q.eq('walletId', inviterWallet._id).eq('idempotencyKey', inviterKey)
      )
      .unique();

    if (!existingInviterTx) {
      await ctx.db.insert('wallet_transactions', {
        walletId: inviterWallet._id,
        type: 'referral_inviter_grant',
        amount: reward,
        createdAt: now,
        status: 'posted',
        source: 'referral',
        idempotencyKey: inviterKey,
        metadata: {
          inviteeUserId: user._id,
          code: normalized,
        },
      });
      await ctx.db.patch(inviterWallet._id, { balance: inviterWallet.balance + reward });
      await ctx.db.patch(inviter._id, {
        successfulReferralCount: (inviter.successfulReferralCount ?? 0) + 1,
      });
    }

    await ctx.db.patch(user._id, {
      referredByUserId: inviter._id,
      referralAppliedAt: now,
    });

    return {
      success: true as const,
      tokensGranted: reward,
      duplicate: false as const,
    };
  },
});

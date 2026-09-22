import { describe, expect, it } from '@jest/globals';
import { applyCode, ensureMyCode } from '@/convex/referrals';
import { getConvexHandler } from '../helpers/convexHandler';
import {
  createConvexTestCtx,
  purchaserAccountDoc,
  userDoc,
  walletDoc,
} from '../helpers/convexTestCtx';

const ensureHandler = getConvexHandler<
  ReturnType<typeof createConvexTestCtx>,
  Record<string, never>,
  { code: string }
>(ensureMyCode);

const applyHandler = getConvexHandler<
  ReturnType<typeof createConvexTestCtx>,
  { code: string },
  { success: boolean; error?: string; tokensGranted?: number; duplicate?: boolean }
>(applyCode);

function twoUserCtx(opts?: {
  inviteeGamesPlayed?: number;
  alreadyRedeemed?: boolean;
}) {
  const inviter = userDoc({
    id: 'users_inviter',
    clerkId: 'clerk_inviter',
    email: 'inviter@example.com',
    canonicalPurchaserAccountId: 'purchaser_inviter',
  });
  inviter.referralCode = 'INVITE01';

  const invitee = userDoc({
    id: 'users_invitee',
    clerkId: 'clerk_invitee',
    email: 'invitee@example.com',
    canonicalPurchaserAccountId: 'purchaser_invitee',
  });
  if (opts?.alreadyRedeemed) {
    invitee.referredByUserId = 'users_other';
    invitee.referralAppliedAt = Date.now();
  }

  const inviterPurchaser = purchaserAccountDoc({
    appUserId: 'purchaser_inviter',
    linkedUserId: 'users_inviter',
  });
  const inviteePurchaser = purchaserAccountDoc({
    appUserId: 'purchaser_invitee',
    linkedUserId: 'users_invitee',
  });

  const inviterWallet = walletDoc({
    id: 'wallet_inviter',
    purchaserAccountId: 'purchaser_inviter',
    userId: 'users_inviter',
    balance: 5,
  });
  const inviteeWallet = walletDoc({
    id: 'wallet_invitee',
    purchaserAccountId: 'purchaser_invitee',
    userId: 'users_invitee',
    balance: 3,
  });

  const gamesPlayed = opts?.inviteeGamesPlayed ?? 0;
  const gameSessions = Array.from({ length: gamesPlayed }, (_, index) => ({
    _id: `session_${index + 1}`,
    userId: 'users_invitee',
    mode: 'classic',
    configSnapshot: {},
    seed: `s${index + 1}`,
    startedAt: Date.now() - index,
  }));

  return createConvexTestCtx({
    identity: { subject: 'clerk_invitee', email: 'invitee@example.com' },
    tables: {
      users: [inviter, invitee],
      purchaser_accounts: [inviterPurchaser, inviteePurchaser],
      wallets: [inviterWallet, inviteeWallet],
      wallet_transactions: [],
      game_sessions: gameSessions,
      rapid_fire_runs: [],
    },
  });
}

describe('referrals.ensureMyCode', () => {
  it('mints a code when missing', async () => {
    const user = userDoc({
      id: 'users_1',
      clerkId: 'clerk_1',
      email: 'a@example.com',
    });
    const ctx = createConvexTestCtx({
      identity: { subject: 'clerk_1', email: 'a@example.com' },
      tables: { users: [user] },
    });

    const result = await ensureHandler(ctx, {});
    expect(result.code).toMatch(/^[A-Z0-9]{6,12}$/);
    expect(ctx.patches.some((p) => p.id === 'users_1' && p.patch.referralCode === result.code)).toBe(
      true
    );
  });
});

describe('referrals.applyCode', () => {
  it('grants 10 tokens to both parties for a new account', async () => {
    const ctx = twoUserCtx();
    const result = await applyHandler(ctx, { code: 'invite01' });
    expect(result).toMatchObject({ success: true, tokensGranted: 10, duplicate: false });

    const inviteeWallet = ctx.tables.wallets.find((w) => w._id === 'wallet_invitee');
    const inviterWallet = ctx.tables.wallets.find((w) => w._id === 'wallet_inviter');
    expect(inviteeWallet?.balance).toBe(13);
    expect(inviterWallet?.balance).toBe(15);

    const invitee = ctx.tables.users.find((u) => u._id === 'users_invitee');
    const inviter = ctx.tables.users.find((u) => u._id === 'users_inviter');
    expect(invitee?.referredByUserId).toBe('users_inviter');
    expect(typeof invitee?.referralAppliedAt).toBe('number');
    expect(inviter?.successfulReferralCount).toBe(1);

    const txTypes = ctx.inserts
      .filter((i) => i.table === 'wallet_transactions')
      .map((i) => i.doc.type);
    expect(txTypes).toEqual(
      expect.arrayContaining(['referral_invitee_grant', 'referral_inviter_grant'])
    );
  });

  it('allows accounts with fewer than 3 games', async () => {
    const ctx = twoUserCtx({ inviteeGamesPlayed: 2 });
    await expect(applyHandler(ctx, { code: 'INVITE01' })).resolves.toMatchObject({
      success: true,
      tokensGranted: 10,
    });
  });

  it('rejects accounts with 3+ games as not_new_account', async () => {
    const ctx = twoUserCtx({ inviteeGamesPlayed: 3 });
    await expect(applyHandler(ctx, { code: 'INVITE01' })).resolves.toEqual({
      success: false,
      error: 'not_new_account',
    });
    expect(ctx.inserts.filter((i) => i.table === 'wallet_transactions')).toEqual([]);
  });

  it('rejects already-redeemed accounts', async () => {
    const ctx = twoUserCtx({ alreadyRedeemed: true });
    await expect(applyHandler(ctx, { code: 'INVITE01' })).resolves.toEqual({
      success: false,
      error: 'already_redeemed',
    });
  });

  it('rejects self referral', async () => {
    const ctx = twoUserCtx();
    // Sign in as inviter and try own code.
    ctx.setIdentity({ subject: 'clerk_inviter', email: 'inviter@example.com' });
    await expect(applyHandler(ctx, { code: 'INVITE01' })).resolves.toEqual({
      success: false,
      error: 'self_referral',
    });
  });

  it('rejects unknown codes', async () => {
    const ctx = twoUserCtx();
    await expect(applyHandler(ctx, { code: 'NOPECODE' })).resolves.toEqual({
      success: false,
      error: 'invalid_code',
    });
  });
});

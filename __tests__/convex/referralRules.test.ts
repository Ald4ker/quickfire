import { describe, expect, it } from '@jest/globals';
import {
  REFERRAL_REWARD_TOKENS,
  buildReferralCodeFromSeed,
  evaluateReferralApply,
  isReferralNewAccount,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from '@/convex/lib/referralRules';

describe('referralRules', () => {
  it('normalizes codes to uppercase alphanumerics', () => {
    expect(normalizeReferralCode('  ab-cd 12 ')).toBe('ABCD12');
  });

  it('builds a stable 8-char code from a seed', () => {
    const a = buildReferralCodeFromSeed([1, 2, 3]);
    const b = buildReferralCodeFromSeed([1, 2, 3]);
    expect(a).toHaveLength(8);
    expect(a).toBe(b);
    expect(isValidReferralCodeFormat(a)).toBe(true);
  });

  it('rewards 10 tokens', () => {
    expect(REFERRAL_REWARD_TOKENS).toBe(10);
  });

  it('treats 0–2 games as new and 3+ as no longer new', () => {
    expect(isReferralNewAccount(0)).toBe(true);
    expect(isReferralNewAccount(1)).toBe(true);
    expect(isReferralNewAccount(2)).toBe(true);
    expect(isReferralNewAccount(3)).toBe(false);
    expect(isReferralNewAccount(10)).toBe(false);
  });

  it('rejects empty, self, already redeemed, and accounts with 3+ games', () => {
    expect(
      evaluateReferralApply({
        normalizedCode: '',
        inviterFound: false,
        isSelf: false,
        alreadyRedeemed: false,
        gamesPlayed: 0,
      })
    ).toEqual({ ok: false, reason: 'empty_code' });

    expect(
      evaluateReferralApply({
        normalizedCode: 'ABCDEFGH',
        inviterFound: true,
        isSelf: true,
        alreadyRedeemed: false,
        gamesPlayed: 0,
      })
    ).toEqual({ ok: false, reason: 'self_referral' });

    expect(
      evaluateReferralApply({
        normalizedCode: 'ABCDEFGH',
        inviterFound: true,
        isSelf: false,
        alreadyRedeemed: true,
        gamesPlayed: 0,
      })
    ).toEqual({ ok: false, reason: 'already_redeemed' });

    expect(
      evaluateReferralApply({
        normalizedCode: 'ABCDEFGH',
        inviterFound: true,
        isSelf: false,
        alreadyRedeemed: false,
        gamesPlayed: 3,
      })
    ).toEqual({ ok: false, reason: 'not_new_account' });
  });

  it('accepts a valid new-account apply with fewer than 3 games', () => {
    expect(
      evaluateReferralApply({
        normalizedCode: 'ABCDEFGH',
        inviterFound: true,
        isSelf: false,
        alreadyRedeemed: false,
        gamesPlayed: 2,
      })
    ).toEqual({ ok: true });
  });
});

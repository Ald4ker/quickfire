/**
 * Pure referral (Give one, get one) rules for tests and server validation.
 */

export const REFERRAL_REWARD_TOKENS = 10;

/** Invitees stay "new" through 0–2 games; 3+ games blocks redemption. */
export const REFERRAL_NEW_ACCOUNT_MAX_GAMES = 2;

/** Ambiguous chars dropped so codes are easy to read aloud / type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidReferralCodeFormat(code: string): boolean {
  return code.length >= 6 && code.length <= 12 && /^[A-Z0-9]+$/.test(code);
}

/** Build an 8-char code from a numeric seed stream (Convex-safe, no crypto dep). */
export function buildReferralCodeFromSeed(seedParts: number[]): string {
  let n = 0;
  for (const part of seedParts) {
    n = (n * 31 + (part >>> 0)) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
  }
  return out;
}

export function isReferralNewAccount(gamesPlayed: number): boolean {
  return gamesPlayed <= REFERRAL_NEW_ACCOUNT_MAX_GAMES;
}

export type ReferralApplyFailureReason =
  | 'empty_code'
  | 'invalid_code'
  | 'self_referral'
  | 'already_redeemed'
  | 'not_new_account';

export type ReferralApplyCheck =
  | { ok: true }
  | { ok: false; reason: ReferralApplyFailureReason };

export function evaluateReferralApply(input: {
  normalizedCode: string;
  inviterFound: boolean;
  isSelf: boolean;
  alreadyRedeemed: boolean;
  gamesPlayed: number;
}): ReferralApplyCheck {
  if (!input.normalizedCode) {
    return { ok: false, reason: 'empty_code' };
  }
  if (!isValidReferralCodeFormat(input.normalizedCode) || !input.inviterFound) {
    return { ok: false, reason: 'invalid_code' };
  }
  if (input.isSelf) {
    return { ok: false, reason: 'self_referral' };
  }
  if (input.alreadyRedeemed) {
    return { ok: false, reason: 'already_redeemed' };
  }
  if (!isReferralNewAccount(input.gamesPlayed)) {
    return { ok: false, reason: 'not_new_account' };
  }
  return { ok: true };
}

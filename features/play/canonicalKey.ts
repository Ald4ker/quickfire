/**
 * Stable question identity shared by the app bundle, the seed scripts and Convex.
 *
 * Every question in the source spreadsheet has a permanent `UserID`. The canonical key is
 * `q<UserID>` so the same question keeps the same key in every locale, across re-imports,
 * and after duplicates are removed. Rows without a UserID (legacy picture-topic assets)
 * fall back to the old position-based key so nothing breaks while they are migrated.
 */

export const USER_ID_KEY_PREFIX = 'q';

export function canonicalKeyForUserId(userId: string | number): string {
  return `${USER_ID_KEY_PREFIX}${String(userId).trim()}`;
}

export function legacyCanonicalKey(slug: string, pointValue: number, index: number): string {
  return `${slug}:${pointValue}:${index}`;
}

export function questionCanonicalKey(
  question: { userId?: string | number | null },
  slug: string,
  pointValue: number,
  index: number
): string {
  const userId = question.userId;
  if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
    return canonicalKeyForUserId(userId);
  }
  return legacyCanonicalKey(slug, pointValue, index);
}

export function isUserIdCanonicalKey(key: string): boolean {
  return /^q\d+$/.test(key);
}

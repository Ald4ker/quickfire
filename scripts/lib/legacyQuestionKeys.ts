/**
 * Legacy (`<slug>:<points>:<index>`) → canonical (`q<UserID>`) question key map.
 *
 * Before question keys became the spreadsheet's permanent `UserID`, a question's canonical
 * key was its position inside its source spreadsheet group. Deployments seeded before the
 * switch still hold those rows, so pushing the new seed left two playable copies of every
 * question. This map is what lets the seed push retire the old copy.
 *
 * It is rebuilt from the same inputs the old seed came from: `constants/questions.json`
 * (group order, which is what `<index>` counted) and `convex/seed/categories.json` (the
 * historical `slug` for each topic, including topics that were renamed later). It never
 * reads the live database and never depends on the order rows come back in.
 */

import { canonicalKeyForUserId, legacyCanonicalKey } from '../../features/play/canonicalKey';

export interface LegacyKeyMapSourceGroup {
  categoryId: string;
  points: number;
  questionAndanswer: { userId?: string | null }[];
}

export interface LegacyKeyMapSourceCategory {
  slug: string;
  themeGroup?: string;
}

export interface LegacyQuestionKeyMap {
  /** Old position key → `q<UserID>`, for every source row that has a UserID. */
  mapping: Map<string, string>;
  /** Topic ids with no seed category; nothing is inferred for them. */
  unresolvedThemes: string[];
  /** Source rows with no spreadsheet UserID; those keep their legacy key. */
  rowsWithoutUserId: number;
}

export function buildLegacyQuestionKeyMap(
  groups: readonly LegacyKeyMapSourceGroup[],
  categories: readonly LegacyKeyMapSourceCategory[]
): LegacyQuestionKeyMap {
  const slugByThemeGroup = new Map<string, string>();
  for (const category of categories) {
    if (category.themeGroup && !slugByThemeGroup.has(category.themeGroup)) {
      slugByThemeGroup.set(category.themeGroup, category.slug);
    }
  }

  const mapping = new Map<string, string>();
  const unresolvedThemes = new Set<string>();
  let rowsWithoutUserId = 0;

  for (const group of groups) {
    const slug = slugByThemeGroup.get(group.categoryId);
    if (!slug) {
      unresolvedThemes.add(group.categoryId);
      continue;
    }

    for (const [index, qa] of group.questionAndanswer.entries()) {
      const userId = qa.userId;
      if (userId === undefined || userId === null || String(userId).trim() === '') {
        rowsWithoutUserId += 1;
        continue;
      }
      mapping.set(
        legacyCanonicalKey(slug, group.points, index),
        canonicalKeyForUserId(userId)
      );
    }
  }

  return { mapping, unresolvedThemes: [...unresolvedThemes], rowsWithoutUserId };
}

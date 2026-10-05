/**
 * Composes the frozen pre-`q<UserID>` question key snapshot.
 *
 * The snapshot is built once, from the seed that the key change replaced, and committed
 * (see scripts/build-legacy-question-keys.ts and convex/seed/legacyQuestionKeys.ts).
 * Nothing at runtime rebuilds it from current source data: reordering, adding or renaming
 * questions later must never change where an old key points.
 *
 * The composition is deliberately dumb about text: an entry is only accepted when the
 * historical row's prompt and answer match the row now holding that position. Anything
 * else is reported as a mismatch instead of being written, so a moved or swapped question
 * can never be silently paired with the wrong `q<UserID>`. Text that the key change
 * intentionally fixed is listed in `corrections`, and each listed correction must still
 * actually differ, so a stale entry is loud rather than quietly permissive.
 */

export interface LegacyQuestionKeyRow {
  categorySlug: string;
  canonicalKey: string;
  pointValue: number;
  locale: string;
  prompt: string;
  answer: string;
}

export type LegacyKeyMismatchReason =
  | 'unexpected-legacy-key'
  | 'unexpected-canonical-key'
  | 'missing-current-row'
  | 'unverified-text';

export interface LegacyKeyMismatch {
  legacyKey: string;
  reason: LegacyKeyMismatchReason;
  detail: string;
}

export interface LegacyQuestionKeyComposition {
  /** [legacyKey, canonicalKey] in historical seed order. */
  pairs: [string, string][];
  mismatches: LegacyKeyMismatch[];
  correctionsApplied: string[];
  correctionsStale: string[];
}

function groupByTopic(
  rows: readonly LegacyQuestionKeyRow[]
): Map<string, LegacyQuestionKeyRow[]> {
  const byTopic = new Map<string, LegacyQuestionKeyRow[]>();
  for (const row of rows) {
    const topicKey = `${row.categorySlug}|${row.pointValue}`;
    const bucket = byTopic.get(topicKey);
    if (bucket) {
      bucket.push(row);
    } else {
      byTopic.set(topicKey, [row]);
    }
  }
  return byTopic;
}

export function composeLegacyQuestionKeyPairs(
  historical: readonly LegacyQuestionKeyRow[],
  current: readonly LegacyQuestionKeyRow[],
  corrections: ReadonlySet<string>
): LegacyQuestionKeyComposition {
  const currentByTopic = groupByTopic(current);
  const pairs: [string, string][] = [];
  const mismatches: LegacyKeyMismatch[] = [];
  const correctionsApplied: string[] = [];
  const correctionsStale: string[] = [];

  for (const [topicKey, historicalRows] of groupByTopic(historical)) {
    const currentRows = currentByTopic.get(topicKey) ?? [];

    for (const [index, row] of historicalRows.entries()) {
      const expectedLegacyKey = `${row.categorySlug}:${row.pointValue}:${index}`;
      if (row.canonicalKey !== expectedLegacyKey) {
        mismatches.push({
          legacyKey: row.canonicalKey,
          reason: 'unexpected-legacy-key',
          detail: `expected ${expectedLegacyKey}`,
        });
        continue;
      }

      const replacement = currentRows[index];
      if (!replacement) {
        mismatches.push({
          legacyKey: row.canonicalKey,
          reason: 'missing-current-row',
          detail: `${topicKey} has ${currentRows.length} rows`,
        });
        continue;
      }
      if (!/^q\d+$/.test(replacement.canonicalKey)) {
        mismatches.push({
          legacyKey: row.canonicalKey,
          reason: 'unexpected-canonical-key',
          detail: `expected q<UserID>, got ${replacement.canonicalKey}`,
        });
        continue;
      }

      const textMatches =
        row.prompt === replacement.prompt && row.answer === replacement.answer;
      if (corrections.has(row.canonicalKey)) {
        if (textMatches) {
          correctionsStale.push(row.canonicalKey);
        } else {
          correctionsApplied.push(row.canonicalKey);
        }
        pairs.push([row.canonicalKey, replacement.canonicalKey]);
        continue;
      }

      if (!textMatches) {
        mismatches.push({
          legacyKey: row.canonicalKey,
          reason: 'unverified-text',
          detail: `would map to ${replacement.canonicalKey}`,
        });
        continue;
      }

      pairs.push([row.canonicalKey, replacement.canonicalKey]);
    }
  }

  return { pairs, mismatches, correctionsApplied, correctionsStale };
}

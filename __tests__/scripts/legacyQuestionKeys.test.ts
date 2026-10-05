import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEGACY_CONTENT_CORRECTIONS,
  LEGACY_QUESTION_KEY_PAIRS,
  LEGACY_QUESTION_KEY_VERSION,
  LEGACY_SEED_LOCALE,
} from '@/convex/seed/legacyQuestionKeys';
import {
  composeLegacyQuestionKeyPairs,
  type LegacyQuestionKeyRow,
} from '@/scripts/lib/legacyQuestionKeys';

const seed = JSON.parse(
  readFileSync(join(process.cwd(), 'convex', 'seed', 'questions.json'), 'utf8')
) as LegacyQuestionKeyRow[];

function legacyRow(
  slug: string,
  points: number,
  index: number,
  prompt: string,
  answer: string
): LegacyQuestionKeyRow {
  return {
    categorySlug: slug,
    canonicalKey: `${slug}:${points}:${index}`,
    pointValue: points,
    locale: 'en',
    prompt,
    answer,
  };
}

function currentRow(
  categorySlug: string,
  points: number,
  canonicalKey: string,
  prompt: string,
  answer: string
): LegacyQuestionKeyRow {
  return {
    categorySlug,
    canonicalKey,
    pointValue: points,
    locale: 'en',
    prompt,
    answer,
  };
}

const NO_CORRECTIONS = new Set<string>();

describe('composeLegacyQuestionKeyPairs', () => {
  const historical = [
    legacyRow('topic', 100, 0, 'first?', 'one'),
    legacyRow('topic', 100, 1, 'second?', 'two'),
    legacyRow('topic', 100, 2, 'third?', 'three'),
  ];

  it('pairs a historical key with the row holding the same position in the same topic', () => {
    const current = [
      currentRow('topic', 100, 'q10', 'first?', 'one'),
      currentRow('topic', 100, 'q11', 'second?', 'two'),
      currentRow('topic', 100, 'q12', 'third?', 'three'),
    ];

    const result = composeLegacyQuestionKeyPairs(historical, current, NO_CORRECTIONS);

    expect(result.pairs).toEqual([
      ['topic:100:0', 'q10'],
      ['topic:100:1', 'q11'],
      ['topic:100:2', 'q12'],
    ]);
    expect(result.mismatches).toEqual([]);
  });

  it('refuses to pair a reordered current seed instead of remapping the wrong question', () => {
    const reordered = [
      currentRow('topic', 100, 'q11', 'second?', 'two'),
      currentRow('topic', 100, 'q10', 'first?', 'one'),
      currentRow('topic', 100, 'q12', 'third?', 'three'),
    ];

    const result = composeLegacyQuestionKeyPairs(historical, reordered, NO_CORRECTIONS);

    expect(result.mismatches.map((m) => [m.legacyKey, m.reason])).toEqual([
      ['topic:100:0', 'unverified-text'],
      ['topic:100:1', 'unverified-text'],
    ]);
    expect(result.pairs).toEqual([['topic:100:2', 'q12']]);
  });

  it('refuses to pair a row whose text was replaced in place', () => {
    const edited = [
      currentRow('topic', 100, 'q10', 'brand new?', 'new'),
      currentRow('topic', 100, 'q11', 'second?', 'two'),
      currentRow('topic', 100, 'q12', 'third?', 'three'),
    ];

    const result = composeLegacyQuestionKeyPairs(historical, edited, NO_CORRECTIONS);

    expect(result.mismatches).toEqual([
      { legacyKey: 'topic:100:0', reason: 'unverified-text', detail: 'would map to q10' },
    ]);
  });

  it('accepts a reviewed correction, and only while the text still differs', () => {
    const edited = [
      currentRow('topic', 100, 'q10', 'first fixed?', 'one fixed'),
      currentRow('topic', 100, 'q11', 'second?', 'two'),
      currentRow('topic', 100, 'q12', 'third?', 'three'),
    ];

    const accepted = composeLegacyQuestionKeyPairs(
      historical,
      edited,
      new Set(['topic:100:0'])
    );
    expect(accepted.correctionsApplied).toEqual(['topic:100:0']);
    expect(accepted.correctionsStale).toEqual([]);
    expect(accepted.mismatches).toEqual([]);

    const noLongerDiffers = composeLegacyQuestionKeyPairs(
      historical,
      [
        currentRow('topic', 100, 'q10', 'first?', 'one'),
        ...edited.slice(1),
      ],
      new Set(['topic:100:0'])
    );
    expect(noLongerDiffers.correctionsStale).toEqual(['topic:100:0']);
  });

  it('refuses to pair a historical row that no longer has a replacement', () => {
    const removed = [
      currentRow('topic', 100, 'q10', 'first?', 'one'),
      currentRow('topic', 100, 'q12', 'third?', 'three'),
    ];

    const result = composeLegacyQuestionKeyPairs(historical, removed, NO_CORRECTIONS);

    expect(result.mismatches).toEqual([
      { legacyKey: 'topic:100:1', reason: 'unverified-text', detail: 'would map to q12' },
      { legacyKey: 'topic:100:2', reason: 'missing-current-row', detail: 'topic|100 has 2 rows' },
    ]);
  });

  it('refuses to pair a renamed topic', () => {
    const renamed = [
      currentRow('renamed', 100, 'q10', 'first?', 'one'),
      currentRow('renamed', 100, 'q11', 'second?', 'two'),
      currentRow('renamed', 100, 'q12', 'third?', 'three'),
    ];

    const result = composeLegacyQuestionKeyPairs(historical, renamed, NO_CORRECTIONS);

    expect(result.pairs).toEqual([]);
    expect(result.mismatches.map((m) => m.reason)).toEqual([
      'missing-current-row',
      'missing-current-row',
      'missing-current-row',
    ]);
  });

  it('refuses a historical key that does not describe its own position', () => {
    const tampered = [
      { ...legacyRow('topic', 100, 0, 'first?', 'one'), canonicalKey: 'topic:100:7' },
    ];

    const result = composeLegacyQuestionKeyPairs(tampered, [currentRow('topic', 100, 'q10', 'first?', 'one')], NO_CORRECTIONS);

    expect(result.mismatches).toEqual([
      { legacyKey: 'topic:100:7', reason: 'unexpected-legacy-key', detail: 'expected topic:100:0' },
    ]);
  });

  it('refuses a replacement that is not a q<UserID> key', () => {
    const result = composeLegacyQuestionKeyPairs(
      [legacyRow('topic', 100, 0, 'first?', 'one')],
      [currentRow('topic', 100, 'topic:100:0', 'first?', 'one')],
      NO_CORRECTIONS
    );

    expect(result.mismatches).toEqual([
      {
        legacyKey: 'topic:100:0',
        reason: 'unexpected-canonical-key',
        detail: 'expected q<UserID>, got topic:100:0',
      },
    ]);
    expect(result.pairs).toEqual([]);
  });

  it('keeps each topic and point value in its own position space', () => {
    const current = [
      currentRow('topic', 100, 'q10', 'first?', 'one'),
      currentRow('topic', 200, 'q20', 'other?', 'other'),
      currentRow('topic', 100, 'q11', 'second?', 'two'),
    ];

    const result = composeLegacyQuestionKeyPairs(
      [legacyRow('topic', 100, 0, 'first?', 'one'), legacyRow('topic', 100, 1, 'second?', 'two'), legacyRow('topic', 200, 0, 'other?', 'other')],
      current,
      NO_CORRECTIONS
    );

    expect(result.pairs).toEqual([
      ['topic:100:0', 'q10'],
      ['topic:100:1', 'q11'],
      ['topic:200:0', 'q20'],
    ]);
  });
});

describe('frozen snapshot (convex/seed/legacyQuestionKeys.ts)', () => {
  const legacyKeys = LEGACY_QUESTION_KEY_PAIRS.map(([legacyKey]) => legacyKey);
  const canonicalKeys = LEGACY_QUESTION_KEY_PAIRS.map(([, canonicalKey]) => canonicalKey);
  const seedKeys = new Set(seed.map((row) => row.canonicalKey));

  it('holds the 8,912 pre-change keys and nothing newer', () => {
    expect(LEGACY_QUESTION_KEY_PAIRS).toHaveLength(8912);
    expect(LEGACY_SEED_LOCALE).toBe('en');
    for (const legacyKey of legacyKeys) {
      expect(legacyKey).toMatch(/^[a-z0-9-]+:(100|200|300):\d+$/);
    }
    for (const canonicalKey of canonicalKeys) {
      expect(canonicalKey).toMatch(/^q\d+$/);
    }
    expect(new Set(legacyKeys).size).toBe(legacyKeys.length);
    expect(new Set(canonicalKeys).size).toBe(canonicalKeys.length);
    // The question this change added was never seeded under a position key.
    expect(legacyKeys).not.toContain('breaking-bad:200:46');
    expect(canonicalKeys).not.toContain('q8156');
  });

  it('matches its committed version pin', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(LEGACY_QUESTION_KEY_PAIRS))
      .digest('hex')
      .slice(0, 12);
    expect(LEGACY_QUESTION_KEY_VERSION).toBe('0a3cef5697e5');
    expect(digest).toBe(LEGACY_QUESTION_KEY_VERSION);
  });

  it('points every anchor at a question the English seed still owns', () => {
    for (const canonicalKey of canonicalKeys) {
      expect(seedKeys.has(canonicalKey)).toBe(true);
    }
    // Exactly one seeded question has no position-key ancestor: the one this change added.
    expect(seedKeys.size).toBe(8913);
    expect([...seedKeys].filter((key) => !canonicalKeys.includes(key))).toEqual(['q8156']);
  });

  it('lists exactly the reviewed content corrections', () => {
    expect(LEGACY_CONTENT_CORRECTIONS).toHaveLength(49);
    expect(new Set(LEGACY_CONTENT_CORRECTIONS).size).toBe(49);
    for (const key of LEGACY_CONTENT_CORRECTIONS) {
      expect(legacyKeys).toContain(key);
    }
  });

  it('cannot be rebuilt from a reordered current seed', () => {
    const seedByKey = new Map(seed.map((row) => [row.canonicalKey, row]));
    // Rebuild the historical side from the frozen snapshot plus today's text, then rebuild
    // the snapshot from a reordered current seed. The composer refuses, so nothing can move
    // an old key onto another question even if the source is reshuffled.
    const historical = LEGACY_QUESTION_KEY_PAIRS.map(([legacyKey, canonicalKey]) => {
      const current = seedByKey.get(canonicalKey)!;
      const slug = legacyKey.split(':').slice(0, -2).join(':');
      return {
        categorySlug: slug,
        canonicalKey: legacyKey,
        pointValue: current.pointValue,
        locale: 'en',
        prompt: current.prompt,
        answer: current.answer,
      };
    });

    const unchanged = composeLegacyQuestionKeyPairs(historical, seed, NO_CORRECTIONS);
    expect(unchanged.mismatches).toEqual([]);
    expect(unchanged.pairs).toEqual(
      LEGACY_QUESTION_KEY_PAIRS.map(([legacyKey, canonicalKey]) => [legacyKey, canonicalKey])
    );

    const reordered = [...seed];
    const second = reordered[1]!;
    reordered[1] = reordered[0]!;
    reordered[0] = second;
    const rebuilt = composeLegacyQuestionKeyPairs(historical, reordered, NO_CORRECTIONS);
    expect(rebuilt.mismatches.length).toBeGreaterThan(0);
    expect(rebuilt.pairs).not.toEqual(unchanged.pairs);
  });
});

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLegacyQuestionKeyMap } from '@/scripts/lib/legacyQuestionKeys';

interface SourceGroupFixture {
  categoryId: string;
  name: string;
  points: number;
  questionAndanswer: { userId?: string }[];
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(process.cwd(), ...parts), 'utf8')) as T;
}

const groups = readJson<SourceGroupFixture[]>('constants', 'questions.json');
const categories = readJson<{ slug: string; themeGroup?: string }[]>(
  'convex',
  'seed',
  'categories.json'
);
const seedRows = readJson<{ canonicalKey: string }[]>('convex', 'seed', 'questions.json');

describe('buildLegacyQuestionKeyMap (committed source and seed)', () => {
  const { mapping, unresolvedThemes, rowsWithoutUserId } = buildLegacyQuestionKeyMap(
    groups,
    categories
  );

  it('resolves every topic and every source row', () => {
    expect(unresolvedThemes).toEqual([]);
    expect(rowsWithoutUserId).toBe(0);
  });

  it('covers the English seed exactly once per question', () => {
    const seedKeys = new Set(seedRows.map((row) => row.canonicalKey));
    expect(mapping.size).toBe(seedRows.length);
    expect(new Set(mapping.values())).toEqual(seedKeys);
  });

  it('maps each position key to a canonical key the seed owns', () => {
    const seedKeys = new Set(seedRows.map((row) => row.canonicalKey));
    for (const [legacyKey, canonicalKey] of mapping) {
      expect(legacyKey).toMatch(/^[a-z0-9-]+:(100|200|300):\d+$/);
      expect(canonicalKey).toMatch(/^q\d+$/);
      expect(seedKeys.has(canonicalKey)).toBe(true);
    }
  });

  it('numbers every (topic, points) group from zero without gaps', () => {
    const indicesByGroup = new Map<string, number[]>();
    for (const legacyKey of mapping.keys()) {
      const [slug, points, index] = legacyKey.split(':') as [string, string, string];
      const group = `${slug}:${points}`;
      indicesByGroup.set(group, [...(indicesByGroup.get(group) ?? []), Number(index)]);
    }

    expect(indicesByGroup.size).toBeGreaterThan(0);
    for (const indices of indicesByGroup.values()) {
      const sorted = [...indices].sort((a, b) => a - b);
      expect(sorted).toEqual(sorted.map((_, index) => index));
    }
  });

  it('refuses to guess a slug for a topic the seed does not know', () => {
    const result = buildLegacyQuestionKeyMap(
      [{ categoryId: 'ghost', points: 100, questionAndanswer: [{ userId: '1' }] }],
      []
    );
    expect(result.mapping.size).toBe(0);
    expect(result.unresolvedThemes).toEqual(['ghost']);
  });

  it('leaves rows without a UserID on their legacy key', () => {
    const result = buildLegacyQuestionKeyMap(
      [
        {
          categoryId: 'g1',
          points: 200,
          questionAndanswer: [{ userId: '7' }, {}, { userId: '  ' }],
        },
      ],
      [{ slug: 'g', themeGroup: 'g1' }]
    );
    expect([...result.mapping.entries()]).toEqual([['g:200:0', 'q7']]);
    expect(result.rowsWithoutUserId).toBe(2);
  });
});

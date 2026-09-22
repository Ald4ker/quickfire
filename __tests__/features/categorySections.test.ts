import { describe, expect, it } from '@jest/globals';
import { getCategorySectionId, getLeadingTeamId, groupCategoriesBySection } from '@/features/play/categorySections';
import { getPlayableCategories } from '@/features/play/data';

describe('category sections', () => {
  it('uses the requested section and topic order; Pokémon is pop culture only', () => {
    // SAFETY: Minimal category fixtures satisfy PlayableCategory fields used by grouping.
    const categories = [
      { id: 'g7', slug: 'minecraft', title: 'Minecraft', questionCount: 10 },
      { id: 'pc17', slug: 'pokemon', title: 'Pokemon', questionCount: 10 },
      { id: 'gen1', slug: 'corporations', title: 'Corporations', questionCount: 10 },
      { id: 'h1', slug: '19th-century', title: '19th Century', questionCount: 10 },
      { id: 's2', slug: 'cricket', title: 'Cricket', questionCount: 10 },
    ] as never;

    const sections = groupCategoriesBySection(categories);

    expect(sections.map((section) => section.id)).toEqual([
      'general', 'history', 'popCulture', 'sports', 'gaming',
    ]);
    expect(sections[0]?.categories.map((category) => category.title)).toEqual(['Corporations']);
    expect(sections[2]?.categories.map((category) => category.title)).toEqual(['Pokémon']);
    expect(sections[4]?.categories.map((category) => category.title)).toEqual(['Minecraft']);
  });

  it('finds every requested topic in the shipped question data', () => {
    const sections = groupCategoriesBySection(getPlayableCategories());
    expect(sections.map((section) => section.categories.length)).toEqual([21, 14, 28, 9, 8]);
    const titles = sections.flatMap((section) => section.categories).map((category) => category.title);
    expect(titles).toContain('Guess the Flag');
    expect(titles).toContain('Guess the Jersey');
  });

  // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
  it('does not classify gen-prefixed topics as gaming', () => {
    expect(getCategorySectionId('gen9')).toBe('general');
    expect(getCategorySectionId('g9')).toBe('gaming');
  });
});

describe('getLeadingTeamId', () => {
  it('returns no leader when teams are tied', () => {
    expect(getLeadingTeamId([
      { id: 'team_1', score: 0 },
      { id: 'team_2', score: 0 },
    ])).toBeUndefined();
  });

  it('returns the sole highest team', () => {
    expect(getLeadingTeamId([
      { id: 'team_1', score: 100 },
      { id: 'team_2', score: 300 },
      { id: 'team_3', score: 200 },
    ])).toBe('team_2');
  });
});

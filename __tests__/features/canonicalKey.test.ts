import { describe, expect, it } from '@jest/globals';
import {
  canonicalKeyForUserId,
  isUserIdCanonicalKey,
  legacyCanonicalKey,
  questionCanonicalKey,
} from '@/features/play/canonicalKey';
import { buildBoard, getPlayableCategories } from '@/features/play/data';

describe('questionCanonicalKey', () => {
  it('uses the spreadsheet userId when present', () => {
    expect(questionCanonicalKey({ userId: '42' }, 'naruto', 100, 7)).toBe('q42');
    expect(questionCanonicalKey({ userId: 42 }, 'naruto', 100, 7)).toBe('q42');
    expect(canonicalKeyForUserId(' 7 ')).toBe('q7');
  });

  it('does not depend on position, points or slug when a userId exists', () => {
    const a = questionCanonicalKey({ userId: '9' }, 'naruto', 100, 0);
    const b = questionCanonicalKey({ userId: '9' }, 'anime', 300, 55);
    expect(a).toBe(b);
  });

  it('falls back to the legacy position key without a userId', () => {
    expect(questionCanonicalKey({}, 'naruto', 100, 7)).toBe('naruto:100:7');
    expect(questionCanonicalKey({ userId: '' }, 'naruto', 100, 7)).toBe('naruto:100:7');
    expect(questionCanonicalKey({ userId: null }, 'naruto', 100, 7)).toBe(legacyCanonicalKey('naruto', 100, 7));
  });

  it('recognises userId keys', () => {
    expect(isUserIdCanonicalKey('q123')).toBe(true);
    expect(isUserIdCanonicalKey('naruto:100:7')).toBe(false);
    expect(isUserIdCanonicalKey('q')).toBe(false);
  });
});

describe('bundled questions', () => {
  it('give every board card a q<userId> key', () => {
    const categories = getPlayableCategories(['en']).slice(0, 5);
    const board = buildBoard(categories.map((category) => category.slug));
    expect(board.length).toBeGreaterThan(0);
    for (const card of board) {
      expect(isUserIdCanonicalKey(card.canonicalKey)).toBe(true);
    }
  });
});

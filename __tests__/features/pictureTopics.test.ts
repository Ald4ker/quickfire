import { describe, expect, it } from '@jest/globals';
import { buildBoard, getPlayableCategories } from '@/features/play/data';
import { QUESTION_IMAGE_KEYS } from '@/constants/questionImages';

describe('picture topics', () => {
  it('registers Guess the Flag and Guess the Jersey with bundled images', () => {
    const categories = getPlayableCategories(['en']);
    const flag = categories.find((c) => c.slug === 'guess-the-flag');
    const jersey = categories.find((c) => c.slug === 'guess-the-jersey');

    expect(flag?.questionCount).toBe(195);
    expect(jersey?.questionCount).toBe(120);
    expect(QUESTION_IMAGE_KEYS.length).toBe(315);
  });

  it('attaches promptImageKey when building a flag or jersey board', () => {
    const flagBoard = buildBoard(['guess-the-flag']);
    expect(flagBoard.length).toBeGreaterThan(0);
    expect(flagBoard.every((q) => q.prompt === 'Which country is this?')).toBe(true);
    expect(flagBoard.every((q) => typeof q.promptImageKey === 'string' && q.promptImageKey.startsWith('flags/'))).toBe(
      true
    );

    const jerseyBoard = buildBoard(['guess-the-jersey']);
    expect(jerseyBoard.length).toBeGreaterThan(0);
    expect(jerseyBoard.every((q) => q.prompt === 'Whose shirt is this?')).toBe(true);
    expect(
      jerseyBoard.every((q) => typeof q.promptImageKey === 'string' && q.promptImageKey.startsWith('jerseys/'))
    ).toBe(true);
  });
});

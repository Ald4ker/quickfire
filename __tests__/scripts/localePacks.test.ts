import { afterEach, describe, expect, it } from '@jest/globals';
import { parseQuestionsLong, readQuestionsLong } from '@/scripts/lib/questionsLong';
import { buildLocalePacks, serializeLocalePack } from '@/scripts/lib/localePacks';
import {
  clearQuestionTranslations,
  registerQuestionTranslations,
  resolveQuestionVariants,
} from '@/features/play/data';

const HEADER =
  'userId,canonicalKey,topic,categorySlug,difficulty,pointValue,locale,prompt,answer,status,duplicateOf,promptImageKey,sourceIssue';

const FIXTURE = parseQuestionsLong(
  [
    HEADER,
    '10,q10,Naruto,naruto,Easy,100,en,English ten,Ten,active,,,',
    '10,q10,Naruto,naruto,Easy,100,ja,日本語 十 ,十,active,,,',
    '10,q10,Naruto,naruto,Easy,100,ar,عشرة,عشرة,active,,,',
    '2,q2,Naruto,naruto,Easy,100,ja,日本語 二,二,active,,,',
    '3,q3,Naruto,naruto,Easy,100,ja,重複,重複,duplicate,2,,',
    '4,q4,Naruto,naruto,Easy,100,xx,unknown,unknown,active,,,',
    '5,q5,Naruto,naruto,Easy,100,ko,,빈,active,,,',
  ].join('\n')
);

afterEach(() => {
  clearQuestionTranslations();
});

describe('buildLocalePacks', () => {
  it('packs active non-English rows per locale and reports what it skipped', () => {
    const { packs, skipped } = buildLocalePacks(FIXTURE);

    expect(packs.ja).toEqual({
      q10: { prompt: '日本語 十', answer: '十' },
      q2: { prompt: '日本語 二', answer: '二' },
    });
    expect(packs.ar).toEqual({ q10: { prompt: 'عشرة', answer: 'عشرة' } });
    expect(packs.ko).toBeUndefined();
    expect(skipped).toEqual({ english: 1, duplicate: 1, unknownLocale: 1, empty: 1, filtered: 0 });
  });

  it('builds only the locales and keys asked for', () => {
    const { packs, skipped } = buildLocalePacks(FIXTURE, {
      locales: ['ja'],
      keys: new Set(['q10']),
    });

    expect(Object.keys(packs)).toEqual(['ja']);
    expect(Object.keys(packs.ja!)).toEqual(['q10']);
    expect(skipped.filtered).toBe(3); // ar q10, ja q2, and the ko row
  });

  it('writes keys in UserID order so regenerated packs diff cleanly', () => {
    const json = serializeLocalePack(buildLocalePacks(FIXTURE).packs.ja!);
    expect(Object.keys(JSON.parse(json))).toEqual(['q2', 'q10']);
    expect(json.endsWith('\n')).toBe(true);
  });
});

describe('packs from the committed translation pack', () => {
  it('feeds data.ts so a real question shows in two languages', () => {
    const { packs } = buildLocalePacks(readQuestionsLong(), {
      locales: ['ja', 'ar'],
      keys: new Set(['q1']),
    });
    expect(packs.ja?.q1?.prompt).toBeTruthy();
    expect(packs.ar?.q1?.prompt).toBeTruthy();

    registerQuestionTranslations('ja', packs.ja!);
    registerQuestionTranslations('ar', packs.ar!);

    const variants = resolveQuestionVariants(
      { canonicalKey: 'q1', prompt: 'unused', answer: 'unused', locale: 'en' },
      { primary: 'ja', secondary: 'ar' }
    );

    expect(variants.primary).toMatchObject({ locale: 'ja', prompt: packs.ja!.q1!.prompt });
    expect(variants.secondary).toMatchObject({ locale: 'ar', answer: packs.ar!.q1!.answer });
  });
});

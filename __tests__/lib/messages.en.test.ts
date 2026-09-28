import { describe, expect, it } from '@jest/globals';

import { en } from '@/lib/i18n/messages/en';
import ar from '@/lib/i18n/messages/ar';
import bn from '@/lib/i18n/messages/bn';
import es from '@/lib/i18n/messages/es';
import fr from '@/lib/i18n/messages/fr';
import hi from '@/lib/i18n/messages/hi';
import id from '@/lib/i18n/messages/id';
import ptBr from '@/lib/i18n/messages/pt-BR';
import ru from '@/lib/i18n/messages/ru';
import ur from '@/lib/i18n/messages/ur';
import zhHans from '@/lib/i18n/messages/zh-Hans';

const NON_ENGLISH_MESSAGES = [ar, bn, es, fr, hi, id, ptBr, ru, ur, zhHans];
const SETTINGS_UI_KEYS = [
  'common.english',
  'common.languages',
  'common.priorityLabel',
  'common.theme',
  'settings.accountAuthTitle',
  'settings.themeSelectionTitle',
  'settings.languagesUpToTwoTitle',
  'settings.noTriviaLanguagesSelected',
  'settings.themePickerDescription',
  'settings.appLanguagePickerDescription',
  'settings.triviaLanguagesDescription',
  'settings.closeThemePicker',
  'settings.closeLanguagePicker',
  'settings.closeTriviaLanguagesPicker',
  'settings.activePalette',
  'settings.tapToApply',
  'settings.englishFallback',
  'settings.palette.warm',
  'settings.palette.cool',
  'settings.palette.green',
  'settings.palette.red',
  'settings.palette.dark',
] as const;

describe('English mode copy', () => {
  it('uses the finalized home mode descriptions', () => {
    expect(en['play.mode.classicCopy']).toBe('Six topics and wagers on the full board.');
    expect(en['play.mode.quickCopy']).toBe('Pick 1 to 5 topics for a faster match with wagers.');
    expect(en['play.mode.randomCopy']).toBe('The app draws each question for you. Wagers stay off.');
    expect(en['play.mode.rumbleCopy']).toBe(
      '2, 3, 4, or 6 teams. Each question assigns two teams who answer in turn.'
    );
  });

  it('has localized strings for the settings modals in every app language', () => {
    for (const messages of NON_ENGLISH_MESSAGES) {
      for (const key of SETTINGS_UI_KEYS) {
        expect(messages[key]).toBeTruthy();
        expect(messages[key]).not.toBe(en[key]);
      }
    }
  });

  // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
  it('keeps quick mode labelled as Quick Play instead of rebranding the mode', () => {
    expect(en['play.mode.quick']).toBe('Quick Play');
    expect(en['play.quickLengthTitle']).toBe('Set Quick Play Length');
    expect(en['play.quickLengthSubtitle']).toBe(
      'Choose how many topics Quick Play should use before team setup.'
    );
  });

  it('labels random topic count as Number of Topics and keeps British randomiser spelling', () => {
    expect(en['play.numberOfTopics']).toBe('Number of Topics');
    expect(en['play.randomBoardSubtitle']).toContain('Randomiser');
    expect(en['play.wagerInfoParagraph2']).toContain('randomiser');
    expect(Object.values(en).join('\n')).not.toMatch(/\bRandomize\b/);
    expect(Object.values(en).join('\n')).not.toMatch(/\brandomize\b/);
  });
});

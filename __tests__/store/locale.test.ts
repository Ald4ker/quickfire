import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  CONTENT_LOCALES,
  LOCALE_LABELS,
  MAX_CONTENT_LOCALES,
  SUPPORTED_LOCALES,
  getDirection,
  getLocaleLabel,
  getResolvedContentLocaleChain,
  isContentLocale,
  isNonEnglishContentLocale,
  normalizeContentLocales,
} from '@/lib/i18n/config';
import { setItemAsync } from 'expo-secure-store';
import { __resetSecureStoreDouble } from '../doubles/expoSecureStore';
import { useLocaleStore } from '@/store/locale';

const CONTENT_LOCALE_STORAGE_KEY = 'backfire-content-locales';

beforeEach(() => {
  __resetSecureStoreDouble();
  useLocaleStore.setState({
    uiLocale: 'en',
    contentLocales: {
      primary: null,
      secondary: null,
    },
    hasExplicitUiSelection: false,
    hasExplicitContentSelection: false,
  });
});

describe('content locales', () => {
  it('lists the 17 translated languages independently of the 11 UI languages', () => {
    expect(CONTENT_LOCALES).toEqual([
      'zh-Hans', 'es', 'ar', 'hi', 'fr', 'pt-BR', 'ur', 'bn', 'id', 'ru',
      'ja', 'ko', 'sw', 'de', 'pt-PT', 'it', 'tr',
    ]);
    expect(SUPPORTED_LOCALES).toHaveLength(11);
    // Every non-English UI language is also a content language, so old preferences stay valid.
    for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'en')) {
      expect(isNonEnglishContentLocale(locale)).toBe(true);
    }
  });

  it('has native and English labels and RTL flags for every content locale', () => {
    for (const locale of CONTENT_LOCALES) {
      expect(LOCALE_LABELS[locale].nativeName).toBeTruthy();
      expect(LOCALE_LABELS[locale].englishName).toBeTruthy();
    }
    expect(getLocaleLabel('ja', 'both')).toBe('日本語 (Japanese)');
    expect(getLocaleLabel('pt-PT', 'english')).toBe('Portuguese (Portugal)');
    expect(CONTENT_LOCALES.filter((locale) => getDirection(locale) === 'rtl')).toEqual(['ar', 'ur']);
  });

  it('accepts only English and the content codes', () => {
    expect(isContentLocale('en')).toBe(true);
    expect(isContentLocale('sw')).toBe(true);
    expect(isNonEnglishContentLocale('en')).toBe(false);
    expect(isNonEnglishContentLocale('pt')).toBe(false);
    expect(isNonEnglishContentLocale('zh')).toBe(false);
  });
});

describe('locale helpers', () => {
  it('keeps the first two distinct content locales and drops unknown codes', () => {
    expect(MAX_CONTENT_LOCALES).toBe(2);
    expect(normalizeContentLocales(['ar', 'ar', 'xx', 'en', 'ko', 'ur', 'es'])).toEqual({
      primary: 'ar',
      secondary: 'ko',
    });
    expect(normalizeContentLocales([null, undefined, 'tr'])).toEqual({
      primary: 'tr',
      secondary: null,
    });
  });

  it('builds a resolved content locale chain with implicit english', () => {
    expect(getResolvedContentLocaleChain({ primary: 'ja', secondary: 'fr' })).toEqual([
      'ja',
      'fr',
      'en',
    ]);
    expect(getResolvedContentLocaleChain({ primary: null, secondary: null })).toEqual(['en']);
  });
});

describe('useLocaleStore', () => {
  it('caps selected content locales at two and persists them', () => {
    useLocaleStore.getState().setContentLocales(['ar', 'de', 'ur', 'es']);

    expect(useLocaleStore.getState().contentLocales).toEqual({
      primary: 'ar',
      secondary: 'de',
    });
    expect(setItemAsync).toHaveBeenCalledWith(
      CONTENT_LOCALE_STORAGE_KEY,
      JSON.stringify({ primary: 'ar', secondary: 'de' })
    );
  });

  it('swaps primary and secondary', () => {
    useLocaleStore.getState().setContentLocales(['ar', 'sw']);
    useLocaleStore.getState().moveContentLocale(1, 0);

    expect(useLocaleStore.getState().contentLocales).toEqual({
      primary: 'sw',
      secondary: 'ar',
    });
  });

  it('reads back a stored three-slot preference from an older build', async () => {
    await setItemAsync(
      CONTENT_LOCALE_STORAGE_KEY,
      JSON.stringify({ primary: 'fr', secondary: 'ur', tertiary: 'bn' })
    );

    await useLocaleStore.getState().hydrate();

    expect(useLocaleStore.getState().contentLocales).toEqual({ primary: 'fr', secondary: 'ur' });
    expect(useLocaleStore.getState().hasExplicitContentSelection).toBe(true);
  });

  it('moves the old third slot up when an earlier slot is no longer valid', async () => {
    await setItemAsync(
      CONTENT_LOCALE_STORAGE_KEY,
      JSON.stringify({ primary: 'xx', secondary: 'es', tertiary: 'hi' })
    );

    await useLocaleStore.getState().hydrate();

    expect(useLocaleStore.getState().contentLocales).toEqual({ primary: 'es', secondary: 'hi' });
  });
});

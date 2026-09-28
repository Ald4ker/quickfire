/** Languages the app UI is translated into (message catalogues under `lib/i18n/messages`). */
export const SUPPORTED_LOCALES = [
  'en',
  'ar',
  'es',
  'fr',
  'ur',
  'hi',
  'zh-Hans',
  'pt-BR',
  'ru',
  'id',
  'bn',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Languages the trivia questions are translated into, independent of the UI list.
 * Codes and order match the `locale` column of `constants/translations/questions-long.csv.gz`.
 * English is always the base content language and is not listed here.
 */
export const CONTENT_LOCALES = [
  'zh-Hans',
  'es',
  'ar',
  'hi',
  'fr',
  'pt-BR',
  'ur',
  'bn',
  'id',
  'ru',
  'ja',
  'ko',
  'sw',
  'de',
  'pt-PT',
  'it',
  'tr',
] as const;

export type NonEnglishContentLocale = (typeof CONTENT_LOCALES)[number];
/** Any locale a question variant can be in: English plus the 17 content locales. */
export type ContentLocale = 'en' | NonEnglishContentLocale;
export type Direction = 'ltr' | 'rtl';

/**
 * At most two content languages are shown on screen at once (primary above, secondary beneath).
 * Older builds stored a third ("tertiary") slot; it is ignored when preferences are read back.
 */
export const MAX_CONTENT_LOCALES = 2;

export interface ContentLocalePriority {
  primary: NonEnglishContentLocale | null;
  secondary: NonEnglishContentLocale | null;
}

export const DEFAULT_UI_LOCALE: SupportedLocale = 'en';

export const EMPTY_CONTENT_LOCALES: ContentLocalePriority = {
  primary: null,
  secondary: null,
};

const SYSTEM_FONT_LOCALES = new Set<ContentLocale>([
  'ar',
  'ur',
  'hi',
  'bn',
  'zh-Hans',
  'ja',
  'ko',
]);

export type LocaleLabel = {
  nativeName: string;
  englishName: string;
  /** Right-to-left script. */
  rtl: boolean;
};

/** Native and English names for every locale the app knows (UI and content). */
export const LOCALE_LABELS = {
  en: { nativeName: 'English', englishName: 'English', rtl: false },
  'zh-Hans': { nativeName: '简体中文', englishName: 'Mandarin (Simplified)', rtl: false },
  es: { nativeName: 'Español', englishName: 'Spanish', rtl: false },
  ar: { nativeName: 'العربية', englishName: 'Arabic', rtl: true },
  hi: { nativeName: 'हिन्दी', englishName: 'Hindi', rtl: false },
  fr: { nativeName: 'Français', englishName: 'French', rtl: false },
  'pt-BR': { nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', rtl: false },
  ur: { nativeName: 'اردو', englishName: 'Urdu', rtl: true },
  bn: { nativeName: 'বাংলা', englishName: 'Bengali', rtl: false },
  id: { nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', rtl: false },
  ru: { nativeName: 'Русский', englishName: 'Russian', rtl: false },
  ja: { nativeName: '日本語', englishName: 'Japanese', rtl: false },
  ko: { nativeName: '한국어', englishName: 'Korean', rtl: false },
  sw: { nativeName: 'Kiswahili', englishName: 'Swahili', rtl: false },
  de: { nativeName: 'Deutsch', englishName: 'German', rtl: false },
  'pt-PT': { nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)', rtl: false },
  it: { nativeName: 'Italiano', englishName: 'Italian', rtl: false },
  tr: { nativeName: 'Türkçe', englishName: 'Turkish', rtl: false },
} as const satisfies Record<ContentLocale, LocaleLabel>;

export function isSupportedLocale(value: string): value is SupportedLocale {
  // SAFETY: SUPPORTED_LOCALES is the closed set of SupportedLocale string literals.
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isNonEnglishContentLocale(
  value: string
): value is NonEnglishContentLocale {
  // SAFETY: CONTENT_LOCALES is the closed set of NonEnglishContentLocale string literals.
  return (CONTENT_LOCALES as readonly string[]).includes(value);
}

export function isContentLocale(value: string): value is ContentLocale {
  return value === 'en' || isNonEnglishContentLocale(value);
}

export function isRTLLocale(locale: ContentLocale): boolean {
  return LOCALE_LABELS[locale]?.rtl ?? false;
}

export function getDirection(locale: ContentLocale): Direction {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}

export function usesSystemFonts(locale: ContentLocale): boolean {
  return SYSTEM_FONT_LOCALES.has(locale);
}

export function getLocaleLabel(
  locale: ContentLocale,
  format: 'native' | 'english' | 'both' = 'native'
): string {
  const label = LOCALE_LABELS[locale];

  if (format === 'english') {
    return label.englishName;
  }

  if (format === 'both') {
    return `${label.nativeName} (${label.englishName})`;
  }

  return label.nativeName;
}

export function contentLocalePriorityToArray(
  priority: ContentLocalePriority
): NonEnglishContentLocale[] {
  return [priority.primary, priority.secondary].filter(
    (locale): locale is NonEnglishContentLocale => locale !== null
  );
}

/**
 * Keep the first two distinct content locales, in order. Unknown codes and English are dropped,
 * so any older stored preference (up to three UI-derived locales) still loads.
 */
export function normalizeContentLocales(
  locales: readonly (string | null | undefined)[]
): ContentLocalePriority {
  const unique = Array.from(
    new Set(
      locales.filter(
        (locale): locale is NonEnglishContentLocale =>
          typeof locale === 'string' && isNonEnglishContentLocale(locale)
      )
    )
  ).slice(0, MAX_CONTENT_LOCALES);

  return {
    primary: unique[0] ?? null,
    secondary: unique[1] ?? null,
  };
}

/** Locales to fetch question rows for, in priority order, always ending in English. */
export function getResolvedContentLocaleChain(
  prefs: ContentLocalePriority
): ContentLocale[] {
  return [...contentLocalePriorityToArray(prefs), 'en'];
}


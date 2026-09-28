/** Default English `useI18n` double with real message catalog (no LocaleProvider needed). */
import enMessages from '@/lib/i18n/messages/en';
import {
  getDirection,
  getLocaleLabel,
  isContentLocale,
} from '@/lib/i18n/config';

type TranslationParams = Record<string, string | number | undefined | null>;

let direction: 'ltr' | 'rtl' = 'ltr';
let uiLocale = 'en';
let messages = { ...enMessages } satisfies typeof enMessages & Record<string, string>;
let textStyle: { fontFamily?: string; [key: string]: string | number | undefined } = { fontFamily: 'System' };
/** When on, getTextStyle adds the locale's writingDirection (for per-block RTL assertions). */
let localeAwareTextStyle = false;

function interpolate(message: string, params?: TranslationParams) {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? '' : String(value);
  });
}

function lookupMessage(key: string): string {
  if (Object.prototype.hasOwnProperty.call(messages, key)) {
    // SAFETY: hasOwnProperty confirms key exists on the merged message bag.
    return messages[key as keyof typeof messages];
  }
  if (Object.prototype.hasOwnProperty.call(enMessages, key)) {
    // SAFETY: hasOwnProperty confirms key exists on the English catalog.
    return enMessages[key as keyof typeof enMessages];
  }
  return key;
}

export function useI18n() {
  return {
    direction,
    uiLocale,
    isRTL: direction === 'rtl',
    contentLocales: { primary: null, secondary: null },
    contentLocaleChain: ['en'] as const,
    t: (key: string, params?: TranslationParams) => interpolate(lookupMessage(key), params),
    getLocaleName: (
      locale: string,
      format: 'native' | 'english' | 'both' = 'native'
    ) => {
      if (!isContentLocale(locale)) return locale;
      return getLocaleLabel(locale, format);
    },
    getTextStyle: (
      locale?: string,
      _role?: string,
      _edge?: string,
      _content?: string
    ) => {
      if (!localeAwareTextStyle) return textStyle;
      const resolved = locale ?? uiLocale;
      return {
        ...textStyle,
        writingDirection: isContentLocale(resolved) ? getDirection(resolved) : 'ltr',
      };
    },
  };
}

export function __setI18nMessages(next: Record<string, string>): void {
  messages = { ...enMessages, ...next };
}

export function __setI18nDirection(next: 'ltr' | 'rtl'): void {
  direction = next;
}

export function __setI18nLocale(next: string): void {
  uiLocale = next;
}

export function __setI18nTextStyle(next: { fontFamily?: string; [key: string]: string | number | undefined }): void {
  textStyle = { fontFamily: 'System', ...next };
}

export function __setI18nLocaleAwareTextStyle(enabled: boolean): void {
  localeAwareTextStyle = enabled;
}

export function __resetUseI18nDouble(): void {
  localeAwareTextStyle = false;
  direction = 'ltr';
  uiLocale = 'en';
  messages = { ...enMessages };
  textStyle = { fontFamily: 'System' as string };
}

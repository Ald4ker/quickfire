import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import type { ContentLocale, Direction } from './config';
import { getDirection } from './config';
import {
  type FontRole,
  containsArabicScript,
  resolveContentFontFamily,
  resolveLocaleFontFamily,
  usesArabicScriptFont,
} from './fonts';

export type { FontRole };

export function getLocaleFontFamily(
  locale: ContentLocale,
  role: FontRole = 'body'
): string | undefined {
  return resolveLocaleFontFamily(locale, role, Platform.OS);
}

export function getContentFontFamily(
  locale: ContentLocale,
  content: string | null | undefined,
  role: FontRole = 'body'
): string | undefined {
  return resolveContentFontFamily(locale, content, role, Platform.OS);
}

export function getWritingDirection(
  locale: ContentLocale
): TextStyle['writingDirection'] {
  return getDirection(locale);
}

export function getContentWritingDirection(
  locale: ContentLocale,
  content?: string | null
): TextStyle['writingDirection'] {
  const firstLetter = content?.match(/\p{L}/u)?.[0];

  if (containsArabicScript(firstLetter) && !usesArabicScriptFont(locale)) {
    return 'rtl';
  }

  return getWritingDirection(locale);
}

export function getDirectionalTextAlign(
  direction: Direction,
  edge: 'start' | 'center' | 'end' = 'start'
): TextStyle['textAlign'] {
  if (edge === 'center') {
    return 'center';
  }

  if (direction === 'rtl') {
    return edge === 'start' ? 'right' : 'left';
  }

  return edge === 'start' ? 'left' : 'right';
}

export function getRowDirection(direction: Direction): ViewStyle['flexDirection'] {
  return direction === 'rtl' ? 'row-reverse' : 'row';
}

export function getChevronName(direction: Direction): 'chevron-forward' | 'chevron-back' {
  return direction === 'rtl' ? 'chevron-back' : 'chevron-forward';
}

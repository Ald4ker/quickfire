/**
 * Locale-aware font resolution.
 *
 * Brand faces (Clash Display, General Sans) are Latin-only. Arabic / Urdu UI
 * uses bundled Noto Sans Arabic so glyphs render on iOS, Android, and web.
 * Brand family names are remapped at style flatten time when the UI locale
 * needs a script font — so hardcoded StyleSheet fontFamily values work too.
 */
import { StyleSheet } from 'react-native';
import type { ContentLocale } from './config';
import { usesSystemFonts } from './config';
import { FONTS } from '@/constants/theme';

/** PostScript / expo-font registration keys for Noto Sans Arabic */
export const ARABIC_FONTS = {
  display: 'NotoSansArabic_600SemiBold',
  displayBold: 'NotoSansArabic_700Bold',
  ui: 'NotoSansArabic_400Regular',
  uiMedium: 'NotoSansArabic_500Medium',
  uiSemibold: 'NotoSansArabic_600SemiBold',
  uiBold: 'NotoSansArabic_700Bold',
} as const;

/**
 * Short brand face names as registered with expo-font (not web CSS stacks).
 * StyleSheet values on web may be "GeneralSans-Regular, NotoSans…, sans-serif".
 */
const BRAND_FACE = {
  display: 'ClashDisplay-Semibold',
  displayBold: 'ClashDisplay-Bold',
  ui: 'GeneralSans-Regular',
  uiMedium: 'GeneralSans-Medium',
  uiSemibold: 'GeneralSans-Semibold',
  uiBold: 'GeneralSans-Bold',
} as const;

/** Locales that use Arabic-script UI type (Noto Sans Arabic). */
const ARABIC_SCRIPT_LOCALES = new Set<ContentLocale>(['ar', 'ur']);

/** Arabic + presentation forms blocks used for mixed-script question content. */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type FontRole =
  | 'body'
  | 'bodyMedium'
  | 'bodySemibold'
  | 'bodyBold'
  | 'display'
  | 'displayBold';

const BRAND_TO_ARABIC: Record<string, string> = {
  [BRAND_FACE.display]: ARABIC_FONTS.display,
  [BRAND_FACE.displayBold]: ARABIC_FONTS.displayBold,
  [BRAND_FACE.ui]: ARABIC_FONTS.ui,
  [BRAND_FACE.uiMedium]: ARABIC_FONTS.uiMedium,
  [BRAND_FACE.uiSemibold]: ARABIC_FONTS.uiSemibold,
  [BRAND_FACE.uiBold]: ARABIC_FONTS.uiBold,
};

let activeUiLocale: ContentLocale = 'en';
let flattenPatched = false;
let originalFlatten: typeof StyleSheet.flatten | null = null;

export function usesArabicScriptFont(locale: ContentLocale): boolean {
  return ARABIC_SCRIPT_LOCALES.has(locale);
}

export function containsArabicScript(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  return ARABIC_SCRIPT_RE.test(text);
}

/** True when locale or visible copy needs Noto Sans Arabic (ar/ur UI or Arabic letters in text). */
export function contentUsesArabicScriptFont(
  locale: ContentLocale,
  content?: string | null
): boolean {
  return usesArabicScriptFont(locale) || containsArabicScript(content);
}

export function setActiveUiFontLocale(locale: ContentLocale): void {
  activeUiLocale = locale;
}

export function getActiveUiFontLocale(): ContentLocale {
  return activeUiLocale;
}

export function getArabicFontFamily(role: FontRole = 'body'): string {
  switch (role) {
    case 'display':
      return ARABIC_FONTS.display;
    case 'displayBold':
      return ARABIC_FONTS.displayBold;
    case 'bodyMedium':
      return ARABIC_FONTS.uiMedium;
    case 'bodySemibold':
      return ARABIC_FONTS.uiSemibold;
    case 'bodyBold':
      return ARABIC_FONTS.uiBold;
    case 'body':
    default:
      return ARABIC_FONTS.ui;
  }
}

export function getBrandFontFamily(role: FontRole = 'body'): string {
  // Prefer FONTS so web keeps the Arabic-capable CSS stack; native is the short name.
  switch (role) {
    case 'display':
      return FONTS.display;
    case 'displayBold':
      return FONTS.displayBold;
    case 'bodyMedium':
      return FONTS.uiMedium;
    case 'bodySemibold':
      return FONTS.uiSemibold;
    case 'bodyBold':
      return FONTS.uiBold;
    case 'body':
    default:
      return FONTS.ui;
  }
}

/**
 * Map a brand (or already-script) fontFamily string to the face that should
 * render for the given locale. Unknown families (icon fonts, system names)
 * are left unchanged.
 */
export function remapFontFamilyForLocale(
  fontFamily: string | undefined,
  locale: ContentLocale
): string | undefined {
  if (!fontFamily) {
    return fontFamily;
  }

  if (!usesArabicScriptFont(locale)) {
    return fontFamily;
  }

  // Exact brand key
  const exact = BRAND_TO_ARABIC[fontFamily];
  if (exact) {
    return exact;
  }

  // Web CSS stack: "GeneralSans-Regular, NotoSansArabic_400Regular, sans-serif"
  const primary = fontFamily.split(',')[0]?.trim();
  if (primary && BRAND_TO_ARABIC[primary]) {
    return BRAND_TO_ARABIC[primary];
  }

  // Already a Noto Arabic face (or other non-brand) — keep as-is
  return fontFamily;
}

/**
 * Install a StyleSheet.flatten patch so every Text style that uses a brand
 * face is rewritten to Noto Sans Arabic while the UI locale needs Arabic
 * script. Safe to call multiple times. Icon / system font families are not
 * remapped.
 */
export function installLocaleFontRemap(): void {
  if (flattenPatched) {
    return;
  }
  flattenPatched = true;
  originalFlatten = StyleSheet.flatten.bind(StyleSheet);

  StyleSheet.flatten = ((style: Parameters<typeof StyleSheet.flatten>[0]) => {
    const flat = originalFlatten!(style);
    if (!flat || typeof flat !== 'object') {
      return flat;
    }

    const fontFamily = (flat as { fontFamily?: string }).fontFamily;
    if (!fontFamily || !usesArabicScriptFont(activeUiLocale)) {
      return flat;
    }

    const remapped = remapFontFamilyForLocale(fontFamily, activeUiLocale);
    if (!remapped || remapped === fontFamily) {
      return flat;
    }

    return { ...flat, fontFamily: remapped };
  }) as typeof StyleSheet.flatten;
}

/** Test helper — restore StyleSheet.flatten after installLocaleFontRemap. */
export function uninstallLocaleFontRemapForTests(): void {
  if (!flattenPatched || !originalFlatten) {
    return;
  }
  StyleSheet.flatten = originalFlatten;
  flattenPatched = false;
  originalFlatten = null;
}

/**
 * Platform system face when we intentionally avoid brand fonts but have no
 * bundled script face (Hindi, Bengali, Simplified Chinese, etc.).
 */
export function getPlatformSystemFontFamily(
  role: FontRole,
  platformOS: string
): string | undefined {
  if (platformOS === 'android') {
    if (role === 'bodyMedium' || role === 'bodySemibold' || role === 'bodyBold') {
      return 'sans-serif-medium';
    }
    return 'sans-serif';
  }

  if (platformOS === 'web') {
    // Explicit stack so CSS can pick a face with the needed script coverage.
    if (role === 'display' || role === 'displayBold') {
      return 'system-ui, "Segoe UI", Roboto, "Noto Sans", "PingFang SC", "Noto Sans Devanagari", sans-serif';
    }
    return 'system-ui, "Segoe UI", Roboto, "Noto Sans", "PingFang SC", "Noto Sans Devanagari", sans-serif';
  }

  // iOS: omit custom family so SF Pro / language-appropriate system face is used.
  // Callers must not leave a prior brand fontFamily in the style array when this
  // returns undefined — prefer placing getTextStyle() last, or use remap patch.
  return undefined;
}

export function resolveLocaleFontFamily(
  locale: ContentLocale,
  role: FontRole = 'body',
  platformOS: string
): string | undefined {
  if (usesArabicScriptFont(locale)) {
    return getArabicFontFamily(role);
  }

  if (usesSystemFonts(locale)) {
    return getPlatformSystemFontFamily(role, platformOS);
  }

  return getBrandFontFamily(role);
}

export function resolveContentFontFamily(
  locale: ContentLocale,
  content: string | null | undefined,
  role: FontRole = 'body',
  platformOS: string
): string | undefined {
  if (contentUsesArabicScriptFont(locale, content)) {
    return getArabicFontFamily(role);
  }

  return resolveLocaleFontFamily(locale, role, platformOS);
}

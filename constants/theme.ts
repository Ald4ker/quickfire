/**
 * Visual system tokens - aligned with docs/BRAND_GUIDELINES.md
 * (Electric Blue, Lively Orange, Vivid Purple; Clash Display + General Sans).
 */

import { Platform } from 'react-native';

/**
 * PostScript keys registered in app/_layout.tsx via expo-font.
 * Latin brand faces only — Arabic/Urdu UI remaps to Noto Sans Arabic
 * (see lib/i18n/fonts.ts + useFonts in app/_layout.tsx).
 *
 * On web, brand faces are stacked with Noto Sans Arabic so Arabic codepoints
 * still render when a style only references Clash/General Sans (static CSS
 * classes often skip StyleSheet.flatten remapping).
 */
const NotoUi = 'NotoSansArabic_400Regular';
const NotoMedium = 'NotoSansArabic_500Medium';
const NotoSemibold = 'NotoSansArabic_600SemiBold';
const NotoBold = 'NotoSansArabic_700Bold';

/** Face names as registered with expo-font (short names on every platform). */
export const BRAND_FONT_FACES = {
  display: 'ClashDisplay-Semibold',
  displayBold: 'ClashDisplay-Bold',
  ui: 'GeneralSans-Regular',
  uiMedium: 'GeneralSans-Medium',
  uiSemibold: 'GeneralSans-Semibold',
  uiBold: 'GeneralSans-Bold',
} as const;
const brandFonts = BRAND_FONT_FACES;

export const FONTS =
  Platform.OS === 'web'
    ? ({
        display: `${brandFonts.display}, ${NotoSemibold}, sans-serif`,
        displayBold: `${brandFonts.displayBold}, ${NotoBold}, sans-serif`,
        ui: `${brandFonts.ui}, ${NotoUi}, sans-serif`,
        uiMedium: `${brandFonts.uiMedium}, ${NotoMedium}, sans-serif`,
        uiSemibold: `${brandFonts.uiSemibold}, ${NotoSemibold}, sans-serif`,
        uiBold: `${brandFonts.uiBold}, ${NotoBold}, sans-serif`,
      } as const)
    : brandFonts;

/** Brand primary - Electric Blue (single source for primary + page background) */
const BRAND_PRIMARY = '#007BFF' as const;

export const COLORS = {
  /** Primary accent - Electric Blue */
  primary: BRAND_PRIMARY,
  /** Secondary brand - Lively Orange */
  secondary: '#FF8C00',
  /** Utility - Vivid Purple (settings, profile accents) */
  tertiary: '#A18FFC',
  /** Darker blue for emphasis / continue CTAs */
  accent: '#0056B3',
  /** Page chrome - default app shell (light) */
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#0F172A',

  mutedText: '#475569',
  border: '#D4E5FA',
  disabled: '#94A3B8',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
  info: '#0EA5E9',

  unansweredTile: '#E8F4FF',
  activeTile: BRAND_PRIMARY,
  activeTileText: '#FFFFFF',
  usedTile: '#CBD5E1',
  correctAnswer: '#16A34A',
  incorrectAnswer: '#DC2626',
  wagerMode: '#0056B3',
  hotSeat: '#A18FFC',
  overtimeSurge: '#FF8C00',

  timerNormal: BRAND_PRIMARY,
  timerWarning: '#F59E0B',
  timerDanger: '#DC2626',
  timerRing: '#D4E5FA',

  /** Full-screen modal scrim - charcoal brand dim (matches Soft UI #333). */
  overlay: 'rgba(51, 51, 51, 0.45)',
  cardShadow: 'rgba(0, 123, 255, 0.12)',
  modalShadow: 'rgba(15, 23, 42, 0.18)',
  activeTileGlow: 'rgba(255, 140, 0, 0.22)',
};

export const GRADIENTS = {
  primary: ['#007BFF', '#3D9FFF'],
  wager: ['#0056B3', '#007BFF'],
  premium: ['#0F172A', '#0056B3'],
};

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

const displaySemibold = {
  fontFamily: FONTS.display,
} as const;
const displayBold = {
  fontFamily: FONTS.displayBold,
} as const;
const ui = {
  fontFamily: FONTS.ui,
} as const;
const uiMedium = {
  fontFamily: FONTS.uiMedium,
} as const;
const uiSemibold = {
  fontFamily: FONTS.uiSemibold,
} as const;

export const TYPE_SCALE = {
  displayXL: { fontSize: 40, lineHeight: 48, ...displayBold },
  displayL: { fontSize: 32, lineHeight: 40, ...displayBold },
  h1: { fontSize: 28, lineHeight: 34, ...displaySemibold },
  h2: { fontSize: 24, lineHeight: 30, ...displaySemibold },
  h3: { fontSize: 20, lineHeight: 26, ...displaySemibold },
  bodyL: { fontSize: 18, lineHeight: 28, ...ui },
  bodyM: { fontSize: 16, lineHeight: 24, ...ui },
  bodyS: { fontSize: 14, lineHeight: 20, ...ui },
  caption: { fontSize: 12, lineHeight: 16, ...uiMedium },
  button: { fontSize: 16, lineHeight: 20, ...uiSemibold },
  scoreNumber: { fontSize: 32, lineHeight: 36, ...displayBold },
  /** UI labels / caplines - General Sans, uppercase at use site */
  labelCap: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    ...uiSemibold,
  },
};

export const SPACING = {
  unit: 8,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
};

/**
 * Standard raised control - flat white face (no bevel lips / hard gray strip shadows).
 * Use for admin chrome, settings-style actions, and cards on cream canvas.
 */
export const BRAND_RAISED_SURFACE = {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  borderTopWidth: 0,
  borderTopColor: 'transparent',
  borderBottomWidth: 0,
  borderBottomColor: 'transparent',
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
} as const;

/** Table / list chrome on warm canvas (admin, settings-style lists) */
export const BRAND_ADMIN_TABLE = {
  rowDivider: 'rgba(51, 51, 51, 0.08)',
  headerBackground: '#F5F3EE',
  inputBackground: '#FFFCF8',
  inputBorder: 'rgba(51, 51, 51, 0.12)',
} as const;

/** Soft, bubbly radii - cards and chrome read round / “sticker” cartoon */
export const BORDER_RADIUS = {
  sm: 16,
  md: 26,
  lg: 34,
  /** Large panels, hub tiles, category strips */
  xl: 42,
  tile: 28,
  modal: 44,
  /**
   * Standard control / action button corner - rounded square (squircle), not capsule.
   * Matches docs/BRAND_GUIDELINES.md “Standard button surface” (14).
   */
  button: 14,
  /**
   * Alias of `button` for legacy call sites. Was capsule (999); do not use for full pills.
   * For true circles (avatars), use half the element size explicitly.
   */
  pill: 14,
};

/** Card shadows — flat by default (no gray strip under cards). Glow kept for active tiles. */
export const SHADOWS = {
  card: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  modal: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  activeTileGlow: {
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  /** Wide web / desktop layouts (categories, board web branch) */
  wide: 900,
  landscape: 1024,
};

/** Shared horizontal bounds and content columns on wide viewports */
export const LAYOUT = {
  /** Single-column flows (auth, forms) - alias of formMaxWidth */
  contentMaxWidth: 560,
  /** Auth / settings / form columns */
  formMaxWidth: 560,
  /** Home hub mode row + matching header bar */
  hubMaxWidth: 1250,
  /** Board-class play chrome (question/board center column) */
  playMaxWidth: 1120,
  /** Categories-class grids on wide web */
  playWideMaxWidth: 1400,
  /** Quick-length / single-column setup panels */
  setupMaxWidth: 960,
  /** Horizontal inset for primary column content */
  screenGutter: SPACING.lg,
} as const;

/** Large surface radius (auth card, modals) */
export const AUTH_CARD_RADIUS = 48;

/**
 * Shared header height / spacing tokens - one system per platform.
 * Used by <GameHeader /> and all screens that position content below the header.
 *
 * Values are platform-aware defaults; the GameHeader component applies the correct
 * one based on `Platform.OS` so every page gets consistent header measurements.
 *
 * - `height`       - bar height (left/center/right row). Native: 56, Web: 64
 * - `topPadding`   - base pad above the header bar. Native: sm(8), Web: md(12)
 * - `topExtra`     - extra breathing room under the top edge for non-home screens
 * - `bottomGap`    - gap below the full header (bar + subtitle) before main content
 * - `titleBelowGap` - gap between logo bottom and title text (when both shown)
 *
 * Home hub uses `topPadding` alone (plus its own frame pad). Every other screen
 * uses `getStandardChromeTopPadding()` / `getChromeTopPaddingWithInsets()` so
 * chrome matches the play question screen.
 */
export const HEADER = {
  heightNative: 56,
  heightWeb: 64,
  topPaddingNative: SPACING.sm,
  topPaddingWeb: SPACING.md,
  /** Extra gap under the top edge for non-home chrome (question-screen match). */
  topExtra: SPACING.md,
  bottomGap: SPACING.md,
  titleBelowGap: SPACING.xs,
} as const;

/**
 * Padding below the safe-area top (or viewport top when top safe-area is already
 * applied) for all non-home screens. Matches play question chrome.
 */
export function getStandardChromeTopPadding(isWeb = false): number {
  return (isWeb ? HEADER.topPaddingWeb : HEADER.topPaddingNative) + HEADER.topExtra;
}

/**
 * Full top chrome pad when the screen does **not** use SafeAreaView `top` edge
 * and must account for device inset manually (e.g. question, board).
 */
export function getChromeTopPaddingWithInsets(safeAreaTop: number, isWeb = false): number {
  return Math.max(0, safeAreaTop) + getStandardChromeTopPadding(isWeb);
}

export type ThemePaletteId = 'default' | 'warm' | 'cool' | 'green' | 'red' | 'dark';

export const FONT_SIZES = {
  xs: TYPE_SCALE.labelCap.fontSize,
  sm: TYPE_SCALE.bodyS.fontSize,
  md: TYPE_SCALE.bodyM.fontSize,
  lg: TYPE_SCALE.bodyL.fontSize,
  xl: TYPE_SCALE.h3.fontSize,
  xxl: TYPE_SCALE.h2.fontSize,
  xxxl: TYPE_SCALE.h1.fontSize,
};

export const PALETTES = {
  default: {
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    tertiary: COLORS.tertiary,
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    background: COLORS.background,
    backgroundSecondary: COLORS.surface,
    text: COLORS.text,
    textSecondary: COLORS.mutedText,
    textOnBackground: COLORS.text,
    textSecondaryOnBackground: COLORS.mutedText,
    border: COLORS.border,
    cardBackground: COLORS.surface,
    boardCell: COLORS.unansweredTile,
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: COLORS.usedTile,
    shadow: COLORS.cardShadow,
  },
  warm: {
    primary: '#FF8C00',
    secondary: '#007BFF',
    tertiary: '#A18FFC',
    background: '#FFF4E5',
    text: '#2C1A00',
    cardBackground: '#FFFFFF',
    textSecondary: '#5C4000',
    textOnBackground: '#2C1A00',
    textSecondaryOnBackground: '#5C4000',
    border: '#FFD199',
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    backgroundSecondary: '#FFFFFF',
    boardCell: COLORS.unansweredTile,
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: COLORS.usedTile,
    shadow: COLORS.cardShadow,
  },
  cool: {
    primary: '#5856D6',
    secondary: '#FF8C00',
    tertiary: '#A18FFC',
    background: '#F5F5FF',
    text: '#1C1C1E',
    cardBackground: '#FFFFFF',
    textSecondary: '#3A3A3C',
    textOnBackground: '#1C1C1E',
    textSecondaryOnBackground: '#3A3A3C',
    border: '#D1D1F7',
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    backgroundSecondary: '#FFFFFF',
    boardCell: COLORS.unansweredTile,
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: COLORS.usedTile,
    shadow: COLORS.cardShadow,
  },
  green: {
    primary: '#28CD41',
    secondary: '#007BFF',
    tertiary: '#A18FFC',
    background: '#F0FFF4',
    text: '#062D12',
    cardBackground: '#FFFFFF',
    textSecondary: '#1C4527',
    textOnBackground: '#062D12',
    textSecondaryOnBackground: '#1C4527',
    border: '#C6F6D5',
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    backgroundSecondary: '#FFFFFF',
    boardCell: COLORS.unansweredTile,
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: COLORS.usedTile,
    shadow: COLORS.cardShadow,
  },
  red: {
    primary: '#FF3B30',
    secondary: '#FF8C00',
    tertiary: '#A18FFC',
    background: '#FFF5F5',
    text: '#2D0606',
    cardBackground: '#FFFFFF',
    textSecondary: '#451C1C',
    textOnBackground: '#2D0606',
    textSecondaryOnBackground: '#451C1C',
    border: '#FED7D7',
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    backgroundSecondary: '#FFFFFF',
    boardCell: COLORS.unansweredTile,
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: COLORS.usedTile,
    shadow: COLORS.cardShadow,
  },
  dark: {
    primary: '#4DA3FF',
    secondary: '#FF9F43',
    tertiary: '#B4A7FF',
    background: '#07111F',
    text: '#F7FAFF',
    cardBackground: '#111E2E',
    textSecondary: '#B8C7D9',
    textOnBackground: '#F7FAFF',
    textSecondaryOnBackground: '#B8C7D9',
    border: '#29405C',
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    backgroundSecondary: '#17263A',
    boardCell: '#17263A',
    boardCellActive: COLORS.activeTile,
    boardCellActiveText: COLORS.activeTileText,
    boardCellUsed: '#22334A',
    shadow: 'rgba(0, 5, 15, 0.58)',
  },
} as const satisfies Record<ThemePaletteId, Record<string, string>>;

/** sRGB luminance in 0–1; used for status bar and contrast heuristics */
export function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '');
  if (n.length !== 6) return 1;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light status-bar content (white icons) on darker page backgrounds */
export function paletteUsesLightStatusBarContent(id: ThemePaletteId): boolean {
  return relativeLuminance(PALETTES[id].background) < 0.55;
}

/**
 * Shared raised-surface face treatment.
 * Flat face (no top lip / gray bottom strip); depth comes from `softSurfaceLift` only.
 */
export const SOFT_SURFACE_FACE = {
  borderTopWidth: 0,
  borderTopColor: 'transparent',
  borderBottomWidth: 0,
  borderBottomColor: 'transparent',
} as const;

/**
 * Shared card/control lift — flat (no hard gray strip under the face).
 * Kept as a function so call sites stay stable if soft depth is reintroduced later.
 */
export function softSurfaceLift(): Pick<ReturnType<typeof import('react-native').StyleSheet.create>, never> & {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
} {
  return {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
}

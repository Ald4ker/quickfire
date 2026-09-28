/**
 * Round 2 colour and type tokens. One neutral white and grey scheme with a dark
 * counterpart, plus three reserved meanings:
 *  - right / wrong: green and red, used only for adjudication and the recap;
 *  - ink: black in light mode for "Show answer" and the answer box. In dark mode
 *    ink inverts to near-white so the answer stays the brightest thing on screen.
 */
import { Platform } from 'react-native';
import { FONTS } from '@/constants/theme';
import { useThemeStore } from '@/store/theme';

export type R2Colors = {
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  faint: string;
  ink: string;
  onInk: string;
  inkMuted: string;
  right: string;
  rightSoft: string;
  onRight: string;
  wrong: string;
  wrongSoft: string;
  onWrong: string;
  shadow: string;
  scrim: string;
};

const LIGHT: R2Colors = {
  bg: '#F3F3F4',
  bgDeep: '#E7E7E9',
  surface: '#FFFFFF',
  surface2: '#EDEDEF',
  surface3: '#DCDCDF',
  line: 'rgba(17, 17, 19, 0.10)',
  lineStrong: 'rgba(17, 17, 19, 0.22)',
  text: '#111113',
  muted: '#5F5F66',
  faint: '#9B9BA2',
  ink: '#0B0B0C',
  onInk: '#FFFFFF',
  inkMuted: 'rgba(255, 255, 255, 0.62)',
  right: '#1E9A52',
  rightSoft: '#E2F4E9',
  onRight: '#FFFFFF',
  wrong: '#D3352D',
  wrongSoft: '#FBE5E3',
  onWrong: '#FFFFFF',
  shadow: 'rgba(17, 17, 19, 0.14)',
  scrim: 'rgba(17, 17, 19, 0.38)',
};

const DARK: R2Colors = {
  bg: '#0F0F10',
  bgDeep: '#080809',
  surface: '#1A1A1C',
  surface2: '#242427',
  surface3: '#34343A',
  line: 'rgba(255, 255, 255, 0.10)',
  lineStrong: 'rgba(255, 255, 255, 0.24)',
  text: '#F4F4F5',
  muted: '#A6A6AD',
  faint: '#6E6E75',
  ink: '#F4F4F5',
  onInk: '#0B0B0C',
  inkMuted: 'rgba(11, 11, 12, 0.6)',
  right: '#35C274',
  rightSoft: 'rgba(53, 194, 116, 0.16)',
  onRight: '#06170D',
  wrong: '#F05A50',
  wrongSoft: 'rgba(240, 90, 80, 0.16)',
  onWrong: '#1D0605',
  shadow: 'rgba(0, 0, 0, 0.5)',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const R2_FONTS = {
  display: FONTS.displayBold,
  displaySemi: FONTS.display,
  ui: FONTS.ui,
  uiMedium: FONTS.uiMedium,
  uiSemi: FONTS.uiSemibold,
  uiBold: FONTS.uiBold,
  /** System serif for the Editorial direction (no new font files). */
  serif: Platform.select({
    web: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    ios: 'Georgia',
    default: 'serif',
  }) as string,
};

export function getR2Colors(isDark: boolean): R2Colors {
  return isDark ? DARK : LIGHT;
}

/** Light or dark follows the existing Settings toggle ("dark" palette). */
export function useR2Theme() {
  const isDark = useThemeStore((state) => state.paletteId === 'dark');
  return { c: getR2Colors(isDark), isDark, f: R2_FONTS };
}

export const TABULAR = { fontVariant: ['tabular-nums' as const] };

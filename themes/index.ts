import homeSoftUi from './home-soft-ui.json';
import { PALETTES, relativeLuminance } from '@/constants/theme';
import { useThemeStore } from '@/store/theme';
import { getStudioDirection, type StudioDirection } from '@/constants/studio';

/** The studio direction for the selected palette, or null for shipped palettes. */
export function getCurrentStudioDirection(): StudioDirection | null {
  return getStudioDirection(useThemeStore.getState().paletteId);
}

export type HomeSoftUiTheme = typeof homeSoftUi;

type HomeSoftUiColors = HomeSoftUiTheme['colors'];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getSoftUiColors(): HomeSoftUiColors {
  const paletteId = useThemeStore.getState().paletteId;
  if (paletteId === 'default') {
    return homeSoftUi.colors;
  }

  const studio = getStudioDirection(paletteId);
  if (studio) {
    const c = studio.colors;
    return {
      ...homeSoftUi.colors,
      canvas: c.canvas,
      surface: c.surface,
      textPrimary: c.text,
      textMuted: c.textMuted,
      accentGlow: c.cta,
      accentGlowMid: c.turn,
      accentGlowTransparent: rgba(c.cta.startsWith('#') ? c.cta : '#000000', 0.24),
      shadow: studio.depth.shadowColor,
      shadowStrong: studio.depth.shadowColor,
      resumeAccent: c.cta,
      resumeAccentSoft: c.hairline,
    };
  }

  const palette = PALETTES[paletteId] ?? PALETTES.default;
  const isDark = relativeLuminance(palette.background) < 0.3;

  return {
    ...homeSoftUi.colors,
    canvas: palette.background,
    surface: palette.cardBackground,
    textPrimary: palette.textOnBackground,
    textMuted: rgba(palette.textSecondaryOnBackground, isDark ? 0.78 : 0.62),
    accentGlow: palette.primary,
    accentGlowMid: palette.secondary,
    accentGlowTransparent: rgba(palette.primary, isDark ? 0.34 : 0.24),
    shadow: isDark ? 'rgba(0, 0, 0, 0.36)' : palette.shadow,
    shadowStrong: isDark ? 'rgba(0, 0, 0, 0.48)' : palette.shadow,
    resumeAccent: palette.primary,
    resumeAccentSoft: rgba(palette.primary, isDark ? 0.24 : 0.14),
  };
}

// SAFETY: Proxy implements the HomeSoftUiColors surface via getSoftUiColors().
const dynamicColors = new Proxy(homeSoftUi.colors, {
  get(_target, prop: keyof HomeSoftUiColors) {
    return getSoftUiColors()[prop];
  },
}) as HomeSoftUiColors;

/**
 * JSON design tokens for the neumorphic app chrome.
 *
 * `colors` are dynamic: they resolve through the selected palette in the theme
 * store, so existing `HOME_SOFT_UI.colors.*` reads update after using the theme
 * picker without rewriting every soft-ui consumer.
 */
export const HOME_SOFT_UI: HomeSoftUiTheme = {
  ...homeSoftUi,
  colors: dynamicColors,
};

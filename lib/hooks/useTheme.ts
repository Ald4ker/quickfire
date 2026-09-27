import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme';
import { PALETTES, type ThemePaletteId } from '@/constants/theme';
import { isDarkPaletteId } from '@/constants/studio';

export type ThemePalette = (typeof PALETTES)[ThemePaletteId];

const DARK_MODE_FLAT_TOP = {
  borderTopWidth: 0,
  borderTopColor: 'transparent',
} as const;

/** Removes light raised-surface highlights while preserving light-mode styling. */
export function useDarkModeFlatTop() {
  return useThemeStore((state) => isDarkPaletteId(state.paletteId))
    ? DARK_MODE_FLAT_TOP
    : undefined;
}

/**
 * Returns the current theme palette. Call hydrate() once at app root (e.g. in _layout) before first render.
 */
export function useTheme(): ThemePalette {
  const paletteId = useThemeStore((s) => s.paletteId);
  return PALETTES[paletteId];
}

/**
 * Returns palette id and setter for theme picker.
 */
export function useThemePicker() {
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  return { paletteId, setPalette };
}

/**
 * Call once at app root to load persisted theme from storage.
 */
export function useThemeHydration() {
  const hydrate = useThemeStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
}

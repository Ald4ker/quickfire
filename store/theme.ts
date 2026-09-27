import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ThemePaletteId } from '@/constants/theme';
import { PALETTES } from '@/constants/theme';
import { isStudioDirectionId, setActiveStudioDirection } from '@/constants/studio';

/**
 * Palettes a player can actually select: the shipped default, dark, and the
 * studio directions (TASK-040 preview). Legacy colour palettes fold to default.
 */
function normalizePaletteId(id: string | null | undefined): ThemePaletteId {
  if (id === 'dark') return 'dark';
  if (isStudioDirectionId(id)) return id;
  return 'default';
}

const THEME_STORAGE_KEY = 'backfire-theme-palette';

async function getStoredTheme(): Promise<string | null> {
  if (Platform.OS === 'web' && globalThis.localStorage) {
    return globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(THEME_STORAGE_KEY);
}

async function setStoredTheme(id: ThemePaletteId): Promise<void> {
  if (Platform.OS === 'web' && globalThis.localStorage) {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, id);
    return;
  }
  await SecureStore.setItemAsync(THEME_STORAGE_KEY, id);
}

interface ThemeStore {
  paletteId: ThemePaletteId;
  setPalette: (id: ThemePaletteId) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  paletteId: 'default',

  setPalette: (id) => {
    const paletteId = normalizePaletteId(id);
    setActiveStudioDirection(paletteId);
    set({ paletteId });
    void setStoredTheme(paletteId).catch(() => {
      // Ignore storage errors; the in-memory theme still updates immediately.
    });
  },

  hydrate: async () => {
    try {
      const stored = await getStoredTheme();
      if (stored && stored in PALETTES) {
        const paletteId = normalizePaletteId(stored);
        setActiveStudioDirection(paletteId);
        set({ paletteId });
      }
    } catch {
      // Ignore storage errors, keep default
    }
  },
}));

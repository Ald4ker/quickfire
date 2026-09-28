import { useEffect } from 'react';
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_UI_LOCALE,
  EMPTY_CONTENT_LOCALES,
  contentLocalePriorityToArray,
  isSupportedLocale,
  normalizeContentLocales,
  type ContentLocalePriority,
  type NonEnglishContentLocale,
  type SupportedLocale,
} from '@/lib/i18n/config';

const UI_LOCALE_STORAGE_KEY = 'backfire-ui-locale';
const CONTENT_LOCALE_STORAGE_KEY = 'backfire-content-locales';

async function getStoredLocaleItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && globalThis.localStorage) {
    return globalThis.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStoredLocaleItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && globalThis.localStorage) {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

/** Index of a content language slot: 0 = primary (shown first), 1 = secondary (shown beneath). */
export type ContentLocaleSlot = 0 | 1;

/**
 * Stored content preferences from older builds may carry a third `tertiary` slot and locale codes
 * that were UI-derived. Read every slot back in order; `normalizeContentLocales` keeps the first
 * two valid content locales, so nothing valid is lost from the two slots that are shown.
 */
type StoredContentLocales = Partial<Record<'primary' | 'secondary' | 'tertiary', string | null>>;

interface LocaleStore {
  uiLocale: SupportedLocale;
  contentLocales: ContentLocalePriority;
  hasExplicitUiSelection: boolean;
  hasExplicitContentSelection: boolean;
  setUiLocale: (locale: SupportedLocale) => void;
  setContentLocales: (locales: NonEnglishContentLocale[]) => void;
  moveContentLocale: (from: ContentLocaleSlot, to: ContentLocaleSlot) => void;
  hydrate: () => Promise<void>;
}

export const useLocaleStore = create<LocaleStore>((set, get) => ({
  uiLocale: DEFAULT_UI_LOCALE,
  contentLocales: EMPTY_CONTENT_LOCALES,
  hasExplicitUiSelection: false,
  hasExplicitContentSelection: false,

  setUiLocale: (locale) => {
    set({ uiLocale: locale, hasExplicitUiSelection: true });
    void setStoredLocaleItem(UI_LOCALE_STORAGE_KEY, locale).catch(() => {
      // Ignore storage errors; in-memory locale still updates.
    });
  },

  setContentLocales: (locales) => {
    const normalized = normalizeContentLocales(locales);
    set({
      contentLocales: normalized,
      hasExplicitContentSelection: locales.length > 0,
    });
    void setStoredLocaleItem(
      CONTENT_LOCALE_STORAGE_KEY,
      JSON.stringify(normalized)
    ).catch(() => {
      // Ignore storage errors; in-memory state still updates.
    });
  },

  moveContentLocale: (from, to) => {
    const current = get().contentLocales;
    const next = contentLocalePriorityToArray(current);
    const [item] = next.splice(from, 1);

    if (!item) {
      return;
    }

    next.splice(to, 0, item);
    get().setContentLocales(next);
  },

  hydrate: async () => {
    try {
      const [storedUiLocale, storedContentLocales] = await Promise.all([
        getStoredLocaleItem(UI_LOCALE_STORAGE_KEY),
        getStoredLocaleItem(CONTENT_LOCALE_STORAGE_KEY),
      ]);

      if (storedUiLocale && isSupportedLocale(storedUiLocale)) {
        set({
          uiLocale: storedUiLocale,
          hasExplicitUiSelection: true,
        });
      }

      if (storedContentLocales) {
        // SAFETY: payload shape is re-validated by normalizeContentLocales.
        const parsed = JSON.parse(storedContentLocales) as StoredContentLocales;
        const normalized = normalizeContentLocales([
          parsed.primary,
          parsed.secondary,
          parsed.tertiary,
        ]);

        set({
          contentLocales: normalized,
          hasExplicitContentSelection: Boolean(normalized.primary || normalized.secondary),
        });
      }
    } catch {
      // Ignore hydration failures and keep defaults.
    }
  },
}));

export function useLocaleHydration() {
  const hydrate = useLocaleStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
}

/**
 * UI round 2 (TASK-040, preview only). Three layout directions that replace the
 * render of the key screens (home, team setup, board, question and answer,
 * results) while reusing each screen's own logic and store actions.
 *
 * Gate: available only in development builds or when EXPO_PUBLIC_UI_ROUND2=1.
 * In any other build `useRound2Direction()` always returns null, so players see
 * exactly the shipped screens.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export const ROUND2_DIRECTION_IDS = ['broadcast', 'editorial', 'tabletop'] as const;
export type Round2DirectionId = (typeof ROUND2_DIRECTION_IDS)[number];

export const ROUND2_LABELS: Record<Round2DirectionId, string> = {
  broadcast: 'Broadcast',
  editorial: 'Editorial',
  tabletop: 'Tabletop',
};

export const ROUND2_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_UI_ROUND2 === '1';

const STORAGE_KEY = 'backfire-ui-direction';

export function isRound2DirectionId(id: unknown): id is Round2DirectionId {
  return typeof id === 'string' && (ROUND2_DIRECTION_IDS as readonly string[]).includes(id);
}

function readInitial(): Round2DirectionId | null {
  if (!ROUND2_ENABLED) return null;
  if (Platform.OS === 'web' && globalThis.localStorage) {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return isRound2DirectionId(stored) ? stored : null;
  }
  return null;
}

type Round2Store = {
  directionId: Round2DirectionId | null;
  setDirection: (id: Round2DirectionId | null) => void;
};

export const useRound2Store = create<Round2Store>((set) => ({
  directionId: readInitial(),
  setDirection: (id) => {
    if (!ROUND2_ENABLED) return;
    set({ directionId: id });
    try {
      if (Platform.OS === 'web' && globalThis.localStorage) {
        if (id) globalThis.localStorage.setItem(STORAGE_KEY, id);
        else globalThis.localStorage.removeItem(STORAGE_KEY);
      } else if (id) {
        void SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => {});
      } else {
        void SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
      }
    } catch {
      // Storage is best effort; the in-memory choice still applies.
    }
  },
}));

if (ROUND2_ENABLED && Platform.OS !== 'web') {
  void SecureStore.getItemAsync(STORAGE_KEY)
    .then((stored) => {
      if (isRound2DirectionId(stored)) useRound2Store.setState({ directionId: stored });
    })
    .catch(() => {});
}

/** The active round 2 direction, or null (always null outside the preview gate). */
export function useRound2Direction(): Round2DirectionId | null {
  const id = useRound2Store((state) => state.directionId);
  return ROUND2_ENABLED ? id : null;
}

export function getRound2Direction(): Round2DirectionId | null {
  return ROUND2_ENABLED ? useRound2Store.getState().directionId : null;
}

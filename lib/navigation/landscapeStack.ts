import { Platform } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { immersiveStatusBarScreenOptions } from '@/lib/navigation/statusBar';
import { HOME_SOFT_UI } from '@/themes';
import { getActiveStudioDirection } from '@/constants/studio';

const webSafeStack: NativeStackNavigationOptions =
  Platform.OS === 'web'
    ? {
        /** Avoid native-gesture / animation combos that can error on react-native-web. */
        animation: 'fade',
      }
    : {
        /**
         * Fade matches root stack. Pair with themed `contentStyle` — the native
         * stack defaults to white under fades, which flashes every board↔question turn.
         */
        animation: 'fade',
        gestureDirection: 'horizontal',
        fullScreenGestureEnabled: true,
      };

/**
 * Native stack defaults for a landscape-only app: card transitions and horizontal
 * swipe-back only (no modal slide-from-bottom).
 *
 * Always paint `contentStyle` with the soft-UI canvas (cream / dark). Fade
 * animations otherwise show the RNScreens default white container between screens.
 */
export function getLandscapeStackScreenOptions(
  backgroundColor: string = HOME_SOFT_UI.colors.canvas
): NativeStackNavigationOptions {
  return {
    headerShown: false,
    presentation: 'card',
    // Omit statusBarHidden in Expo Go — RNScreens redboxes without VC-based status bar plist.
    // Standalone/dev-client: keep system bar hidden on every native-stack push.
    ...immersiveStatusBarScreenOptions(),
    ...webSafeStack,
    // Studio directions (TASK-040) may choose a different native transition.
    ...(Platform.OS !== 'web' && getActiveStudioDirection()
      ? { animation: getActiveStudioDirection()!.motion.stackAnimation }
      : null),
    contentStyle: {
      flex: 1,
      backgroundColor,
    },
  };
}

/**
 * Static defaults. Prefer `getLandscapeStackScreenOptions(canvas)` in layouts that
 * re-render on palette change so dark mode stays in sync.
 */
export const landscapeStackScreenOptions: NativeStackNavigationOptions =
  getLandscapeStackScreenOptions();

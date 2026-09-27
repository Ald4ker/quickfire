import { StyleSheet, type ViewStyle } from 'react-native';
import { getActiveStudioDirection, studioLift } from '@/constants/studio';

/** Flat face — no bevel lips / gray strips; depth comes from `softSurfaceLift` only. */
export const SOFT_SURFACE_FACE: ViewStyle = {
  borderTopWidth: 0,
  borderTopColor: 'transparent',
  borderBottomWidth: 0,
  borderBottomColor: 'transparent',
};

/**
 * Shared card/control lift — flat (no hard gray strip under the face).
 * Call sites stay stable if soft depth is reintroduced later.
 */
export function softSurfaceLift(): ViewStyle {
  // Studio directions (TASK-040) restore soft depth; shipped palettes stay flat.
  const studio = getActiveStudioDirection();
  if (studio) return studioLift(studio);
  return {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
}

export const SOFT_SURFACE_STYLES = StyleSheet.create({
  face: SOFT_SURFACE_FACE,
  raised: softSurfaceLift(),
});

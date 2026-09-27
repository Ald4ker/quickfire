import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { getStudioDirection, type StudioDirection } from '@/constants/studio';
import { useThemeStore } from '@/store/theme';

/** The active studio direction (TASK-040 preview), or null on shipped palettes. */
export function useStudio(): StudioDirection | null {
  const paletteId = useThemeStore((state) => state.paletteId);
  return getStudioDirection(paletteId);
}

/** Honours the OS Reduce Motion setting. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (alive) setReduce(Boolean(value));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) =>
      setReduce(Boolean(value))
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** Motion is on only in a studio direction and when Reduce Motion is off. */
export function useStudioMotion(): boolean {
  const studio = useStudio();
  const reduce = useReduceMotion();
  return Boolean(studio) && !reduce;
}

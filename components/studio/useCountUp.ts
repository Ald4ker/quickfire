import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useStudioMotion } from './useStudio';

/**
 * Score tick: when `value` changes, the displayed number counts from the old
 * value to the new one (studio directions only; otherwise it snaps).
 */
export function useCountUp(value: number, duration = 520, startFrom?: number): number {
  const motion = useStudioMotion();
  const [shown, setShown] = useState(motion && startFrom != null ? startFrom : value);
  const anim = useRef(new Animated.Value(motion && startFrom != null ? startFrom : value)).current;
  const last = useRef(shown);

  useEffect(() => {
    if (!motion) {
      anim.setValue(value);
      last.current = value;
      setShown(value);
      return;
    }
    const id = anim.addListener(({ value: v }) => {
      const rounded = Math.round(v);
      if (rounded !== last.current) {
        last.current = rounded;
        setShown(rounded);
      }
    });
    const animation = Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(() => setShown(value));
    return () => {
      animation.stop();
      anim.removeListener(id);
    };
  }, [anim, duration, motion, value]);

  return shown;
}

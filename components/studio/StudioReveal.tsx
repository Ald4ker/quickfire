import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useStudioMotion } from './useStudio';

type Props = {
  children: ReactNode;
  /** Delay before this element enters (ms), for short cascades. */
  delay?: number;
  /** Entrance length (ms). */
  duration?: number;
  /** Start offset on the y axis (px). */
  rise?: number;
  /** Start scale. */
  from?: number;
  style?: StyleProp<ViewStyle>;
  /** Re-run the entrance when this changes (for example the answer reveal). */
  revealKey?: string | number | boolean;
};

/**
 * One confident entrance: fade, rise and settle with an exponential ease-out.
 * Studio directions only; on shipped palettes (or with Reduce Motion) it is a
 * plain View with the same style, so layout never changes.
 */
export function StudioReveal({
  children,
  delay = 0,
  duration = 320,
  rise = 10,
  from = 0.97,
  style,
  revealKey,
}: Props) {
  const motion = useStudioMotion();
  const progress = useRef(new Animated.Value(motion ? 0 : 1)).current;

  useEffect(() => {
    if (!motion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [motion, delay, duration, progress, revealKey]);

  if (!motion) {
    // No wrapper without a style, so shipped palettes keep their exact layout.
    return style ? <Animated.View style={style}>{children}</Animated.View> : <>{children}</>;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

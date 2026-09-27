import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStudio } from './useStudio';

/**
 * Stage lighting behind a screen in a studio direction: a soft key light from
 * the top falling off to the floor. Renders nothing on shipped palettes.
 * Place it as the first child of a full-screen container.
 */
export function StudioBackdrop() {
  const studio = useStudio();
  if (!studio) return null;
  const c = studio.colors;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="studio-backdrop">
      <LinearGradient
        colors={[c.canvasTop, c.canvas, c.canvasBottom]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

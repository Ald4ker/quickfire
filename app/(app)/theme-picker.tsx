import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { STUDIO_DIRECTION_IDS } from '@/constants/studio';
import { ROUND2_DIRECTION_IDS, ROUND2_ENABLED, ROUND2_LABELS, useRound2Store } from '@/features/round2/direction';
import { Pressable } from '@/components/ui/Pressable';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  SPACING,
  BORDER_RADIUS,
  PALETTES,
  FONTS,
  LAYOUT,
  type ThemePaletteId,
} from '@/constants';
import { useDarkModeFlatTop, useThemePicker } from '@/lib/hooks/useTheme';
import { useI18n } from '@/lib/i18n/useI18n';
import { goBackOrReplace } from '@/lib/navigation/goBackOrReplace';
import { Screen } from '@/components/ScreenContent';
import { HOME_SOFT_UI } from '@/themes';

const T = HOME_SOFT_UI;

const SHIPPED_PALETTES: ThemePaletteId[] = ['dark', 'default', 'warm', 'cool', 'green', 'red'];

/**
 * Studio directions (TASK-040) are a preview: listed only in development builds or
 * when EXPO_PUBLIC_STUDIO_THEMES=1, so shipped builds show the same picker as before.
 */
const SHOW_STUDIO_THEMES =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_STUDIO_THEMES === '1';
const STUDIO_LABELS: Partial<Record<ThemePaletteId, string>> = {
  atelier: 'Studio: Atelier',
  primetime: 'Studio: Prime Time',
  highroller: 'Studio: High Roller',
};
const ALL_PALETTES: ThemePaletteId[] = SHOW_STUDIO_THEMES
  ? [...SHIPPED_PALETTES, ...STUDIO_DIRECTION_IDS]
  : SHIPPED_PALETTES;

/** Flat lift — no hard gray strip under theme cards. */
function neumorphicLift3D(_shadowColor: string, _tier: 'header' | 'card'): any {
  return {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
}

export default function ThemePickerModal() {
  const router = useRouter();
  const { direction, t } = useI18n();
  const { paletteId, setPalette } = useThemePicker();
  const round2Id = useRound2Store((state) => state.directionId);
  const setRound2 = useRound2Store((state) => state.setDirection);
  const darkModeFlatTop = useDarkModeFlatTop();
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;
  const shadowHex = T.colors.shadowStrong;
  const backIcon = direction === 'rtl' ? 'chevron-forward' : 'chevron-back';
  const handleBack = () => goBackOrReplace(router, '/(app)/settings');

  return (
    <Screen
      header={(
        <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            styles.backButton,
            styles.plasticFace,
            darkModeFlatTop,
            {
              backgroundColor: surface,
              opacity: pressed ? 0.94 : 1,
              transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
            },
            neumorphicLift3D(shadowHex, 'header'),
          ]}
        >
          <Ionicons name={backIcon} size={22} color={textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: textPrimary }]}>THEME</Text>
        <View style={styles.headerSpacer} />
        </View>
      )}
      contentStyle={styles.content}
    >
        <Text style={[styles.subtitle, { color: textMuted }]}>Choose a color palette</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.paletteGrid}>
          {ALL_PALETTES.map((id) => {
            const p = PALETTES[id];
            const isSelected = id === paletteId;
            return (
              <Pressable
                key={id}
                style={({ pressed }) => [
                  styles.paletteCard,
                  styles.plasticFace,
                  darkModeFlatTop,
                  { backgroundColor: surface, opacity: pressed ? 0.94 : 1 },
                  neumorphicLift3D(shadowHex, 'card'),
                  isSelected && styles.paletteCardSelected,
                ]}
                onPress={() => {
                  setPalette(id);
                }}
              >
                <View style={styles.palettePreview}>
                  <View style={[styles.swatch, { backgroundColor: p.primary }]} />
                  <View style={[styles.swatch, { backgroundColor: p.background }]} />
                  <View style={[styles.swatch, { backgroundColor: p.success }]} />
                </View>
                <View style={styles.labelBlock}>
                  <Text style={[styles.paletteName, { color: textPrimary }]}>
                    {STUDIO_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)}
                  </Text>
                  <Text style={[styles.paletteMeta, { color: textMuted }]}>
                    {isSelected ? 'Active palette' : 'Tap to apply'}
                  </Text>
                </View>
                {isSelected ? <Ionicons name="checkmark-circle" size={22} color={textPrimary} /> : null}
              </Pressable>
            );
          })}
          {ROUND2_ENABLED ? (
            <View style={styles.round2Block} testID="theme-picker-round2">
              <Text style={[styles.subtitle, { color: textMuted, marginBottom: SPACING.sm }]}>
                Layout (UI round 2 preview, development builds only)
              </Text>
              <View style={styles.round2Row}>
                {([null, ...ROUND2_DIRECTION_IDS] as const).map((id) => {
                  const selected = round2Id === id;
                  return (
                    <Pressable
                      key={id ?? 'off'}
                      testID={`round2-${id ?? 'off'}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setRound2(id)}
                      style={[
                        styles.round2Chip,
                        { backgroundColor: surface, borderColor: selected ? textPrimary : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.paletteName, { color: textPrimary }]}>
                        {id ? ROUND2_LABELS[id] : 'Shipped'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  round2Block: { width: '100%', marginTop: SPACING.md },
  round2Row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  round2Chip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: 14, borderWidth: 2 },
  plasticFace: {
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  header: {
    height: 72,
    paddingHorizontal: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  title: {
    fontSize: 20,
    fontFamily: FONTS.displayBold,
    letterSpacing: 0.8,
  },
  content: {
    flex: 1,
    paddingVertical: LAYOUT.screenGutter,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.ui,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  paletteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: 24,
    width: '47%',
    minWidth: 148,
    flexShrink: 1,
    flexGrow: 1,
    maxWidth: 360,
  },
  paletteCardSelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(51, 51, 51, 0.18)',
  },
  palettePreview: {
    flexDirection: 'row',
    gap: 6,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
  },
  labelBlock: {
    flex: 1,
  },
  paletteName: {
    fontSize: 16,
    fontFamily: FONTS.uiSemibold,
  },
  paletteMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONTS.ui,
    opacity: 0.7,
  },
});

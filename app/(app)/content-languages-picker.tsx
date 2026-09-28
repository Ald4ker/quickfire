import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BORDER_RADIUS, FONTS, LAYOUT, SPACING } from '@/constants';
import {
  CONTENT_LOCALES,
  MAX_CONTENT_LOCALES,
  contentLocalePriorityToArray,
  type NonEnglishContentLocale,
} from '@/lib/i18n/config';
import { getChevronName } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { useLocaleStore, type ContentLocaleSlot } from '@/store/locale';
import { Screen } from '@/components/ScreenContent';
import { HOME_SOFT_UI } from '@/themes';

/** All 17 translated content languages, independent of the 11 UI languages. */
const SELECTABLE_CONTENT_LOCALES = CONTENT_LOCALES;
const T = HOME_SOFT_UI;

/** Flat lift — no gray strip under language cards. */
function neumorphicLift3D(_shadowColor: string, _tier: 'header' | 'card'): any {
  return {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
}

export default function ContentLanguagesPickerScreen() {
  const router = useRouter();
  const { direction, getLocaleName, getTextStyle, t } = useI18n();
  const darkModeFlatTop = useDarkModeFlatTop();
  const contentLocales = useLocaleStore((state) => state.contentLocales);
  const setContentLocales = useLocaleStore((state) => state.setContentLocales);
  const moveContentLocale = useLocaleStore((state) => state.moveContentLocale);
  const selected = contentLocalePriorityToArray(contentLocales);
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;
  const shadowHex = T.colors.shadowStrong;
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/settings');
  };

  const toggleLocale = (locale: NonEnglishContentLocale) => {
    if (selected.includes(locale)) {
      setContentLocales(selected.filter((value) => value !== locale));
      return;
    }

    if (selected.length >= MAX_CONTENT_LOCALES) {
      return;
    }

    setContentLocales([...selected, locale]);
  };

  return (
    <Screen
      header={(
        <View style={styles.header}>
        <Pressable
          onPress={handleBack}
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
          <Ionicons name={direction === 'rtl' ? 'chevron-forward' : 'chevron-back'} size={22} color={textPrimary} />
        </Pressable>
        <Text
          style={[
            styles.title,
            { color: textPrimary },
            getTextStyle(undefined, 'display', 'center'),
          ]}
        >
          {t('settings.triviaLanguagesTitle').toUpperCase()}
        </Text>
        <View style={styles.headerSpacer} />
        </View>
      )}
      contentStyle={styles.body}
    >
        <Text
          style={[
            styles.description,
            { color: textMuted },
            getTextStyle(),
          ]}
        >
          {t('settings.triviaLanguagesDescription')}
        </Text>

        {selected.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.selectedScrollerRow}
          >
            {selected.map((locale, index) => (
              <View
                key={locale}
                style={[
                  styles.selectedRow,
                  styles.pickCard,
                  {
                    backgroundColor: surface,
                    borderColor: 'rgba(51,51,51,0.14)',
                  },
                ]}
              >
                <View style={styles.labelBlock}>
                  <Text style={[styles.primaryLabel, { color: textPrimary }, getTextStyle(locale, 'bodySemibold', 'start')]}>
                    {getLocaleName(locale, 'native')}
                  </Text>
                  <Text style={[styles.secondaryLabel, { color: textMuted }, getTextStyle()]}>
                    {t('common.priorityLabel', { count: index + 1 })}
                  </Text>
                </View>
                <View style={styles.priorityActions}>
                  <Pressable
                    onPress={() => {
                      if (index <= 0) return;
                      // SAFETY: selected content locales are at most MAX_CONTENT_LOCALES (2) entries (indices 0..1).
                      const from = index as ContentLocaleSlot;
                      // SAFETY: from > 0 so from - 1 is still 0..1.
                      const to = (index - 1) as ContentLocaleSlot;
                      moveContentLocale(from, to);
                    }}
                    disabled={index === 0}
                  >
                    <Ionicons name="arrow-up" size={18} color={index === 0 ? 'rgba(51,51,51,0.32)' : textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (index >= selected.length - 1) return;
                      // SAFETY: selected content locales are at most MAX_CONTENT_LOCALES (2) entries (indices 0..1).
                      const from = index as ContentLocaleSlot;
                      // SAFETY: from < last so from + 1 is still 0..1.
                      const to = (index + 1) as ContentLocaleSlot;
                      moveContentLocale(from, to);
                    }}
                    disabled={index === selected.length - 1}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={18}
                      color={index === selected.length - 1 ? 'rgba(51,51,51,0.32)' : textMuted}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text
            style={[
              styles.sectionTitle,
              { color: textPrimary },
              getTextStyle(undefined, 'bodySemibold', 'start'),
            ]}
          >
            {t('common.languages')}
          </Text>
          <Text
            style={[
              styles.sectionMeta,
              { color: textMuted },
              getTextStyle(),
            ]}
          >
            {selected.length}/{MAX_CONTENT_LOCALES}
          </Text>
        </View>

        <ScrollView
          style={styles.localeScroller}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.localeGrid}
        >
          {SELECTABLE_CONTENT_LOCALES.map((locale) => {
            const isSelected = selected.includes(locale);
            const disabled = !isSelected && selected.length >= MAX_CONTENT_LOCALES;

            return (
              <Pressable
                key={locale}
                style={[
                  styles.row,
                  styles.pickCard,
                  {
                    backgroundColor: surface,
                    borderColor: isSelected ? 'rgba(51,51,51,0.22)' : 'rgba(51,51,51,0.12)',
                    opacity: disabled ? 0.5 : 1,
                  },
                  styles.plasticFace,
                  darkModeFlatTop,
                  neumorphicLift3D(shadowHex, 'card'),
                ]}
                onPress={() => toggleLocale(locale)}
                disabled={disabled}
              >
                <View style={styles.labelBlock}>
                  <Text style={[styles.primaryLabel, { color: textPrimary }, getTextStyle(locale, 'bodySemibold', 'start')]}>
                    {getLocaleName(locale, 'native')}
                  </Text>
                  <Text style={[styles.secondaryLabel, { color: textMuted }, getTextStyle()]}>
                    {getLocaleName(locale, 'english')}
                  </Text>
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={22} color={textPrimary} />
                ) : (
                  <Ionicons name={getChevronName(direction)} size={18} color={textMuted} />
                )}
              </Pressable>
            );
          })}

          <View
            style={[
              styles.row,
              styles.pickCard,
              {
                backgroundColor: surface,
                borderColor: 'rgba(51,51,51,0.12)',
                opacity: 0.8,
              },
              styles.plasticFace,
              darkModeFlatTop,
              neumorphicLift3D(shadowHex, 'card'),
            ]}
          >
            <View style={styles.labelBlock}>
              <Text style={[styles.primaryLabel, { color: textPrimary }, getTextStyle(undefined, 'bodySemibold', 'start')]}>
                {t('common.english')}
              </Text>
              <Text style={[styles.secondaryLabel, { color: textMuted }, getTextStyle()]}>
                {t('settings.englishFallback')}
              </Text>
            </View>
            <Ionicons name="lock-closed" size={18} color={textMuted} />
          </View>
        </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plasticFace: {
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  body: {
    flex: 1,
    paddingVertical: LAYOUT.screenGutter,
    gap: SPACING.lg,
  },
  pickScroller: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  selectedScrollerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  localeScroller: {
    flex: 1,
  },
  localeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  pickCard: {
    width: 220,
    flexShrink: 0,
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
  description: {
    fontSize: 14,
    fontFamily: FONTS.ui,
    lineHeight: 20,
    maxWidth: 720,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONTS.uiSemibold,
  },
  sectionMeta: {
    fontSize: 13,
    fontFamily: FONTS.ui,
  },
  row: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  selectedRow: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  labelBlock: {
    flex: 1,
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: FONTS.uiSemibold,
    marginBottom: 4,
  },
  secondaryLabel: {
    fontSize: 13,
    fontFamily: FONTS.ui,
  },
  priorityActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});

import { Platform, StyleSheet, Text, type ColorValue, type DimensionValue } from 'react-native';
import { useI18n } from '@/lib/i18n/useI18n';
import type { QuestionVariant } from '@/features/play/data';

/** Secondary text is this fraction of the primary text size. */
export const SECONDARY_LANGUAGE_SCALE = 0.62;

/**
 * The second content language for the same question, shown beneath the primary text.
 * Direction, alignment and font come from the variant's own locale, so an Arabic or Urdu
 * secondary renders right-to-left under a left-to-right primary (and the reverse).
 */
export function SecondaryLanguageText({
  variant,
  field,
  primaryFontSize,
  primaryLineHeight,
  color,
  maxWidth,
  marginTop,
  testID,
}: {
  variant: QuestionVariant;
  field: 'prompt' | 'answer';
  primaryFontSize: number;
  primaryLineHeight: number;
  color: ColorValue;
  maxWidth?: DimensionValue;
  marginTop?: number;
  testID?: string;
}) {
  const { getTextStyle } = useI18n();
  const text = field === 'prompt' ? variant.prompt : variant.answer;
  const fontSize = Math.max(11, Math.round(primaryFontSize * SECONDARY_LANGUAGE_SCALE));
  const lineHeight = Math.max(fontSize + 3, Math.round(primaryLineHeight * SECONDARY_LANGUAGE_SCALE));

  return (
    <Text
      testID={testID}
      accessibilityLanguage={variant.locale}
      style={[
        styles.text,
        getTextStyle(variant.locale, field === 'prompt' ? 'bodySemibold' : 'bodyBold', 'center', text),
        { color, fontSize, lineHeight },
        maxWidth !== undefined ? { maxWidth } : null,
        marginTop !== undefined ? { marginTop } : null,
      ]}
      maxFontSizeMultiplier={1.2}
      {...(Platform.OS === 'web'
        ? {}
        : { numberOfLines: 4, adjustsFontSizeToFit: true, minimumFontScale: 0.6 })}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    width: '100%',
    alignSelf: 'center',
    opacity: 0.78,
  },
});

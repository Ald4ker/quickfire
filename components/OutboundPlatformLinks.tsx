import { Linking, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '@/components/ui/Pressable';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  PUBLIC_SITE_HOST_LABEL,
  getPublicSiteUrl,
} from '@/constants/site';
import { FONTS, SPACING } from '@/constants';
import { useI18n } from '@/lib/i18n/useI18n';

type OutboundPlatformLinksProps = {
  color: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Calm cross-platform outbound links:
 * - Web: App Store + Google Play, spaced apart so taps do not collide
 * - Native: muted playbackfire.com link
 */
export function OutboundPlatformLinks({ color, style }: OutboundPlatformLinksProps) {
  const { t } = useI18n();

  if (Platform.OS === 'web') {
    return (
      <View testID="outbound-platform-links-web" style={[styles.webRow, style]}>
        <Pressable
          testID="outbound-app-store-link"
          accessibilityRole="link"
          accessibilityLabel={t('outbound.appStoreA11y')}
          onPress={() => {
            void Linking.openURL(APP_STORE_URL);
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.webLink, pressed && styles.pressed]}
        >
          <Ionicons name="logo-apple" size={15} color={color} />
          <Text style={[styles.webLinkText, { color }]}>{t('outbound.appStore')}</Text>
        </Pressable>

        <View style={styles.webSpacer} />

        <Pressable
          testID="outbound-play-store-link"
          accessibilityRole="link"
          accessibilityLabel={t('outbound.googlePlayA11y')}
          onPress={() => {
            void Linking.openURL(PLAY_STORE_URL);
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.webLink, pressed && styles.pressed]}
        >
          <Ionicons name="logo-google-playstore" size={15} color={color} />
          <Text style={[styles.webLinkText, { color }]}>{t('outbound.googlePlay')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View testID="outbound-platform-links-native" style={[styles.nativeWrap, style]}>
      <Pressable
        testID="outbound-website-link"
        accessibilityRole="link"
        accessibilityLabel={t('outbound.websiteA11y')}
        onPress={() => {
          void Linking.openURL(getPublicSiteUrl());
        }}
        hitSlop={10}
        style={({ pressed }) => [styles.nativeLink, pressed && styles.pressed]}
      >
            {/*
              Trailing figure-space: Android custom fonts often paint the last glyph
              past the measured width (playbackfire.com becomes playbackfire.co).
              Avoid single-line ellipsis on this label.
            */}
        <Text
          style={[styles.nativeLinkText, { color }]}
          allowFontScaling={false}
        >
          {`${PUBLIC_SITE_HOST_LABEL}\u2007`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  webRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
  },
  webSpacer: {
    // Keep store targets far enough apart to avoid mis-taps.
    width: 72,
    flexShrink: 0,
  },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  webLinkText: {
    fontFamily: FONTS.ui,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    opacity: 0.78,
  },
  nativeWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    overflow: 'visible',
  },
  nativeLink: {
    flexShrink: 0,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    overflow: 'visible',
  },
  nativeLinkText: {
    fontFamily: FONTS.ui,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 0,
    // No letterSpacing: Android under-measures width and clips the final glyph.
    opacity: 0.72,
    paddingEnd: 4,
  },
  pressed: {
    opacity: 0.55,
  },
});

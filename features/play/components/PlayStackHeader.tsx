import { useCallback, type ReactNode } from 'react';
import { Platform, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { GameHeader, type GameHeaderTopPad } from '@/components/GameHeader';
import {
  HeaderBackButton,
  type HeaderBackButtonVariant,
} from '@/components/HeaderBackButton';
import { HubTokenChip } from '@/components/HubTokenChip';
import { SPACING } from '@/constants';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDisplayTokenBalance } from '@/lib/hooks/useDisplayTokenBalance';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';

function formatTokens(n: number, locale: string) {
  return n.toLocaleString(locale, { maximumFractionDigits: 0 });
}

export type PlayStackHeaderProps = {
  title: string;
  /** When set, used instead of default stack back / home fallback. */
  onBackPress?: () => void;
  /** Defaults to labeled play pill; use `icon` for settings/store squircle. */
  backVariant?: HeaderBackButtonVariant;
  /** Extra control after the back button (e.g. leading mode chrome). */
  leadingExtra?: ReactNode;
  /**
   * Web: constrain header bar max-width so back / token chip edges align with
   * centered content cards (same value as the content row max-width).
   */
  barMaxWidth?: number;
  /**
   * Forwarded to GameHeader. Use `none` when the parent scaffold already applied
   * standard chrome top padding (edge-to-edge PlayScaffold).
   */
  topPad?: GameHeaderTopPad;
};

/**
 * Play stack top bar - docs/BRAND_GUIDELINES.md soft UI: cream-context chrome, white squircles, charcoal type.
 *
 * Wraps the shared <GameHeader /> in title-only mode so all play screens use
 * consistent header positioning, safe-area handling, and spacing tokens.
 */
export function PlayStackHeader({
  title,
  onBackPress,
  backVariant = 'labeled',
  leadingExtra,
  barMaxWidth,
  topPad = 'standard',
}: PlayStackHeaderProps) {
  const router = useRouter();
  const { direction, t, uiLocale } = useI18n();
  const tokens = useDisplayTokenBalance();
  const { width, height } = useWindowDimensions();
  const viewportScale = Platform.OS === 'web' ? getWebViewportScale(width, height) : 1;
  const rowDir = getRowDirection(direction);

  const handleBack = useCallback(() => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/');
  }, [onBackPress, router]);

  const formatted = formatTokens(tokens, uiLocale);

  return (
    <View style={[styles.wrapper, { marginBottom: SPACING.md * viewportScale }]}>
      <GameHeader
        variant="title"
        title={title}
        topPad={topPad}
        barMaxWidthOverride={barMaxWidth}
        leftSlot={
          <View style={[styles.leftCluster, { flexDirection: rowDir }]}>
            <HeaderBackButton
              onPress={handleBack}
              direction={direction}
              rowDirection={rowDir}
              label={t('common.back')}
              variant={backVariant}
            />
            {leadingExtra}
          </View>
        }
        rightSlot={
          <HubTokenChip
            label={t('common.tokens')}
            value={formatted}
            rowDirection={rowDir}
            variant="softUi"
            scale={viewportScale}
            onPress={() => router.push('/(app)/store')}
            accessibilityLabel={`${t('common.tokens')}: ${formatted}`}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.md,
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
});

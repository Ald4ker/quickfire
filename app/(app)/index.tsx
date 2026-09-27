import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDarkPaletteId } from '@/constants/studio';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { showThemedAlert } from '@/store/themedAlert';
import { Pressable } from '@/components/ui/Pressable';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COLORS,
  FONTS,
  SPACING,
  SHOW_HOME_MODE_INFO_UI,
  SOFT_SURFACE_FACE,
  softSurfaceLift,
} from '@/constants';
import { ScreenContent } from '@/components/ScreenContent';
import { StudioBackdrop } from '@/components/studio/StudioBackdrop';
import { getActiveStudioDirection } from '@/constants/studio';
import { GameHeader } from '@/components/GameHeader';
import { HubTokenChip } from '@/components/HubTokenChip';
import { OutboundPlatformLinks } from '@/components/OutboundPlatformLinks';
import { WebAwareModal } from '@/components/WebAwareModal';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { isAuthDisabled } from '@/lib/authMode';
import { useViewportLayout } from '@/lib/hooks/useViewportLayout';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import { getHomeModeCopyLayout, getHomeModeRowLayout } from '@/lib/layout/homeModeLayout';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';
import { usePlayStore } from '@/store/play';
import { useDisplayTokenBalance } from '@/lib/hooks/useDisplayTokenBalance';
import { refundGameEntry } from '@/lib/wallet/gameEntry';
import { useThemeStore } from '@/store/theme';
import { HOME_SOFT_UI } from '@/themes';
import { isResumableSessionStep, routeForPlayStep } from '@/features/play/sessionRouting';
import { getGameTokenCost, getHomeModeTokenCostLabel } from '@/features/play/tokenCosts';
import type { GameMode } from '@/features/shared';
import type { TranslationKey } from '@/lib/i18n/messages/en';

import { markOnce } from '@/lib/startupTiming';
import { prefetchPlayArtwork } from '@/lib/prefetchPlayArtwork';

const T = HOME_SOFT_UI;

type ModeDef = {
  id: GameMode;
  titleKey: TranslationKey;
  copyKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
};

const HOME_MODES: ModeDef[] = [
  {
    id: 'quickPlay',
    titleKey: 'play.mode.quick',
    copyKey: 'play.mode.quickCopy',
    icon: 'flash-outline',
  },
  {
    id: 'classic',
    titleKey: 'play.mode.classic',
    copyKey: 'play.mode.classicCopy',
    icon: 'trophy-outline',
  },
  {
    id: 'random',
    titleKey: 'play.mode.random',
    copyKey: 'play.mode.randomCopy',
    icon: 'shuffle-outline',
  },
  {
    id: 'rumble',
    titleKey: 'play.mode.rumble',
    copyKey: 'play.mode.rumbleCopy',
    icon: 'people-outline',
  },
];

/** Flat card face — no hard gray strip / bevel lift under cards. */
function brandRaisedSurfaceShadow(_tier: 'hero' | 'header' | 'pill'): ViewStyle {
  // Studio directions (TASK-040) restore real depth; shipped palettes stay flat.
  if (getActiveStudioDirection()) return softSurfaceLift();
  return {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  };
}

function RumblePeopleIcon({ size, color, compact, isWeb }: { size: number; color: string; compact: boolean; isWeb?: boolean }) {
  const personSize = Math.round(size * 0.42);
  return (
    <View
      style={[
        styles.rumblePeopleIcon,
        {
          width: size,
          height: Math.round(size * 0.74),
          marginBottom: compact ? 4 : (isWeb ? 8 : 10),
        },
      ]}
      accessible={false}
      testID="home-rumble-people-icon"
    >
      <View testID="home-rumble-person-1" style={[styles.rumblePerson, styles.rumblePersonLeft]}>
        <Ionicons name="person" size={personSize} color={color} />
      </View>
      <View testID="home-rumble-person-2" style={[styles.rumblePerson, styles.rumblePersonCenter]}>
        <Ionicons name="person" size={Math.round(personSize * 1.14)} color={color} />
      </View>
      <View testID="home-rumble-person-3" style={[styles.rumblePerson, styles.rumblePersonRight]}>
        <Ionicons name="person" size={personSize} color={color} />
      </View>
    </View>
  );
}

export default function AppHubScreen() {
  markOnce('home screen first render');
  const router = useRouter();

  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded) markOnce('home screen: auth loaded');
  const authDisabled = isAuthDisabled();
  const { direction, t, uiLocale } = useI18n();
  const paletteId = useThemeStore((state) => state.paletteId);
  const isDarkTheme = isDarkPaletteId(paletteId);
  const tokens = useDisplayTokenBalance();
  const session = usePlayStore((state) => state.session);
  const startModeSession = usePlayStore((state) => state.startModeSession);
  const loadDebugWinnerSession = usePlayStore((state) => state.loadDebugWinnerSession);
  const setEntryReservationId = usePlayStore((state) => state.setEntryReservationId);
  const refundEntryMutation = useMutation(api.wallet.refundEntry);
  const [activeModeInfo, setActiveModeInfo] = useState<GameMode | null>(null);
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);

  // Decode play art into expo-image cache while the user is still on home.
  useEffect(() => {
    void prefetchPlayArtwork();
  }, []);

  const viewport = useViewportLayout();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { paddingLeft: padLeft, paddingRight: padRight } = topicCardScreenPadding(
    viewport.width,
    insets,
    isWeb
  );
  /** Tighter chrome when vertical space is limited (e.g. phone landscape). */
  const compact = viewport.isCompact;
  const hybridScale = viewport.isWide ? viewport.scale : 1;
  const headerScale = isWeb ? getWebViewportScale(viewport.width, viewport.height) : 1;
  const modeRowLayout = useMemo(
    () =>
      getHomeModeRowLayout({
        isCompact: viewport.isCompact,
        isWide: viewport.isWide,
        isTall: viewport.isTall,
      }),
    [viewport.isCompact, viewport.isWide, viewport.isTall]
  );

  const rowDir = getRowDirection(direction);
  const formattedTokens = tokens.toLocaleString(uiLocale, { maximumFractionDigits: 0 });
  const needsSignIn = !authDisabled && !isSignedIn;

  const modeGap = compact
    ? SPACING.md
    : Math.round((isWeb ? 36 : SPACING.lg) * hybridScale);
  const modeIconSize = compact
    ? 70
    : Math.round((isWeb ? 96 : 92) * hybridScale);
  const modeInfoIconSize = compact ? 20 : 24;
  const modeTitleSize = compact ? 12 : Math.round((isWeb ? 17 : 16) * hybridScale);
  const modeCopyLayout = useMemo(
    () => getHomeModeCopyLayout({ isWeb, hybridScale }),
    [isWeb, hybridScale]
  );
  const minimumTokenCostForMode = useCallback(
    (mode: GameMode) => (mode === 'quickPlay' ? getGameTokenCost(mode, 3) : getGameTokenCost(mode)),
    []
  );

  const startNewGame = useCallback(async (mode: GameMode) => {
    const minimumCost = minimumTokenCostForMode(mode);
    if (tokens < minimumCost) {
      showThemedAlert(t('play.needTokens'));
      return;
    }

    // Drop any leftover reservation from a prior abandoned flow. Tokens are only
    // reserved/spent when the board starts after topics are chosen.
    const oldReservationId = usePlayStore.getState().entryReservationId;
    if (oldReservationId && !authDisabled && isLoaded && isSignedIn) {
      await refundGameEntry(refundEntryMutation, {
        reservationId: oldReservationId,
        reason: 'session_replaced',
      }).catch(() => {});
      setEntryReservationId(null);
    }

    const result = startModeSession(mode);
    if (!result.ok) {
      showThemedAlert(result.error ?? t('play.needTokens'));
      return;
    }
    router.push(mode === 'quickPlay' ? '/play/quick-length' : '/play/team-setup');
  }, [
    authDisabled,
    isLoaded,
    isSignedIn,
    minimumTokenCostForMode,
    refundEntryMutation,
    router,
    setEntryReservationId,
    startModeSession,
    t,
    tokens,
  ]);

  const onSelectMode = useCallback((mode: GameMode) => {
    if (!isSignedIn && !authDisabled) {
      router.push('/(auth)/sign-in');
      return;
    }
    if (session && isResumableSessionStep(session.step)) {
      setPendingMode(mode);
      return;
    }
    startNewGame(mode);
  }, [authDisabled, isSignedIn, router, session, startNewGame]);

  const closeResumeChoice = useCallback(() => {
    setPendingMode(null);
  }, []);

  const continueCurrentGame = useCallback(() => {
    if (!session) {
      closeResumeChoice();
      return;
    }
    const targetRoute = routeForPlayStep(session.step);
    closeResumeChoice();
    if (targetRoute) {
      router.push(targetRoute);
    }
  }, [closeResumeChoice, router, session]);

  const startPendingModeNewGame = useCallback(() => {
    if (!pendingMode) {
      return;
    }
    const nextMode = pendingMode;
    closeResumeChoice();
    startNewGame(nextMode);
  }, [closeResumeChoice, pendingMode, startNewGame]);

  const closeModeInfo = useCallback(() => {
    setActiveModeInfo(null);
  }, []);

  const openModeInfo = useCallback((mode: GameMode) => {
    setActiveModeInfo(mode);
  }, []);

  const activeMode = useMemo(
    () => HOME_MODES.find((mode) => mode.id === activeModeInfo) ?? null,
    [activeModeInfo]
  );

  const canvas = T.colors.canvas;
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;

  return (
    <View style={[styles.rootContainer, { backgroundColor: canvas }]}>
      <StudioBackdrop />
      <SafeAreaView
        collapsable={false}
        // Vertical only — horizontal insets applied as max(safe, gutter) on the content frame.
        edges={['top', 'bottom']}
        style={styles.safeArea}
      >
        <ScreenContent fullWidth style={styles.viewport}>
          <View style={styles.pageColumn}>
            {/* Shared max-width aligns header bar + card row edges (hybrid hub column). */}
            {/*
              Top pad lives on a normal View - SafeAreaView can ignore/override paddingTop
              when status-bar insets are 0 (hidden bar).
            */}
            <View
              style={[
                styles.contentFrame,
                {
                  paddingTop: modeRowLayout.contentTopPad,
                  paddingLeft: padLeft,
                  paddingRight: padRight,
                },
              ]}
            >
            {/* flexShrink:0 + zIndex keep logo/settings above the mode row on iOS. */}
            <View style={styles.headerChrome} testID="home-header-chrome">
              <GameHeader
                variant="logoOnly"
                topPad="home"
                onLogoLongPress={
                  __DEV__
                    ? () => {
                        loadDebugWinnerSession();
                        router.push('/play/end');
                      }
                    : undefined
                }
                leftSlot={
                  <HubTokenChip
                    label={t('common.tokens')}
                    value={formattedTokens}
                    rowDirection={rowDir}
                    variant="softUi"
                    scale={headerScale}
                    outerStyle={{ alignSelf: 'flex-start' }}
                    onPress={() => router.push('/(app)/store')}
                    accessibilityLabel={`${t('common.tokens')}: ${formattedTokens}`}
                  />
                }
                rightSlot={
                  <Pressable
                    testID="home-open-settings"
                    onPress={() => router.push('/(app)/settings')}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.settings')}
                    style={({ pressed }) => [
                      styles.settingsImageButton,
                      { width: 52 * headerScale, height: 52 * headerScale },
                      { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                  >
                    <Image
                      source={require('../../assets/qf-settings-button.webp')}
                      style={[
                        styles.settingsImage,
                        { width: 52 * headerScale, height: 52 * headerScale },
                      ]}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  </Pressable>
                }
              />
            </View>

            <View style={[styles.mainFill, { justifyContent: modeRowLayout.mainJustify }]}>
              <View
                testID="home-mode-row"
                style={[
                  styles.modeGrid,
                  modeRowLayout.fillHeight && styles.modeGridFill,
                  {
                    flexDirection: rowDir,
                    flexWrap: 'nowrap',
                    gap: modeGap,
                    marginTop: modeRowLayout.modeRowMarginTop,
                    paddingVertical: modeRowLayout.modeRowPaddingVertical,
                  },
                ]}
              >
                {HOME_MODES.map((mode) => (
                  <View
                    key={mode.id}
                    testID={`home-mode-tile-${mode.id}`}
                    style={[
                      styles.modeTileContainer,
                      modeRowLayout.fillHeight && styles.modeTileContainerFill,
                      { aspectRatio: modeRowLayout.tileAspectRatio },
                    ]}
                  >
                    {(() => {
                      const minimumCost = minimumTokenCostForMode(mode.id);
                      const canPlayMode = needsSignIn || tokens >= minimumCost;
                      const signInLabel = t('home.signInToPlay').toUpperCase();
                      return (
                        <Pressable
                          onPress={() => onSelectMode(mode.id)}
                          disabled={!canPlayMode}
                          accessibilityRole="button"
                          accessibilityLabel={
                            needsSignIn ? `${t(mode.titleKey)}. ${signInLabel}` : t(mode.titleKey)
                          }
                          accessibilityHint={
                            needsSignIn
                              ? signInLabel
                              : `${t(mode.copyKey)} ${getHomeModeTokenCostLabel(mode.id)} ${t('common.tokens')}.`
                          }
                          accessibilityState={{ disabled: !canPlayMode }}
                          testID={`home-mode-card-${mode.id}`}
                          style={({ pressed }) => [
                            styles.modeTile,
                            compact && styles.modeTileCompactPad,
                            styles.plasticFace,
                            isDarkTheme && styles.plasticFaceDark,
                            {
                              backgroundColor: surface,
                              borderRadius: 44,
                              opacity: !canPlayMode ? 0.45 : pressed ? 0.94 : 1,
                              transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                              ...(viewport.isWide ? { paddingVertical: SPACING.md } : {}),
                            },
                            brandRaisedSurfaceShadow('hero'),
                          ]}
                        >
                          {mode.id === 'rumble' ? (
                            <RumblePeopleIcon
                              size={modeIconSize * 0.74}
                              color={textPrimary}
                              compact={compact}
                              isWeb={isWeb}
                            />
                          ) : (
                            <Ionicons
                              name={mode.icon}
                              size={modeIconSize * 0.74}
                              color={textPrimary}
                              style={{ marginBottom: compact ? 4 : (isWeb ? 8 : 10) }}
                            />
                          )}
                          <Text
                            testID={`home-mode-card-title-${mode.id}`}
                            style={[
                              styles.modeTileLabel,
                              compact && styles.modeTileLabelCompact,
                              { color: textPrimary, fontSize: modeTitleSize },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {t(mode.titleKey).toUpperCase()}
                          </Text>
                          <Text
                            testID={`home-mode-card-copy-${mode.id}`}
                            style={[
                              styles.modeTileCopy,
                              {
                                color: textMuted,
                                fontSize: modeCopyLayout.fontSize,
                                lineHeight: modeCopyLayout.lineHeight,
                                minHeight: modeCopyLayout.minHeight,
                              },
                            ]}
                            numberOfLines={modeCopyLayout.maxLines}
                          >
                            {t(mode.copyKey)}
                          </Text>
                          {needsSignIn ? (
                            <View
                              style={[
                                styles.modeTileSignInButton,
                                SOFT_SURFACE_FACE,
                                isDarkTheme && styles.plasticFaceDark,
                                softSurfaceLift(),
                                { backgroundColor: T.colors.accentGlow },
                                isWeb && { marginTop: SPACING.xs },
                              ]}
                            >
                              <Text
                                testID={`home-mode-sign-in-${mode.id}`}
                                style={[
                                  styles.modeTileSignInText,
                                  compact && styles.modeTileSignInTextCompact,
                                  isWeb && { fontSize: 11 },
                                ]}
                              >
                                {signInLabel}
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.modeTileCostRow, isWeb && { marginTop: SPACING.xs }]}>
                              <Ionicons name="diamond" size={compact ? 9 : (isWeb ? 11 : 11)} color={textPrimary} />
                              <Text
                                testID={`home-mode-token-cost-${mode.id}`}
                                style={[
                                  styles.modeTileCostText,
                                  compact && styles.modeTileCostTextCompact,
                                  { color: textPrimary },
                                  isWeb && { fontSize: 11, lineHeight: 14 },
                                ]}
                                numberOfLines={1}
                              >
                                {`${getHomeModeTokenCostLabel(mode.id)} ${t('common.tokens').toUpperCase()}`}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })()}
                    {SHOW_HOME_MODE_INFO_UI ? (
                      <Pressable
                        onPress={() => openModeInfo(mode.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t(mode.titleKey)} info`}
                        style={({ pressed }) => [
                          styles.modeInfoButton,
                          {
                            opacity: pressed ? 0.82 : 1,
                            transform: pressed ? [{ scale: 0.94 }] : [{ scale: 1 }],
                          },
                        ]}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={modeInfoIconSize}
                          color={textPrimary}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
            <OutboundPlatformLinks color={textMuted} style={styles.outboundLinks} />
          </View>
          </View>
        </ScreenContent>
      </SafeAreaView>

      <WebAwareModal visible={!!activeMode} onRequestClose={closeModeInfo}>
        <View
          accessibilityViewIsModal
          style={styles.infoModalRoot}
          testID="home-mode-info-overlay"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={closeModeInfo}
            style={styles.infoModalBackdrop}
          />
          {activeMode ? (
            <View
              style={[
                styles.infoModalCard,
                styles.plasticFace,
                isDarkTheme && styles.plasticFaceDark,
                brandRaisedSurfaceShadow('hero'),
                { backgroundColor: surface },
              ]}
            >
              <Text style={[styles.infoModalTitle, { color: textPrimary }]}>
                {t(activeMode.titleKey)}
              </Text>
              <Text style={[styles.infoModalBody, { color: textPrimary }]}>
                {t(activeMode.copyKey)}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={closeModeInfo}
                style={({ pressed }) => [
                  styles.infoModalCloseButton,
                  isDarkTheme && styles.plasticFaceDark,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.infoModalCloseText}>{t('common.close').toUpperCase()}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </WebAwareModal>

      <WebAwareModal visible={!!pendingMode} onRequestClose={closeResumeChoice}>
        <View
          accessibilityViewIsModal
          style={styles.infoModalRoot}
          testID="home-resume-overlay"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={closeResumeChoice}
            style={styles.infoModalBackdrop}
          />
          <View
            style={[
              styles.resumeModalCard,
              brandRaisedSurfaceShadow('hero'),
              { backgroundColor: surface },
              isWeb && { maxWidth: 480 },
            ]}
          >
            <Text style={[styles.infoModalTitle, { color: textPrimary, marginBottom: 16 }]}>
              {t('home.resumeModalTitle')}
            </Text>
            <Text style={[styles.infoModalBody, { color: textPrimary, marginBottom: 4 }]}>
              {t('home.resumeModalBody')}
            </Text>

            <View style={styles.resumeButtonsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.continueGame')}
                onPress={continueCurrentGame}
                style={({ pressed }) => [
                  styles.raisedButton,
                  styles.primaryRaisedButton,
                  styles.primaryRaisedButtonDepth,
                  isDarkTheme && styles.plasticFaceDark,
                  { opacity: pressed ? 0.88 : 1, transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }] },
                ]}
              >
                <Text style={styles.raisedButtonTextPrimary}>{t('home.continueGame').toUpperCase()}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.newGame')}
                onPress={startPendingModeNewGame}
                style={({ pressed }) => [
                  styles.raisedButton,
                  styles.secondaryRaisedButton,
                  styles.secondaryRaisedButtonDepth,
                  isDarkTheme && styles.plasticFaceDark,
                  {
                    backgroundColor: surface,
                    opacity: pressed ? 0.88 : 1,
                    transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                  },
                ]}
              >
                <Text style={[styles.raisedButtonText, { color: textPrimary }]}>
                  {t('home.newGame').toUpperCase()}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </WebAwareModal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  /** Flat card face — no bevel lips / gray strips (depth via shadow only). */
  plasticFace: {
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  plasticFaceDark: {
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  safeArea: {
    flex: 1,
    position: 'relative',
  },
  viewport: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  pageColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  /** Shared content frame - header and cards share one max-width + padding system. */
  contentFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  /** Never let the mode row flex-shrink the logo / settings bar on iOS. */
  headerChrome: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    zIndex: 2,
    elevation: 2,
  },
  mainFill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'flex-start',
    zIndex: 0,
    // Contain mode tiles so they cannot paint over header chrome.
    overflow: 'hidden',
  },
  outboundLinks: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },

  settingsImageButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsImage: {
    width: 52,
    height: 52,
  },
  modeGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    width: '100%',
  },
  /**
   * Phone landscape: expand into leftover height under the header, then
   * center the aspect-locked tiles inside (alignItems center — not stretch).
   */
  modeGridFill: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTileContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Keep aspect-driven height; do not stretch to full row height. */
  modeTileContainerFill: {
    maxHeight: '100%',
    alignSelf: 'center',
  },
  modeTile: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    overflow: 'hidden',
    zIndex: 1,
  },
  /** Tighter side pad on phone landscape so 3-line blurbs use full card width. */
  modeTileCompactPad: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  modeInfoButton: {
    position: 'absolute',
    top: 8,
    end: 8,
    zIndex: 3,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTileLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 16,
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
    zIndex: 1,
    flexShrink: 0,
  },
  modeTileLabelCompact: {
    fontSize: 12,
    letterSpacing: 1,
  },
  modeTileCopy: {
    marginTop: SPACING.xs,
    fontFamily: FONTS.ui,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.15,
    textAlign: 'center',
    zIndex: 1,
    width: '100%',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  modeTileCostRow: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 16,
    zIndex: 1,
  },
  modeTileCostText: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  modeTileCostTextCompact: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
  },
  modeTileSignInButton: {
    marginTop: SPACING.sm,
    minWidth: 88,
    minHeight: 28,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modeTileSignInText: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.8,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modeTileSignInTextCompact: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.6,
  },
  rumblePeopleIcon: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rumblePerson: {
    position: 'absolute',
  },
  rumblePersonLeft: {
    left: 0,
    bottom: 0,
  },
  rumblePersonCenter: {
    top: 0,
    alignSelf: 'center',
  },
  rumblePersonRight: {
    right: 0,
    bottom: 0,
  },
  /**
   * Full-viewport scrim hosted by WebAwareModal (native Modal / web fixed shell).
   * flex + explicit size + absoluteFill - same belt-and-suspenders as PlayMatchMenuModal.
   * absoluteFill alone can leave edges undimmed when the shell sizes via flex only.
   */
  infoModalRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.overlay,
    zIndex: 1000,
    elevation: 1000,
  },
  infoModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  infoModalCard: {
    width: '100%',
    maxWidth: 520,
    padding: SPACING.lg,
    borderRadius: 42,
    gap: SPACING.md,
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  resumeModalCard: {
    width: '100%',
    maxWidth: 520,
    paddingTop: 30,
    paddingBottom: 24,
    paddingLeft: 24,
    paddingRight: 24,
    borderRadius: 42,
    gap: 0,
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
    minHeight: 210,
  },
  infoModalTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: 20,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  infoModalBody: {
    fontFamily: FONTS.ui,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.8,
  },
  infoModalCloseButton: {
    marginTop: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  infoModalCloseText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#333333',
  },
  resumeButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.md,
    marginTop: 20,
  },
  raisedButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  primaryRaisedButton: {
    backgroundColor: '#FF8A00',
    borderColor: '#C76400',
  },
  primaryRaisedButtonDepth: {
    borderTopColor: '#C76400',
    borderBottomColor: '#C76400',
    shadowColor: 'transparent',
  },
  secondaryRaisedButton: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(51, 51, 51, 0.12)',
  },
  secondaryRaisedButtonDepth: {
    borderTopColor: 'rgba(51, 51, 51, 0.12)',
    borderBottomColor: 'rgba(51, 51, 51, 0.12)',
    shadowColor: 'transparent',
  },
  raisedButtonText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#333333',
  },
  raisedButtonTextPrimary: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  raisedButtonTextAccent: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#007BFF',
  },
});

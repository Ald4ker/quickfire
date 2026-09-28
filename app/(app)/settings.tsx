import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { useAction } from 'convex/react';
import {
  HEADER,
  SPACING,
  BORDER_RADIUS,
  COLORS,
  FONTS,
  SOFT_SURFACE_FACE as LIGHT_SURFACE_FACE,
  softSurfaceLift,
  getStandardChromeTopPadding,
} from '@/constants';
import { SHOW_LANGUAGE_SETTINGS_UI } from '@/constants/featureFlags';
import {
  CONTENT_LOCALES,
  MAX_CONTENT_LOCALES,
  SUPPORTED_LOCALES,
  contentLocalePriorityToArray,
  type NonEnglishContentLocale,
} from '@/lib/i18n/config';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import { isAuthDisabled } from '@/lib/authMode';
import { PublicAuthEntry } from '@/components/PublicAuthEntry';
import { ScreenContent } from '@/components/ScreenContent';
import { HubTokenChip } from '@/components/HubTokenChip';
import { OutboundPlatformLinks } from '@/components/OutboundPlatformLinks';
import { WebAwareModal } from '@/components/WebAwareModal';
import { api } from '@/convex/_generated/api';
import { logOutRevenueCat } from '@/lib/payments/revenueCat';
import { useLocaleStore, type ContentLocaleSlot } from '@/store/locale';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import {
  PLAY_DISPLAY_MODES,
  nextPlayDisplayMode,
  useDisplayStore,
  type PlayDisplayMode,
} from '@/store/display';
import { useDisplayTokenBalance } from '@/lib/hooks/useDisplayTokenBalance';
import { HOME_SOFT_UI } from '@/themes';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';

const T = HOME_SOFT_UI;

/** All 17 translated content languages, independent of the 11 UI languages. */
const SELECTABLE_CONTENT_LOCALES = CONTENT_LOCALES;

function formatTokens(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

export default function SettingsScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { paddingLeft, paddingRight } = topicCardScreenPadding(width, insets, Platform.OS === 'web');
  const horizontalPad = { paddingLeft, paddingRight };
  const viewportScale = Platform.OS === 'web' ? getWebViewportScale(width, height) : 1;
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const deleteAccount = useAction(api.users.deleteAccount);
  const authDisabled = isAuthDisabled();
  const router = useRouter();
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const playDisplayMode = useDisplayStore((s) => s.playDisplayMode);
  const setPlayDisplayMode = useDisplayStore((s) => s.setPlayDisplayMode);
  const [isLanguageModalVisible, setLanguageModalVisible] = useState(false);
  const [isContentLanguagesModalVisible, setContentLanguagesModalVisible] = useState(false);
  const [isDeleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const { direction, getLocaleName, t, uiLocale } = useI18n();
  const setUiLocale = useLocaleStore((state) => state.setUiLocale);
  const contentLocales = useLocaleStore((state) => state.contentLocales);
  const setContentLocales = useLocaleStore((state) => state.setContentLocales);
  const moveContentLocale = useLocaleStore((state) => state.moveContentLocale);
  const loadDebugWinnerSession = usePlayStore((state) => state.loadDebugWinnerSession);
  const tokens = useDisplayTokenBalance();

  const isDarkTheme = paletteId === 'dark';
  const themeSummary = t(isDarkTheme ? 'settings.palette.dark' : 'settings.palette.default');
  const selectedContentLocaleValues = contentLocalePriorityToArray(contentLocales);
  const selectedContentLocales = selectedContentLocaleValues
    .map((locale) => getLocaleName(locale, 'english'))
    .join(', ');
  const contentLanguageSummary =
    selectedContentLocales || t('settings.noTriviaLanguagesSelected');
  const formattedTokens = formatTokens(tokens, uiLocale);
  const userDisplayName = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || t('common.profile');
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const userInitial = userDisplayName.trim().charAt(0).toUpperCase() || 'U';

  const rowDir = getRowDirection(direction);
  const isCompactLayout = width < 980;
  const canvas = T.colors.canvas;
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;
  const SOFT_SURFACE_FACE = isDarkTheme
    ? { ...LIGHT_SURFACE_FACE, borderTopWidth: 0, borderTopColor: 'transparent' }
    : LIGHT_SURFACE_FACE;
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)');
  };

  const toggleContentLocale = (locale: NonEnglishContentLocale) => {
    if (selectedContentLocaleValues.includes(locale)) {
      setContentLocales(selectedContentLocaleValues.filter((value) => value !== locale));
      return;
    }

    if (selectedContentLocaleValues.length >= MAX_CONTENT_LOCALES) {
      return;
    }

    setContentLocales([...selectedContentLocaleValues, locale]);
  };

  const openDeleteAccountModal = () => {
    setDeleteAccountError(null);
    setDeleteAccountModalVisible(true);
  };

  const closeDeleteAccountModal = () => {
    if (isDeletingAccount) return;
    setDeleteAccountModalVisible(false);
    setDeleteAccountError(null);
  };

  const confirmDeleteAccount = async () => {
    if (isDeletingAccount) return;

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      await deleteAccount({});
      await logOutRevenueCat();
      await signOut?.();
      setDeleteAccountModalVisible(false);
      router.replace('/(app)');
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : t('settings.deleteAccountFailed');
      setDeleteAccountError(message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView
      collapsable={false}
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: canvas }]}
    >
      <ScreenContent fullWidth style={styles.settingsViewport}>
        {/* One frame owns outer gutter so header controls and content cards share edges. */}
        <View style={[styles.contentFrame, horizontalPad]}>
        <View
          style={[
            styles.header,
            {
              minHeight: Math.round(
                (Platform.OS === 'web' ? HEADER.heightWeb : HEADER.heightNative) * viewportScale
              ),
              paddingTop: getStandardChromeTopPadding(Platform.OS === 'web') * viewportScale,
              paddingBottom: SPACING.xs * viewportScale,
            },
          ]}
        >
          <View style={styles.headerSide}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={({ pressed }) => [
                styles.backButton,
                SOFT_SURFACE_FACE,
                softSurfaceLift(),
                {
                  width: Math.round(44 * viewportScale),
                  height: Math.round(44 * viewportScale),
                  borderRadius: Math.round(14 * viewportScale),
                  backgroundColor: surface,
                },
                {
                  opacity: pressed ? 0.9 : 1,
                  transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
                },
              ]}
            >
              <Ionicons
                name={direction === 'rtl' ? 'chevron-forward' : 'chevron-back'}
                size={Math.round(22 * viewportScale)}
                color={textPrimary}
              />
            </Pressable>
          </View>
          <View style={styles.headerCenter}>
            <Text
              style={[
                styles.headerTitle,
                {
                  color: textPrimary,
                  fontSize: Math.round(20 * viewportScale),
                  letterSpacing: 0.8 * viewportScale,
                },
              ]}
              accessibilityRole="header"
            >
              {t('common.settings').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            <HubTokenChip
              label={t('common.tokens')}
              value={formattedTokens}
              rowDirection={rowDir}
              variant="softUi"
              scale={viewportScale}
              onPress={() => router.push('/(app)/store')}
              accessibilityLabel={`${t('common.tokens')}: ${formattedTokens}`}
            />
          </View>
        </View>

        <ScrollView
          style={styles.settingsScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.settingsColumns, isCompactLayout && styles.settingsColumnsCompact]}>
            <View style={styles.settingsCol}>
              {isSignedIn && user ? (
                <View
                  testID="settings-user-profile-card"
                  style={[
                    styles.userProfileCard,
                    SOFT_SURFACE_FACE,
                    softSurfaceLift(),
                    { backgroundColor: surface, flexDirection: rowDir },
                  ]}
                >
                  {user.imageUrl ? (
                    <Image source={{ uri: user.imageUrl }} style={styles.userAvatar} />
                  ) : (
                    <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                      <Text style={[styles.userAvatarInitial, { color: textPrimary }]}>{userInitial}</Text>
                    </View>
                  )}
                  <View style={styles.userProfileTextBlock}>
                    <Text style={[styles.userProfileKicker, { color: textMuted }]}>
                      {t('settings.accountAuthTitle').toUpperCase()}
                    </Text>
                    <Text style={[styles.userProfileName, { color: textPrimary }]} numberOfLines={1}>
                      {userDisplayName}
                    </Text>
                    {userEmail ? (
                      <Text style={[styles.userProfileEmail, { color: textMuted }]} numberOfLines={1}>
                        {userEmail}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View
                style={[
                  styles.prefsGroup,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  { backgroundColor: surface },
                ]}
              >
                {__DEV__ ? (
                  <Pressable
                    testID="settings-debug-winner-screen"
                    accessibilityRole="button"
                    accessibilityLabel="Debug: open winner screen"
                    onPress={() => {
                      loadDebugWinnerSession();
                      router.push('/play/end');
                    }}
                    style={({ pressed }) => [
                      styles.prefRow,
                      { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                      pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                    ]}
                  >
                    <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                      <Ionicons name="flag-outline" size={18} color={textPrimary} />
                      <View style={styles.prefTextBlock}>
                        <Text style={[styles.prefLabel, { color: textPrimary }]} numberOfLines={1}>
                          Debug: Winner screen
                        </Text>
                        <Text style={[styles.prefMeta, { color: textMuted }]} numberOfLines={1}>
                          Jump to match-complete UI (dev only)
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ) : null}

                {/* Theme toggle */}
                <Pressable
                  testID="settings-theme-toggle"
                  accessibilityRole="switch"
                  accessibilityLabel={t('settings.themeSelectionTitle')}
                  accessibilityState={{ checked: isDarkTheme }}
                  onPress={() => setPalette(isDarkTheme ? 'default' : 'dark')}
                  style={({ pressed }) => [
                    styles.prefRow,
                    { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                    pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                  ]}
                >
                  <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                      <Ionicons name={isDarkTheme ? 'moon-outline' : 'sunny-outline'} size={18} color={textPrimary} />
                      <View style={styles.prefTextBlock}>
                        <Text
                          style={[styles.prefLabel, { color: textPrimary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {t('settings.themeSelectionTitle')}
                        </Text>
                        <Text
                          style={[styles.prefMeta, { color: textMuted }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {themeSummary}
                        </Text>
                      </View>
                  </View>
                </Pressable>

                {/* Game text size: cycles small, medium, large */}
                <Pressable
                  testID="settings-display-mode-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.displayModeTitle')}
                  onPress={() => setPlayDisplayMode(nextPlayDisplayMode(playDisplayMode))}
                  style={({ pressed }) => [
                    styles.prefRow,
                    { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                    pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                  ]}
                >
                  <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                    <Ionicons
                      name={
                        playDisplayMode === 'tv'
                          ? 'tv-outline'
                          : playDisplayMode === 'laptop'
                            ? 'laptop-outline'
                            : 'phone-portrait-outline'
                      }
                      size={18}
                      color={textPrimary}
                    />
                    <View style={styles.prefTextBlock}>
                      <Text style={[styles.prefLabel, { color: textPrimary }]} numberOfLines={1}>
                        {t('settings.displayModeTitle')}
                      </Text>
                      <Text style={[styles.prefMeta, { color: textMuted }]} numberOfLines={1}>
                        {t(`settings.displayMode.${playDisplayMode}`)}
                      </Text>
                    </View>
                    <View
                      testID="settings-display-mode-dots"
                      style={[styles.sizeDots, { flexDirection: rowDir }]}
                      pointerEvents="none"
                    >
                      {PLAY_DISPLAY_MODES.map((mode: PlayDisplayMode) => {
                        const active = playDisplayMode === mode;
                        return (
                          <View
                            key={mode}
                            testID={`settings-display-mode-dot-${mode}`}
                            style={[
                              styles.sizeDot,
                              active
                                ? { backgroundColor: textPrimary, borderColor: textPrimary }
                                : {
                                    backgroundColor: 'transparent',
                                    borderColor: textMuted,
                                  },
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>
                </Pressable>

                {SHOW_LANGUAGE_SETTINGS_UI ? (
                  <>
                    {/* App language */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.appLanguageTitle')}
                      onPress={() => setLanguageModalVisible(true)}
                      style={({ pressed }) => [
                        styles.prefRow,
                        { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                        pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                      ]}
                    >
                      <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                          <Ionicons name="language-outline" size={18} color={textPrimary} />
                          <View style={styles.prefTextBlock}>
                            <Text
                              style={[styles.prefLabel, { color: textPrimary }]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {t('settings.appLanguageTitle')}
                            </Text>
                            <Text
                              style={[styles.prefMeta, { color: textMuted }]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {getLocaleName(uiLocale, 'both')}
                            </Text>
                          </View>
                      </View>
                    </Pressable>

                    {/* Content languages */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings.languagesUpToTwoTitle')}
                      onPress={() => setContentLanguagesModalVisible(true)}
                      style={({ pressed }) => [
                        styles.prefRow,
                        { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                        pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                      ]}
                    >
                      <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                          <Ionicons name="chatbubbles-outline" size={18} color={textPrimary} />
                          <View style={styles.prefTextBlock}>
                            <Text
                              style={[styles.prefLabel, { color: textPrimary }]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {t('settings.languagesUpToTwoTitle')}
                            </Text>
                            <Text
                              style={[styles.prefMeta, { color: textMuted }]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {contentLanguageSummary}
                            </Text>
                          </View>
                      </View>
                    </Pressable>
                  </>
                ) : null}

              </View>

              <View
                style={[
                  styles.prefsGroup,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  { backgroundColor: surface },
                ]}
              >
                <Text
                  accessibilityRole="header"
                  style={[styles.prefsGroupHeader, { color: textMuted }]}
                >
                  {t('settings.legalHeading').toUpperCase()}
                </Text>
                <Pressable
                  testID="settings-legal-terms"
                  accessibilityRole="button"
                  accessibilityLabel={t('legal.termsTitle')}
                  onPress={() => router.push('/terms')}
                  style={({ pressed }) => [
                    styles.prefRow,
                    { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                    pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                  ]}
                >
                  <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                    <Ionicons name="document-text-outline" size={18} color={textPrimary} />
                    <View style={styles.prefTextBlock}>
                      <Text
                        style={[styles.prefLabel, { color: textPrimary }]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {t('legal.termsTitle')}
                      </Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  testID="settings-legal-privacy"
                  accessibilityRole="button"
                  accessibilityLabel={t('legal.privacyTitle')}
                  onPress={() => router.push('/privacy')}
                  style={({ pressed }) => [
                    styles.prefRowLast,
                    { flexDirection: rowDir },
                    pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                  ]}
                >
                  <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={textPrimary} />
                    <View style={styles.prefTextBlock}>
                      <Text
                        style={[styles.prefLabel, { color: textPrimary }]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {t('legal.privacyTitle')}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              {isSignedIn ? (
                <View
                  style={[
                    styles.authCard,
                    SOFT_SURFACE_FACE,
                    softSurfaceLift(),
                    { backgroundColor: surface },
                  ]}
                >
                  <Pressable
                    testID="settings-sign-out-button"
                    accessibilityRole="button"
                    accessibilityLabel={t('common.signOut')}
                    style={({ pressed }) => [
                      styles.prefRow,
                      { flexDirection: rowDir, borderBottomColor: 'rgba(0,0,0,0.06)' },
                      pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                    ]}
                    onPress={() => {
                      void signOut?.();
                    }}
                  >
                    <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                      <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                      <View style={styles.prefTextBlock}>
                        <Text
                          style={[styles.prefLabel, { color: '#DC2626' }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {t('common.signOut')}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    testID="settings-delete-account-button"
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.deleteAccount')}
                    style={({ pressed }) => [
                      styles.prefRowLast,
                      { flexDirection: rowDir },
                      pressed && { backgroundColor: 'rgba(0,0,0,0.03)' },
                    ]}
                    onPress={openDeleteAccountModal}
                  >
                    <View style={[styles.prefMain, { flexDirection: rowDir }]}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      <View style={styles.prefTextBlock}>
                        <Text
                          style={[styles.prefLabel, { color: '#DC2626' }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {t('settings.deleteAccount')}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              ) : !authDisabled ? (
                <View style={styles.publicAuthInSettings}>
                  <PublicAuthEntry
                    showCreateAccount={Platform.OS === 'web'}
                    style={styles.publicAuthEntry}
                  />
                </View>
              ) : null}

              <OutboundPlatformLinks color={textMuted} style={styles.outboundLinks} />
            </View>
          </View>
        </ScrollView>
        </View>
      </ScreenContent>

      <WebAwareModal
        visible={isDeleteAccountModalVisible}
        onRequestClose={closeDeleteAccountModal}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.deleteAccountCancel')}
            style={styles.modalBackdrop}
            onPress={closeDeleteAccountModal}
            disabled={isDeletingAccount}
          />
          <View
            testID="settings-delete-account-modal"
            style={[
              styles.deleteAccountModalCard,
              SOFT_SURFACE_FACE,
              softSurfaceLift(),
              { backgroundColor: surface },
            ]}
          >
            <Text style={[styles.themeModalTitle, { color: textPrimary }]}>
              {t('settings.deleteAccountTitle')}
            </Text>
            <Text style={[styles.deleteAccountBody, { color: textMuted }]}>
              {t('settings.deleteAccountBody')}
            </Text>
            {deleteAccountError ? (
              <Text testID="settings-delete-account-error" style={styles.deleteAccountError}>
                {deleteAccountError}
              </Text>
            ) : null}
            {isDeletingAccount ? (
              <View
                testID="settings-delete-account-loading"
                style={[styles.deleteAccountLoadingRow, { flexDirection: rowDir }]}
              >
                <ActivityIndicator color={textPrimary} />
                <Text style={[styles.deleteAccountLoadingText, { color: textMuted }]}>
                  {t('settings.deleteAccountInProgress')}
                </Text>
              </View>
            ) : null}
            <View style={[styles.deleteAccountActions, { flexDirection: rowDir }]}>
              <Pressable
                testID="settings-delete-account-cancel"
                accessibilityRole="button"
                accessibilityLabel={t('settings.deleteAccountCancel')}
                disabled={isDeletingAccount}
                onPress={closeDeleteAccountModal}
                style={({ pressed }) => [
                  styles.deleteAccountSecondaryButton,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  {
                    backgroundColor: surface,
                    opacity: isDeletingAccount ? 0.5 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={[styles.deleteAccountSecondaryLabel, { color: textPrimary }]}>
                  {t('settings.deleteAccountCancel')}
                </Text>
              </Pressable>
              <Pressable
                testID="settings-delete-account-confirm"
                accessibilityRole="button"
                accessibilityLabel={t('settings.deleteAccountConfirm')}
                disabled={isDeletingAccount}
                onPress={() => {
                  void confirmDeleteAccount();
                }}
                style={({ pressed }) => [
                  styles.deleteAccountDangerButton,
                  {
                    opacity: isDeletingAccount ? 0.55 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={styles.deleteAccountDangerLabel}>
                  {t('settings.deleteAccountConfirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </WebAwareModal>

      {SHOW_LANGUAGE_SETTINGS_UI ? (
      <>
      <WebAwareModal
        visible={isLanguageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.closeLanguagePicker')}
            style={styles.modalBackdrop}
            onPress={() => setLanguageModalVisible(false)}
          />
          <View
            style={[
              styles.themeModalCard,
              SOFT_SURFACE_FACE,
              softSurfaceLift(),
              { backgroundColor: surface },
            ]}
          >
            <View style={styles.themeModalHeader}>
              <View>
                <Text style={[styles.themeModalTitle, { color: textPrimary }]}> 
                  {t('settings.appLanguageTitle').toUpperCase()}
                </Text>
                <Text style={[styles.themeModalSubtitle, { color: textMuted }]}>{t('settings.appLanguagePickerDescription')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.closeLanguagePicker')}
                onPress={() => setLanguageModalVisible(false)}
                style={({ pressed }) => [
                  styles.themeModalCloseButton,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  {
                    backgroundColor: surface,
                    opacity: pressed ? 0.94 : 1,
                    transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                  },
                ]}
              >
                <Ionicons name="close" size={20} color={textPrimary} />
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.languageRow}>
              {SUPPORTED_LOCALES.map((locale) => {
                const isSelected = locale === uiLocale;
                return (
                  <Pressable
                    key={locale}
                    accessibilityRole="button"
                    accessibilityLabel={`${getLocaleName(locale, 'english')} ${t('settings.appLanguageTitle')}`}
                    onPress={() => setUiLocale(locale)}
                    style={({ pressed }) => [
                      styles.languageCard,
                      SOFT_SURFACE_FACE,
                      softSurfaceLift(),
                      {
                        backgroundColor: surface,
                        opacity: pressed ? 0.94 : 1,
                        borderColor: isSelected ? textPrimary : 'rgba(51, 51, 51, 0.08)',
                      },
                    ]}
                  >
                    <View style={styles.themePaletteTextBlock}>
                      <Text style={[styles.languagePrimaryLabel, { color: textPrimary }]}> 
                        {getLocaleName(locale, 'native').toUpperCase()}
                      </Text>
                      <Text style={[styles.themePaletteMeta, { color: textMuted }]}> 
                        {getLocaleName(locale, 'english')}
                      </Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={22} color={textPrimary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </WebAwareModal>

      <WebAwareModal
        visible={isContentLanguagesModalVisible}
        onRequestClose={() => setContentLanguagesModalVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.closeTriviaLanguagesPicker')}
            style={styles.modalBackdrop}
            onPress={() => setContentLanguagesModalVisible(false)}
          />
          <View
            style={[
              styles.themeModalCard,
              SOFT_SURFACE_FACE,
              softSurfaceLift(),
              { backgroundColor: surface },
            ]}
          >
            <View style={styles.themeModalHeader}>
              <View>
                <Text style={[styles.themeModalTitle, { color: textPrimary }]}>{t('settings.triviaLanguagesTitle').toUpperCase()}</Text>
                <Text style={[styles.themeModalSubtitle, { color: textMuted }]}>{t('settings.triviaLanguagesDescription')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.closeTriviaLanguagesPicker')}
                onPress={() => setContentLanguagesModalVisible(false)}
                style={({ pressed }) => [
                  styles.themeModalCloseButton,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  {
                    backgroundColor: surface,
                    opacity: pressed ? 0.94 : 1,
                    transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                  },
                ]}
              >
                <Ionicons name="close" size={20} color={textPrimary} />
              </Pressable>
            </View>

            {selectedContentLocaleValues.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedLanguageRow}>
                {selectedContentLocaleValues.map((locale, index) => (
                  <View
                    key={locale}
                    style={[
                      styles.selectedLanguageCard,
                      SOFT_SURFACE_FACE,
                      softSurfaceLift(),
                      { backgroundColor: surface },
                    ]}
                  >
                    <View style={styles.themePaletteTextBlock}>
                      <Text style={[styles.themePaletteName, { color: textPrimary }]}>{getLocaleName(locale, 'native')}</Text>
                      <Text style={[styles.themePaletteMeta, { color: textMuted }]}>{t('common.priorityLabel', { count: index + 1 })}</Text>
                    </View>
                    <View style={styles.priorityActions}>
                      <Pressable
                        onPress={() => index > 0 && moveContentLocale(index as ContentLocaleSlot, (index - 1) as ContentLocaleSlot)}
                        disabled={index === 0}
                      >
                        <Ionicons name="arrow-up" size={18} color={index === 0 ? 'rgba(51,51,51,0.32)' : textMuted} />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          index < selectedContentLocaleValues.length - 1 &&
                          moveContentLocale(index as ContentLocaleSlot, (index + 1) as ContentLocaleSlot)
                        }
                        disabled={index === selectedContentLocaleValues.length - 1}
                      >
                        <Ionicons
                          name="arrow-down"
                          size={18}
                          color={index === selectedContentLocaleValues.length - 1 ? 'rgba(51,51,51,0.32)' : textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.contentLanguageHeader}>
              <Text style={[styles.themePaletteName, { color: textPrimary }]}>{t('common.languages')}</Text>
              <Text style={[styles.themePaletteMeta, { color: textMuted }]}>{selectedContentLocaleValues.length}/{MAX_CONTENT_LOCALES}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.themePaletteGrid}>
              {SELECTABLE_CONTENT_LOCALES.map((locale) => {
                const isSelected = selectedContentLocaleValues.includes(locale);
                const disabled = !isSelected && selectedContentLocaleValues.length >= MAX_CONTENT_LOCALES;
                return (
                  <Pressable
                    key={locale}
                    accessibilityRole="button"
                    accessibilityLabel={`${getLocaleName(locale, 'english')} ${t('settings.triviaLanguagesTitle')}`}
                    onPress={() => toggleContentLocale(locale)}
                    disabled={disabled}
                    style={({ pressed }) => [
                      styles.themePaletteCard,
                      SOFT_SURFACE_FACE,
                      softSurfaceLift(),
                      {
                        backgroundColor: surface,
                        opacity: disabled ? 0.5 : pressed ? 0.94 : 1,
                        borderColor: isSelected ? textPrimary : 'rgba(51, 51, 51, 0.08)',
                      },
                    ]}
                  >
                    <View style={styles.themePaletteTextBlock}>
                      <Text style={[styles.themePaletteName, { color: textPrimary }]}>{getLocaleName(locale, 'native')}</Text>
                      <Text style={[styles.themePaletteMeta, { color: textMuted }]}>{getLocaleName(locale, 'english')}</Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={22} color={textPrimary} /> : null}
                  </Pressable>
                );
              })}
              <View
                style={[
                  styles.themePaletteCard,
                  SOFT_SURFACE_FACE,
                  softSurfaceLift(),
                  { backgroundColor: surface, borderColor: 'rgba(51, 51, 51, 0.08)', opacity: 0.82 },
                ]}
              >
                <View style={styles.themePaletteTextBlock}>
                  <Text style={[styles.themePaletteName, { color: textPrimary }]}>{t('common.english')}</Text>
                  <Text style={[styles.themePaletteMeta, { color: textMuted }]}>{t('settings.englishFallback')}</Text>
                </View>
                <Ionicons name="lock-closed" size={18} color={textMuted} />
              </View>
            </ScrollView>
          </View>
        </View>
      </WebAwareModal>
      </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  settingsViewport: {
    flex: 1,
  },
  /** Shared outer gutter - header controls and content cards share the same edges. */
  contentFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    minWidth: 0,
    minHeight: 0,
  },
  settingsScroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: Platform.OS === 'web' ? HEADER.heightWeb : HEADER.heightNative,
    paddingTop: getStandardChromeTopPadding(Platform.OS === 'web'),
    paddingBottom: SPACING.xs,
  },
  headerSide: {
    // Grow with content (token chip) — fixed width was clipping larger balances.
    minWidth: 44,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: 20,
    letterSpacing: 0.8,
    marginBottom: 0,
  },
  settingsColumns: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  settingsColumnsCompact: {
    flexDirection: 'column',
    gap: SPACING.lg,
  },
  settingsCol: {
    flex: 1,
    gap: SPACING.lg,
  },
  prefsGroup: {
    borderRadius: BORDER_RADIUS.button,
    overflow: 'hidden',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
  },
  prefsGroupHeader: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    opacity: 0.65,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  authCard: {
    borderRadius: BORDER_RADIUS.button,
    overflow: 'hidden',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  outboundLinks: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  publicAuthInSettings: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  publicAuthEntry: {
    alignSelf: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  userProfileCard: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.button,
    gap: SPACING.md,
    overflow: 'hidden',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  userAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(51, 51, 51, 0.08)',
  },
  userAvatarInitial: {
    fontFamily: FONTS.uiBold,
    fontSize: 22,
    lineHeight: 28,
  },
  userProfileTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  userProfileKicker: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    opacity: 0.65,
  },
  userProfileName: {
    fontFamily: FONTS.uiBold,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 3,
  },
  userProfileEmail: {
    fontFamily: FONTS.ui,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    opacity: 0.75,
  },
  prefRow: {
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
    borderBottomWidth: 0,
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.button,
  },
  prefRowLast: {
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.button,
  },
  prefLabel: {
    fontFamily: FONTS.uiSemibold,
    fontSize: 14,
    lineHeight: 18,
  },
  prefTextBlock: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  prefMain: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.md,
    minWidth: 0,
  },
  prefMeta: {
    fontFamily: FONTS.ui,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    opacity: 0.75,
  },
  sizeDots: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  sizeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  modalRoot: {
    // Absolute fill (not flex-only) so web fixed shells always dim the full viewport.
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  themeModalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '86%',
    borderRadius: BORDER_RADIUS.button,
    padding: SPACING.xl,
    gap: SPACING.lg,
    zIndex: 2,
  },
  themeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  themeModalTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0.8,
  },
  themeModalSubtitle: {
    marginTop: 4,
    fontFamily: FONTS.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  themeModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAccountModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: BORDER_RADIUS.button,
    padding: SPACING.xl,
    gap: SPACING.md,
    zIndex: 2,
  },
  deleteAccountBody: {
    fontFamily: FONTS.ui,
    fontSize: 14,
    lineHeight: 21,
  },
  deleteAccountError: {
    fontFamily: FONTS.ui,
    fontSize: 13,
    lineHeight: 18,
    color: '#DC2626',
  },
  deleteAccountLoadingRow: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  deleteAccountLoadingText: {
    fontFamily: FONTS.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteAccountActions: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  deleteAccountSecondaryButton: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAccountSecondaryLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 14,
  },
  deleteAccountDangerButton: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
  },
  deleteAccountDangerLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  themePaletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  themePaletteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    width: '47%',
    minWidth: 148,
    maxWidth: '100%',
    borderWidth: 1.5,
    borderRadius: BORDER_RADIUS.button,
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  themePaletteTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  themePaletteName: {
    fontFamily: FONTS.uiSemibold,
    fontSize: 16,
    lineHeight: 22,
  },
  themePaletteMeta: {
    marginTop: 2,
    fontFamily: FONTS.ui,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.75,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  languageCard: {
    width: 220,
    minHeight: 120,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: BORDER_RADIUS.button,
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  languagePrimaryLabel: {
    fontFamily: FONTS.displayBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  selectedLanguageRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  selectedLanguageCard: {
    width: 220,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BORDER_RADIUS.button,
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  priorityActions: {
    gap: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentLanguageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
});

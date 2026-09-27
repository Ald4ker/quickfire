import { useState, useCallback, useMemo } from 'react';
import { isDarkPaletteId } from '@/constants/studio';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { showThemedAlert } from '@/store/themedAlert';
import { Pressable } from '@/components/ui/Pressable';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SPACING,
  FONTS,
  SOFT_SURFACE_FACE,
  softSurfaceLift,
  getStandardChromeTopPadding,
} from '@/constants';
import { ScreenContent } from '@/components/ScreenContent';
import { HubTokenChip } from '@/components/HubTokenChip';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import {
  formatTokens,
  buildDisplayBundles,
  type DisplayBundle,
} from '@/features/play/storeBundles';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { isAuthDisabled } from '@/lib/authMode';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import { useTokenPurchases } from '@/lib/hooks/useTokenPurchases';
import { resolveDisplayTokenBalance } from '@/lib/wallet/displayTokenBalance';
import { HOME_SOFT_UI } from '@/themes';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';
import { ReferralModal } from '@/components/ReferralModal';

const T = HOME_SOFT_UI;

const SIGN_IN_TO_REDEEM_MESSAGE = 'Sign in to redeem promo codes.';

const PROMO_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: 'That code is invalid or expired.',
  inactive: 'That code is no longer active.',
  not_yet_active: 'That code is not active yet.',
  expired: 'That code has expired.',
  usage_cap: 'That code has already been fully redeemed.',
  per_user_cap: 'You have already redeemed that code.',
  already_redeemed: 'You have already redeemed that code.',
  account_restricted: 'That code is restricted to another account.',
  idempotency_required: 'Please try redeeming that code again.',
  rate_limited: 'Too many redemption attempts. Please try again later.',
  discount_checkout_unavailable:
    'This discount code cannot be applied yet. Website checkout discounts are not available.',
};

function getPromoErrorMessage(error?: string) {
  if (!error) return 'Unable to redeem that code. Please try again.';
  return PROMO_ERROR_MESSAGES[error] ?? 'Unable to redeem that code. Please try again.';
}

// ── Helpers ────────────────────────────────────────────────────────────────

const IS_IOS_PLATFORM = Platform.OS === 'ios';
const IS_ANDROID_PLATFORM = Platform.OS === 'android';
const IS_NATIVE_PLATFORM = IS_IOS_PLATFORM || IS_ANDROID_PLATFORM;
/** Promo redeem UI is web-only. Native apps deep-link to playbackfire.com. */
const IS_WEB_PLATFORM = Platform.OS === 'web';
const PLAYBACKFIRE_SITE_URL = 'https://playbackfire.com';
// Web is purchaseable when a RevenueCat Web Billing key is configured.
const IS_WEB_PURCHASE_ENABLED =
  Platform.OS === 'web' &&
  !!(process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY ?? '').trim();
const IS_PURCHASE_PLATFORM = IS_NATIVE_PLATFORM || IS_WEB_PURCHASE_ENABLED;

export const getStoreViewportScale = getWebViewportScale;

// ── Sub-components ─────────────────────────────────────────────────────────

function BundleCard({
  bundle,
  onPress,
  isPurchasing,
  isPurchaseUnavailable,
  compact,
  tight,
  viewportScale,
}: {
  bundle: DisplayBundle;
  onPress: () => void;
  isPurchasing: boolean;
  isPurchaseUnavailable: boolean;
  compact: boolean;
  tight: boolean;
  viewportScale: number;
}) {
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;
  const accentGlow = T.colors.accentGlow;
  const darkModeFlatTop = useDarkModeFlatTop();

  const buyDisabled = isPurchasing || isPurchaseUnavailable;
  const buyLabel = isPurchasing
    ? '...'
    : isPurchaseUnavailable
      ? '-'
      : 'BUY';

  return (
    <View style={styles.bundleCardWrapper}>
      <Pressable
        style={({ pressed }) => [
          styles.bundleCard,
          compact && styles.bundleCardCompact,
          tight && styles.bundleCardTight,
          SOFT_SURFACE_FACE,
          darkModeFlatTop,
          softSurfaceLift(),
          {
            minHeight: Math.round((tight ? 128 : compact ? 138 : 150) * viewportScale),
            borderRadius: Math.round(14 * viewportScale),
            paddingVertical: Math.round((compact ? 10 : 12) * viewportScale),
            paddingHorizontal: Math.round((compact ? 6 : 8) * viewportScale),
            backgroundColor: surface,
            opacity: buyDisabled ? 0.6 : pressed ? 0.96 : 1,
            transform: pressed && !buyDisabled ? [{ scale: 0.98 }] : [{ scale: 1 }],
          },
        ]}
        onPress={buyDisabled ? undefined : onPress}
        disabled={buyDisabled}
      >
        <Text
          style={[
            styles.bundleAmount,
            compact && styles.bundleAmountCompact,
            { color: textPrimary, fontSize: Math.round((compact ? 21 : 24) * viewportScale) },
          ]}
        >
          {formatTokens(bundle.tokensGranted)}
        </Text>
        <Text
          style={[
            styles.bundleLabel,
            compact && styles.bundleLabelCompact,
            { color: textMuted, fontSize: Math.round((compact ? 9 : 10) * viewportScale) },
          ]}
        >
          TOKENS
        </Text>

        {/* Bonus display not available from catalog; kept for layout parity */}
        <View style={[styles.bundleBonusSpacer, { height: Math.round(10 * viewportScale) }]} />

        <Text
          style={[
            styles.bundlePrice,
            compact && styles.bundlePriceCompact,
            {
              color: textPrimary,
              fontSize: Math.round((compact ? 15 : 17) * viewportScale),
              marginTop: Math.round((compact ? 2 : 4) * viewportScale),
              marginBottom: Math.round((compact ? 4 : 6) * viewportScale),
            },
          ]}
        >
          {bundle.priceLabel}
        </Text>

        <View
          style={[
            styles.buyButton,
            compact && styles.buyButtonCompact,
            SOFT_SURFACE_FACE,
            darkModeFlatTop,
            {
              height: Math.round((compact ? 28 : 30) * viewportScale),
              borderRadius: Math.round(14 * viewportScale),
              backgroundColor: isPurchaseUnavailable ? textMuted : accentGlow,
            },
          ]}
        >
          {isPurchasing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              style={[
                styles.buyButtonText,
                {
                  fontSize: Math.round(10 * viewportScale),
                  letterSpacing: 0.4 * viewportScale,
                },
              ]}
            >
              {buyLabel}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const authDisabled = isAuthDisabled();
  const { direction, t } = useI18n();
  const rowDir = getRowDirection(direction);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { paddingLeft, paddingRight } = topicCardScreenPadding(width, insets, Platform.OS === 'web');
  const horizontalPad = { paddingLeft, paddingRight };
  const darkModeFlatTop = useDarkModeFlatTop();
  const isDarkTheme = isDarkPaletteId(useThemeStore((s) => s.paletteId));
  const isCompactViewport = height < 740 || width < 390;
  const isTightViewport = height < 660;
  const viewportScale = Platform.OS === 'web' ? getStoreViewportScale(width, height) : 1;

  // Local play store (fallback token display).
  const localTokens = usePlayStore((state) => state.tokens);

  // Convex queries. The web storefront requests the web catalog; native
  // requests the native one (old clients that omit the argument get native).
  const catalog = useQuery(api.payments.getCatalog, {
    platform: Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android',
  });
  const balanceData = useQuery(api.wallet.getBalance, {});

  // Promo redemption + discount validation (unified single coupon box).
  const applyPromoCode = useMutation(api.promo.applyPromoCode);
  const [referralOpen, setReferralOpen] = useState(false);

  // Display token balance: signed-out users always see 0.
  const displayTokens = resolveDisplayTokenBalance({
    authDisabled,
    isSignedIn,
    storedTokens:
      balanceData && balanceData.balance != null
        ? balanceData.balance
        : localTokens,
  });
  const formattedDisplayTokens = formatTokens(displayTokens);

  // ── RevenueCat purchases ────────────────────────────────────────────────

  const catalogProducts = useMemo(() => {
    if (!catalog) return undefined;
    return catalog.map((p) => ({
      productKey: p.productKey,
      tokensGranted: p.tokensGranted,
      iosProductId: p.iosProductId,
      androidProductId: p.androidProductId,
      webProductId: p.webProductId,
      sortOrder: p.sortOrder,
    }));
  }, [catalog]);

  const {
    products: nativeProducts,
    isReady: rcReady,
    isPurchasing,
    isSupported: rcSupported,
    error: rcError,
    purchase,
  } = useTokenPurchases({
    catalog: catalogProducts,
    enabled: IS_PURCHASE_PLATFORM && !!catalogProducts?.length,
  });

  const isPurchaseUnavailable = !IS_PURCHASE_PLATFORM || !rcReady || !!rcError;
  const purchaseUnavailableReason = !IS_PURCHASE_PLATFORM
    ? 'Available on iOS, Android & web'
    : rcError
      ? rcError
      : !rcReady
        ? 'Loading store…'
        : null;

  // Build display bundles from Convex catalog + native prices.
  const displayBundles: DisplayBundle[] = useMemo(() => {
    if (!catalog) return [];
    return buildDisplayBundles(catalog, nativeProducts, Platform.OS);
  }, [catalog, nativeProducts]);

  // ── Buy handler ─────────────────────────────────────────────────────────

  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  // ── Unified coupon code (web checkout) ─────────────────────────────────
  // A single input. The server (applyPromoCode) determines whether the code
  // is a token reward (granted immediately) or a product-scoped discount
  // (creates a pending claim and returns the matching bundle). For discounts,
  // the client holds the code + bundle to pass to RC Web Billing checkout.
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    productKey: string;
    discountPercent: number;
    expiresAt: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const handleCouponCodeChange = useCallback(
    (text: string) => {
      setCouponCodeInput(text);
      if (couponError) setCouponError('');
      if (couponSuccess) setCouponSuccess('');
      // Clear any previously applied discount when the user edits the field.
      if (appliedDiscount) setAppliedDiscount(null);
    },
    [appliedDiscount, couponError, couponSuccess]
  );

  const applyCouponCode = useCallback(async () => {
    setCouponError('');
    setCouponSuccess('');

    const code = couponCodeInput.trim();
    if (!code || isApplyingCoupon) {
      if (!code) setCouponError('Enter a promo or discount code.');
      return;
    }

    if (!isSignedIn) {
      showThemedAlert(SIGN_IN_TO_REDEEM_MESSAGE);
      router.push('/(auth)/sign-in');
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const result = await applyPromoCode({
        code,
        clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      if (!result.success) {
        setCouponError(getPromoErrorMessage(result.error));
        setAppliedDiscount(null);
        return;
      }

      if (result.kind === 'tokens') {
        // Token reward: granted server-side. Clear the input.
        setCouponCodeInput('');
        if (result.duplicate) {
          setCouponSuccess('That code has already been redeemed.');
        } else {
          const granted =
            result.tokensGranted != null && result.tokensGranted > 0
              ? result.tokensGranted
              : null;
          setCouponSuccess(
            granted != null
              ? `${formatTokens(granted)} tokens added to your balance.`
              : t('store.voucherSuccess')
          );
        }
      } else {
        // Discount: server created a pending claim for promo.productKey.
        // Hold the code + bundle so checkout passes it to RC Web Billing.
        setAppliedDiscount({
          code: code.toLowerCase(),
          productKey: result.productKey,
          discountPercent: result.discountPercent,
          expiresAt: result.expiresAt,
        });
        const discountTokens =
          catalogProducts?.find((p) => p.productKey === result.productKey)?.tokensGranted;
        const discountBundleLabel =
          discountTokens != null ? `${discountTokens}-token` : result.productKey;
        setCouponSuccess(
          `${result.discountPercent}% off ready for the ${discountBundleLabel} bundle. Tap BUY on that bundle; the discount is applied at checkout and you will see the final price before paying.`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setCouponError(
        message.includes('Not authenticated')
          ? SIGN_IN_TO_REDEEM_MESSAGE
          : 'Unable to apply that code. Please try again.'
      );
      setAppliedDiscount(null);
    } finally {
      setIsApplyingCoupon(false);
    }
  }, [couponCodeInput, isApplyingCoupon, isSignedIn, applyPromoCode, router, t, catalogProducts]);

  const onBuyBundle = useCallback(
    async (bundle: DisplayBundle) => {
      if (!rcSupported || !rcReady || !catalogProducts) {
        if (!rcSupported) {
          showThemedAlert('Unavailable', 'In-app purchases are only available on iOS, Android, and the web app.');
        } else if (!rcReady) {
          showThemedAlert('Not Ready', 'The store is still loading. Please try again shortly.');
        }
        return;
      }

      const catalogProduct = catalogProducts.find(
        (p) => p.productKey === bundle.productKey
      );
      if (!catalogProduct) {
        showThemedAlert('Error', 'This product is no longer available.');
        return;
      }

      // Only pass the discount code when it was validated for this exact
      // bundle. A mismatched code is ignored so checkout never sends a code
      // the server hasn't validated for this product.
      const discountForBundle =
        appliedDiscount && appliedDiscount.productKey === bundle.productKey
          ? appliedDiscount.code
          : undefined;

      setBuyingKey(bundle.productKey);
      try {
        const outcome = await purchase(catalogProduct, { discountCode: discountForBundle });
        if (outcome.granted) {
          const tokens = outcome.tokensGranted || bundle.tokensGranted;
          showThemedAlert(
            'Purchase Complete',
            `${formatTokens(tokens)} tokens added to your balance.`
          );
        } else {
          showThemedAlert(
            'Purchase Complete',
            `Your ${formatTokens(bundle.tokensGranted)} tokens will appear in your balance shortly.`
          );
        }
        // Clear the applied discount after a successful purchase attempt so it
        // cannot be reused for a different bundle. The server-side claim is
        // consumed by the webhook regardless.
        if (discountForBundle) {
          setAppliedDiscount(null);
          setCouponCodeInput('');
          setCouponSuccess('');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        if (message.toLowerCase().includes('cancelled')) {
          return; // Silent on user cancellation.
        }
        showThemedAlert('Purchase Failed', message || 'An unexpected error occurred. Please try again.');
      } finally {
        setBuyingKey(null);
      }
    },
    [appliedDiscount, catalogProducts, purchase, rcReady, rcSupported]
  );

  // ── Navigation ──────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/');
  }, [router]);

  // ── Auth guards ─────────────────────────────────────────────────────────

  if (!isLoaded && !authDisabled) {
    return null;
  }

  if (!isSignedIn && !authDisabled) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const canvas = T.colors.canvas;
  const surface = T.colors.surface;
  const textPrimary = T.colors.textPrimary;
  const textMuted = T.colors.textMuted;
  // Field fill: inset glass on dark; solid surface on light cream.
  const redeemFieldBackground = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : surface;
  const redeemFieldBorder = isDarkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0,0,0,0.08)';
  const applyButtonBackground = T.colors.accentGlow;

  return (
    <SafeAreaView
      collapsable={false}
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: canvas }]}
    >
      <ScreenContent fullWidth style={styles.viewport}>
        {/*
          Equal paddingTop/paddingBottom + space-between:
          outer pad above STORE matches pad below redeem; free height splits evenly
          between header↔cards and cards↔redeem.
        */}
        <View style={[styles.contentFrame, horizontalPad]}>
          {/* ── Header ─────────────────────────────────────── */}
          <View style={[styles.header, { minHeight: Math.round(64 * viewportScale) }]}>
            <View style={styles.headerSide}>
              <Pressable
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                style={({ pressed }) => [
                  styles.backButton,
                  SOFT_SURFACE_FACE,
                  darkModeFlatTop,
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
            {/* Absolute center so STORE lines up with the middle (30) token card. */}
            <View style={styles.headerCenter} pointerEvents="none">
              <Text
                style={[
                  styles.title,
                  {
                    color: textPrimary,
                    fontSize: Math.round(20 * viewportScale),
                    letterSpacing: 0.8 * viewportScale,
                  },
                ]}
              >
                STORE
              </Text>
            </View>
            <View style={[styles.headerSide, styles.headerSideRight]}>
              <HubTokenChip
                label={t('common.tokens')}
                value={formattedDisplayTokens}
                rowDirection={rowDir}
                variant="softUi"
                scale={viewportScale}
                accessibilityLabel={`${t('common.tokens')}: ${formattedDisplayTokens}`}
              />
            </View>
          </View>

          <View
            style={[
              styles.storeBody,
              isCompactViewport && styles.storeBodyCompact,
              isTightViewport && styles.storeBodyTight,
            ]}
          >
            {/* ── Status banner (non-native / error) ──────── */}
            {!IS_PURCHASE_PLATFORM && (
              <View style={[styles.statusBanner, { backgroundColor: surface }]}>
                <Ionicons name="information-circle-outline" size={16} color={textMuted} />
                <Text style={[styles.statusBannerText, { color: textMuted }]}>
                  In-app purchases are only available on iOS, Android, and the web app. Promo codes can be
                  redeemed on the web at playbackfire.com.
                </Text>
              </View>
            )}
            {rcError && (
              <View style={[styles.statusBanner, styles.statusBannerWarning, { backgroundColor: surface }]}>
                <Ionicons name="warning-outline" size={16} color="#D32F2F" />
                <Text style={[styles.statusBannerText, { color: '#D32F2F' }]}>
                  {rcError}
                </Text>
              </View>
            )}
            {IS_PURCHASE_PLATFORM && !rcReady && !rcError && (
              <View style={[styles.statusBanner, { backgroundColor: surface }]}>
                <ActivityIndicator size="small" color={textMuted} />
                <Text style={[styles.statusBannerText, { color: textMuted }]}>
                  {purchaseUnavailableReason}
                </Text>
              </View>
            )}

            {/* ── Loading skeleton ───────────────────────── */}
            {!catalog && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={textMuted} />
                <Text style={[styles.loadingText, { color: textMuted }]}>Loading store…</Text>
              </View>
            )}

            {/* ── Bundle cards ───────────────────────────── */}
            {catalog && (
              <View style={[styles.bundlesContainer, isCompactViewport && styles.bundlesContainerCompact]}>
                {displayBundles.map((bundle) => (
                  <BundleCard
                    key={bundle.productKey}
                    bundle={bundle}
                    onPress={() => onBuyBundle(bundle)}
                    isPurchasing={isPurchasing || buyingKey === bundle.productKey}
                    isPurchaseUnavailable={isPurchaseUnavailable}
                    compact={isCompactViewport}
                    tight={isTightViewport}
                    viewportScale={viewportScale}
                  />
                ))}
              </View>
            )}

            <Text
              style={[
                styles.tokenBalanceHint,
                {
                  color: textMuted,
                  fontSize: Math.round(15 * viewportScale),
                  lineHeight: Math.round(21 * viewportScale),
                },
              ]}
            >
              {t('store.typicalGameTokensHint')}
            </Text>

            {(isSignedIn || authDisabled) && (
              <Pressable
                onPress={() => setReferralOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('store.referral.cta')}
                testID="store-referral-cta"
                style={({ pressed }) => [
                  styles.referralCta,
                  {
                    opacity: pressed ? 0.75 : 1,
                    paddingVertical: Math.round(SPACING.xs * viewportScale),
                    gap: Math.round(6 * viewportScale),
                  },
                ]}
              >
                <Ionicons
                  name="gift-outline"
                  size={Math.round(14 * viewportScale)}
                  color={textMuted}
                />
                <Text
                  style={[
                    styles.referralCtaText,
                    {
                      color: textMuted,
                      fontSize: Math.round(12 * viewportScale),
                      letterSpacing: 0.4 * viewportScale,
                    },
                  ]}
                >
                  {t('store.referral.cta')}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Web: single coupon box. Native (iOS + Android): external site CTA. */}
          {IS_WEB_PLATFORM ? (
          <View style={styles.redeemSection} testID="store-coupon-section">
            <View
              style={[
                styles.redeemCard,
                SOFT_SURFACE_FACE,
                darkModeFlatTop,
                {
                  backgroundColor: surface,
                  borderRadius: Math.round(14 * viewportScale),
                  padding: Math.round(SPACING.sm * viewportScale),
                  gap: Math.round(SPACING.sm * viewportScale),
                },
                softSurfaceLift(),
              ]}
            >
              <TextInput
                value={couponCodeInput}
                onChangeText={handleCouponCodeChange}
                placeholder="Enter promo or discount code..."
                placeholderTextColor={textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  styles.redeemInput,
                  isCompactViewport && styles.redeemInputCompact,
                  {
                    height: Math.round((isCompactViewport ? 44 : 48) * viewportScale),
                    borderRadius: Math.round(14 * viewportScale),
                    paddingHorizontal: Math.round(SPACING.md * viewportScale),
                    fontSize: Math.round(14 * viewportScale),
                    color: textPrimary,
                    backgroundColor: redeemFieldBackground,
                    borderColor: couponError ? '#D32F2F' : redeemFieldBorder,
                    borderWidth: couponError ? 1.5 : 1,
                  },
                ]}
              />
              <Pressable
                onPress={applyCouponCode}
                disabled={isApplyingCoupon}
                style={({ pressed }) => [
                  styles.applyButton,
                  isCompactViewport && styles.applyButtonCompact,
                  SOFT_SURFACE_FACE,
                  darkModeFlatTop,
                  softSurfaceLift(),
                  {
                    height: Math.round((isCompactViewport ? 44 : 48) * viewportScale),
                    borderRadius: Math.round(14 * viewportScale),
                    paddingHorizontal: Math.round(
                      (isCompactViewport ? SPACING.md : SPACING.lg) * viewportScale
                    ),
                    backgroundColor: applyButtonBackground,
                    opacity: isApplyingCoupon ? 0.65 : pressed ? 0.92 : 1,
                    transform: pressed && !isApplyingCoupon ? [{ scale: 0.98 }] : [{ scale: 1 }],
                  },
                ]}
              >
                {isApplyingCoupon ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.applyButtonText,
                      {
                        fontSize: Math.round(12 * viewportScale),
                        letterSpacing: 0.5 * viewportScale,
                      },
                    ]}
                  >
                    APPLY CODE
                  </Text>
                )}
              </Pressable>
            </View>
            {couponError ? <Text style={styles.promoErrorText}>{couponError}</Text> : null}
            {couponSuccess ? <Text style={styles.promoSuccessText}>{couponSuccess}</Text> : null}
          </View>
          ) : null}
          {IS_NATIVE_PLATFORM ? (
          <View style={styles.redeemSection} testID="store-native-promo-cta">
            <Text
              style={[
                styles.nativePromoCtaText,
                isCompactViewport && styles.nativePromoCtaTextCompact,
                { color: textMuted },
              ]}
            >
              To input promo/coupon codes, head over to playbackfire.com.
            </Text>
            <Pressable
              onPress={() => {
                void Linking.openURL(PLAYBACKFIRE_SITE_URL);
              }}
              accessibilityRole="link"
              accessibilityLabel="Open playbackfire.com to redeem promo codes"
              style={({ pressed }) => [
                styles.nativePromoCtaButton,
                SOFT_SURFACE_FACE,
                darkModeFlatTop,
                softSurfaceLift(),
                {
                  backgroundColor: surface,
                  opacity: pressed ? 0.92 : 1,
                  transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
                },
              ]}
            >
              <Text style={[styles.nativePromoCtaButtonText, { color: textPrimary }]}>
                OPEN PLAYBACKFIRE.COM
              </Text>
            </Pressable>
          </View>
          ) : null}
        </View>
      </ScreenContent>
      <ReferralModal visible={referralOpen} onClose={() => setReferralOpen(false)} />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  viewport: {
    flex: 1,
  },
  /**
   * Shared outer gutter + max width. Equal paddingTop/paddingBottom match chrome so
   * space above STORE equals space below redeem. space-between splits free height
   * evenly between header↔cards and cards↔redeem.
   */
  contentFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    minWidth: 0,
    minHeight: 0,
    paddingTop: getStandardChromeTopPadding(Platform.OS === 'web'),
    paddingBottom: getStandardChromeTopPadding(Platform.OS === 'web'),
    justifyContent: 'space-between',
  },
  storeBody: {
    width: '100%',
    gap: SPACING.md,
    alignItems: 'stretch',
  },
  storeBodyWithoutRedeem: {
    flex: 1,
    justifyContent: 'center',
  },
  storeBodyCompact: {
    gap: SPACING.sm,
  },
  storeBodyTight: {
    gap: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: Platform.OS === 'web' ? 64 : 56,
  },
  headerSide: {
    // Grow with content (token chip); a fixed width was clipping larger balances.
    zIndex: 2,
    minWidth: 44,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  // True geometric center of the frame, aligning with the middle (30) token card.
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
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

  title: {
    fontFamily: FONTS.displayBold,
    fontSize: 20,
    letterSpacing: 0.8,
    marginBottom: 0,
  },
  tokenBalanceHint: {
    width: '100%',
    paddingHorizontal: SPACING.xs,
    fontFamily: FONTS.uiSemibold,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  referralCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  referralCtaText: {
    fontFamily: FONTS.uiSemibold,
    textTransform: 'uppercase',
  },

  // ── Status banner ─────────────────────────────────────────────────────
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: '100%',
    borderRadius: 14,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  statusBannerWarning: {
    borderLeftWidth: 3,
    borderLeftColor: '#D32F2F',
  },
  statusBannerText: {
    flex: 1,
    fontFamily: FONTS.ui,
    fontSize: 11,
    lineHeight: 15,
  },

  // ── Loading ───────────────────────────────────────────────────────────
  loadingContainer: {
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontFamily: FONTS.ui,
    fontSize: 13,
  },

  // ── Bundle cards ──────────────────────────────────────────────────────
  bundlesContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: SPACING.sm,
  },
  bundlesContainerCompact: {
    paddingVertical: 0,
  },
  bundleCardWrapper: {
    flexBasis: '19%',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  bundleCard: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 150,
    justifyContent: 'space-between',
  },
  bundleCardCompact: {
    minHeight: 138,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  bundleCardTight: {
    minHeight: 128,
  },
  bundleAmount: {
    fontFamily: FONTS.displayBold,
    fontSize: 24,
    textAlign: 'center',
  },
  bundleAmountCompact: {
    fontSize: 21,
  },
  bundleLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: -4,
  },
  bundleLabelCompact: {
    fontSize: 9,
  },
  bundleBonus: {
    fontFamily: FONTS.ui,
    fontSize: 8,
    marginTop: 1,
  },
  bundleBonusSpacer: {
    height: 10,
  },
  bundlePrice: {
    fontFamily: FONTS.displayBold,
    fontSize: 17,
    marginTop: 4,
    marginBottom: 6,
  },
  bundlePriceCompact: {
    fontSize: 15,
    marginTop: 2,
    marginBottom: 4,
  },
  buyButton: {
    alignSelf: 'stretch',
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonCompact: {
    height: 28,
  },
  buyButtonText: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },

  // ── Promo redemption ──────────────────────────────────────────────────
  redeemSection: {
    width: '100%',
    alignItems: 'center',
  },
  nativePromoCtaText: {
    fontFamily: FONTS.ui,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  nativePromoCtaTextCompact: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.xs,
  },
  nativePromoCtaButton: {
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativePromoCtaButtonText: {
    fontFamily: FONTS.uiBold,
    fontSize: 13,
    // No letterSpacing: Android clips the trailing "M" on PLAYBACKFIRE.COM.
    paddingEnd: 2,
  },
  redeemCard: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderRadius: 14,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  redeemInput: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    fontFamily: FONTS.ui,
    fontSize: 14,
  },
  redeemInputCompact: {
    height: 44,
  },
  promoErrorText: {
    alignSelf: 'stretch',
    fontFamily: FONTS.ui,
    fontSize: 12,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  promoSuccessText: {
    alignSelf: 'stretch',
    fontFamily: FONTS.ui,
    fontSize: 12,
    color: '#388E3C',
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  applyButton: {
    height: 48,
    paddingHorizontal: SPACING.lg,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonCompact: {
    height: 44,
    paddingHorizontal: SPACING.md,
  },
  applyButtonText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

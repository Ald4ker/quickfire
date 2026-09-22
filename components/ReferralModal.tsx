import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
  Share,
  useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { WebAwareModal } from '@/components/WebAwareModal';
import { Pressable } from '@/components/ui/Pressable';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '@/constants';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { useI18n } from '@/lib/i18n/useI18n';
import { HOME_SOFT_UI } from '@/themes';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';

const T = HOME_SOFT_UI.colors;

type ReferralModalProps = {
  visible: boolean;
  onClose: () => void;
};

const APPLY_ERROR_KEYS: Record<string, string> = {
  empty_code: 'store.referral.errorEmpty',
  invalid_code: 'store.referral.errorInvalid',
  self_referral: 'store.referral.errorSelf',
  already_redeemed: 'store.referral.errorAlready',
  not_new_account: 'store.referral.errorNotNew',
};

async function copyOrShare(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      // fall through
    }
    return 'failed';
  }

  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

export function ReferralModal({ visible, onClose }: ReferralModalProps) {
  const { t } = useI18n();
  const darkModeFlatTop = useDarkModeFlatTop();
  const { width, height } = useWindowDimensions();
  const viewportScale = Platform.OS === 'web' ? getWebViewportScale(width, height) : 1;
  const scaled = (n: number) => Math.round(n * viewportScale);

  const referral = useQuery(api.referrals.getMyReferral, visible ? {} : 'skip');
  const ensureMyCode = useMutation(api.referrals.ensureMyCode);
  const applyCode = useMutation(api.referrals.applyCode);

  const [code, setCode] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [alreadyRedeemed, setAlreadyRedeemed] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPasteInput('');
      setError(null);
      setSuccess(null);
      setCopyHint(null);
      return;
    }
    if (referral) {
      setAlreadyRedeemed(referral.alreadyRedeemed);
      if (referral.code) {
        setCode(referral.code);
      }
    }
  }, [visible, referral]);

  useEffect(() => {
    if (!visible || code || minting) return;
    let cancelled = false;
    setMinting(true);
    void ensureMyCode({})
      .then((result) => {
        if (!cancelled) setCode(result.code);
      })
      .catch(() => {
        if (!cancelled) setError(t('store.referral.errorGeneric'));
      })
      .finally(() => {
        if (!cancelled) setMinting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, code, minting, ensureMyCode, t]);

  const onCopy = useCallback(async () => {
    if (!code) return;
    const result = await copyOrShare(code);
    if (result === 'copied') {
      setCopyHint(t('store.referral.copied'));
    } else if (result === 'shared') {
      setCopyHint(null);
    } else {
      setCopyHint(t('store.referral.copyFailed'));
    }
  }, [code, t]);

  const onApply = useCallback(async () => {
    if (applying) return;
    setError(null);
    setSuccess(null);
    const trimmed = pasteInput.trim();
    if (!trimmed) {
      setError(t('store.referral.errorEmpty'));
      return;
    }
    setApplying(true);
    try {
      const result = await applyCode({ code: trimmed });
      if (!result.success) {
        const key = APPLY_ERROR_KEYS[result.error] ?? 'store.referral.errorGeneric';
        setError(t(key as 'store.referral.errorGeneric'));
        return;
      }
      setAlreadyRedeemed(true);
      setPasteInput('');
      setSuccess(t('store.referral.applySuccess'));
    } catch {
      setError(t('store.referral.errorGeneric'));
    } finally {
      setApplying(false);
    }
  }, [applying, pasteInput, applyCode, t]);

  const actionButtonBg = T.accentGlow;

  return (
    <WebAwareModal visible={visible} onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        style={[styles.overlay, { padding: scaled(SPACING.md) }]}
        testID="referral-modal"
      >
        {/* Full-screen scrim on the backdrop itself. Parent bg alone can
            paint as a mid-screen rectangle on some Android Modals. */}
        <Pressable
          style={[styles.backdrop, { backgroundColor: COLORS.overlay }]}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        />
        <View
          style={[
            styles.card,
            darkModeFlatTop,
            {
              backgroundColor: T.surface,
              maxWidth: scaled(420),
              borderRadius: scaled(22),
              padding: scaled(SPACING.lg),
              gap: scaled(SPACING.sm),
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text
              style={[
                styles.tagline,
                {
                  color: T.textPrimary,
                  fontSize: scaled(18),
                },
              ]}
            >
              {t('store.referral.tagline')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={12}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="close" size={scaled(22)} color={T.textMuted} />
            </Pressable>
          </View>

          <Text
            style={[
              styles.subtitle,
              {
                color: T.textMuted,
                fontSize: scaled(13),
                lineHeight: scaled(18),
              },
            ]}
          >
            {t('store.referral.subtitle')}
          </Text>

          <Text
            style={[
              styles.sectionLabel,
              { color: T.textMuted, fontSize: scaled(11) },
            ]}
          >
            {t('store.referral.yourCode')}
          </Text>

          <View
            style={[
              styles.codeRow,
              {
                backgroundColor: T.canvas,
                borderRadius: scaled(12),
                paddingVertical: scaled(SPACING.sm),
                paddingHorizontal: scaled(SPACING.md),
                gap: scaled(SPACING.sm),
              },
            ]}
          >
            {minting && !code ? (
              <ActivityIndicator color={T.textMuted} />
            ) : (
              <Text
                selectable
                style={[
                  styles.codeText,
                  {
                    color: T.textPrimary,
                    fontSize: scaled(20),
                    letterSpacing: scaled(2),
                  },
                ]}
                testID="referral-code-value"
              >
                {code ?? '····'}
              </Text>
            )}
            <Pressable
              onPress={() => {
                void onCopy();
              }}
              disabled={!code}
              accessibilityRole="button"
              accessibilityLabel={t('store.referral.copy')}
              style={({ pressed }) => [
                styles.copyButton,
                {
                  backgroundColor: actionButtonBg,
                  opacity: !code ? 0.5 : pressed ? 0.85 : 1,
                  borderRadius: scaled(10),
                  paddingVertical: scaled(8),
                  paddingHorizontal: scaled(12),
                },
              ]}
            >
              <Ionicons name="copy-outline" size={scaled(16)} color="#FFFFFF" />
              <Text style={[styles.copyButtonText, { fontSize: scaled(12) }]}>
                {Platform.OS === 'web' ? t('store.referral.copy') : t('store.referral.share')}
              </Text>
            </Pressable>
          </View>
          {copyHint ? (
            <Text style={[styles.hint, { color: '#388E3C', fontSize: scaled(12) }]}>{copyHint}</Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: 'rgba(15,23,42,0.12)' }]} />

          <Text
            style={[
              styles.sectionLabel,
              { color: T.textMuted, fontSize: scaled(11) },
            ]}
          >
            {t('store.referral.haveCode')}
          </Text>

          {alreadyRedeemed ? (
            <Text
              style={[
                styles.hint,
                {
                  color: success ? '#388E3C' : T.textMuted,
                  fontSize: scaled(13),
                },
              ]}
              testID={success ? 'referral-success' : 'referral-already-applied'}
            >
              {success ?? t('store.referral.alreadyApplied')}
            </Text>
          ) : (
            <>
              <View style={[styles.applyRow, { gap: scaled(SPACING.sm) }]}>
                <TextInput
                  value={pasteInput}
                  onChangeText={(text) => {
                    setPasteInput(text);
                    if (error) setError(null);
                    if (success) setSuccess(null);
                  }}
                  placeholder={t('store.referral.pastePlaceholder')}
                  placeholderTextColor={T.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!applying}
                  style={[
                    styles.pasteInput,
                    {
                      color: T.textPrimary,
                      backgroundColor: T.canvas,
                      borderColor: error ? '#D32F2F' : 'rgba(15,23,42,0.16)',
                      borderRadius: scaled(12),
                      height: scaled(44),
                      paddingHorizontal: scaled(SPACING.md),
                      fontSize: scaled(14),
                    },
                  ]}
                  testID="referral-paste-input"
                />
                <Pressable
                  onPress={() => {
                    void onApply();
                  }}
                  disabled={applying}
                  accessibilityRole="button"
                  accessibilityLabel={t('store.referral.apply')}
                  style={({ pressed }) => [
                    styles.applyButton,
                    {
                      backgroundColor: actionButtonBg,
                      height: scaled(44),
                      borderRadius: scaled(12),
                      paddingHorizontal: scaled(SPACING.md),
                      opacity: applying ? 0.65 : pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  {applying ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.applyButtonText, { fontSize: scaled(12) }]}>
                      {t('store.referral.apply')}
                    </Text>
                  )}
                </Pressable>
              </View>
              {error ? (
                <Text
                  style={[styles.hint, { color: '#D32F2F', fontSize: scaled(12) }]}
                  testID="referral-error"
                >
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </WebAwareModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: '100%',
    minHeight: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  tagline: {
    flex: 1,
    fontFamily: FONTS.displayBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontFamily: FONTS.ui,
  },
  sectionLabel: {
    fontFamily: FONTS.uiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: SPACING.xs,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeText: {
    flex: 1,
    fontFamily: FONTS.uiBold,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyButtonText: {
    fontFamily: FONTS.uiBold,
    color: '#FFFFFF',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: SPACING.xs,
  },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pasteInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.ui,
    borderWidth: 1,
  },
  applyButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  applyButtonText: {
    fontFamily: FONTS.uiBold,
    color: '#FFFFFF',
  },
  hint: {
    fontFamily: FONTS.ui,
    textAlign: 'left',
  },
});

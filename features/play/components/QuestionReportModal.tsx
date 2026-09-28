import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import { WebAwareModal } from '@/components/WebAwareModal';
import { Pressable } from '@/components/ui/Pressable';
import { api } from '@/convex/_generated/api';
import { COLORS, FONTS, SPACING } from '@/constants';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { SOFT_SURFACE_STYLES } from '@/features/play/styles/softSurface';
import { usePlayTextScale } from '@/store/display';
import { showThemedAlert } from '@/store/themedAlert';
import type { TranslationKey } from '@/lib/i18n/messages/en';
import type { QuestionCard } from '@/features/shared';
import {
  QUESTION_REPORT_REASONS,
  buildQuestionReportPayload,
  canSubmitQuestionReport,
  type QuestionReportLocation,
  type QuestionReportPayload,
  type QuestionReportReason,
} from '@/features/play/questionReport';

const REPORT_BUTTON_BG = '#FFF3B0';
const REPORT_ICON = '#C48A00';

const REASON_LABELS: Record<QuestionReportReason, TranslationKey> = {
  factually_incorrect: 'play.report.reason.factuallyIncorrect',
  ambiguous: 'play.report.reason.ambiguous',
  unclear: 'play.report.reason.unclear',
  unfair: 'play.report.reason.unfair',
  mismatch: 'play.report.reason.mismatch',
  outdated: 'play.report.reason.outdated',
  broken: 'play.report.reason.broken',
  inappropriate: 'play.report.reason.inappropriate',
  bad_unfun: 'play.report.reason.badUnfun',
  other: 'play.report.reason.other',
};

const LOCATION_OPTIONS: {
  id: QuestionReportLocation;
  key: TranslationKey;
}[] = [
  { id: 'question', key: 'play.report.location.question' },
  { id: 'answer', key: 'play.report.location.answer' },
  { id: 'both', key: 'play.report.location.both' },
];

export function getReportModalViewportScale(width: number, height: number): number {
  const viewportArea = Math.max(1, width) * Math.max(1, height);
  return Math.max(0.88, Math.min(1.2, Math.sqrt(viewportArea / (1200 * 675))));
}

type QuestionReportModalProps = {
  visible: boolean;
  question: QuestionCard;
  sessionId?: string;
  onClose: () => void;
  onSubmit: (payload: QuestionReportPayload) => void | Promise<void>;
};

export function QuestionReportModal({
  visible,
  question,
  sessionId,
  onClose,
  onSubmit,
}: QuestionReportModalProps) {
  const { t, getTextStyle } = useI18n();
  const darkModeFlatTop = useDarkModeFlatTop();
  const surfaceColors = getPlaySurfaceColors();
  const playTextScale = usePlayTextScale();
  const { width, height } = useWindowDimensions();
  const viewportScale = getReportModalViewportScale(width, height);
  const scaled = (size: number) => Math.max(1, Math.round(size * viewportScale));
  const textSize = (size: number, minimum = 11) =>
    Math.max(minimum, Math.round(size * Math.max(playTextScale, 1) * viewportScale));
  const overlayPad = scaled(SPACING.sm);
  const choiceHeight = scaled(52);
  const choiceRadius = scaled(14);
  const [reasons, setReasons] = useState<QuestionReportReason[]>([]);
  const [location, setLocation] = useState<QuestionReportLocation | null>(null);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    if (!visible) return;
    setReasons([]);
    setLocation(null);
    setOtherText('');
  }, [visible]);

  const draft = useMemo(
    () => ({ reasons, location, otherText }),
    [reasons, location, otherText]
  );
  const canSubmit = canSubmitQuestionReport(draft);
  const showOther = reasons.includes('other');
  const tileFill = (selected: boolean) =>
    selected ? REPORT_BUTTON_BG : surfaceColors.isDark ? 'rgba(255,255,255,0.08)' : '#F0EBE3';
  const tileBorder = (selected: boolean) => (selected ? '#E6C35C' : 'transparent');

  const toggleReason = (reason: QuestionReportReason) => {
    setReasons((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason]
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSubmit(buildQuestionReportPayload(draft, question, sessionId));
  };

  return (
    <WebAwareModal visible={visible} onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        style={[styles.overlay, { padding: overlayPad }]}
        testID="question-report-modal"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          style={[
            styles.card,
            SOFT_SURFACE_STYLES.face,
            darkModeFlatTop,
            SOFT_SURFACE_STYLES.raised,
            {
              backgroundColor: surfaceColors.surface,
              maxWidth: Math.min(width - overlayPad * 2, 640),
              maxHeight: height - overlayPad * 2,
              borderRadius: scaled(24),
              padding: scaled(SPACING.md),
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              {
                color: surfaceColors.textPrimary,
                fontSize: textSize(20),
                lineHeight: textSize(24),
              },
              getTextStyle(undefined, 'display', 'center'),
            ]}
            accessibilityRole="header"
          >
            {t('play.report.title')}
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: surfaceColors.textMuted,
                fontSize: textSize(14),
                lineHeight: textSize(19),
                marginBottom: scaled(SPACING.sm),
              },
              getTextStyle(undefined, 'body', 'center'),
            ]}
          >
            {t('play.report.subtitle')}
          </Text>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.body}
            contentContainerStyle={{ gap: scaled(SPACING.sm) }}
          >
            <View style={[styles.reasonGrid, { gap: scaled(SPACING.sm) }]}>
              {[0, 2, 4, 6, 8].map((start) => {
                const row = QUESTION_REPORT_REASONS.slice(start, start + 2);
                return (
                  <View key={start} style={[styles.reasonRow, { gap: scaled(SPACING.sm) }]}>
                    {row.map((reason) => {
                      const selected = reasons.includes(reason);
                      return (
                        <Pressable
                          key={reason}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => toggleReason(reason)}
                          style={({ pressed }) => [
                            styles.choiceTile,
                            {
                              height: choiceHeight,
                              borderRadius: choiceRadius,
                              paddingHorizontal: scaled(10),
                              backgroundColor: tileFill(selected),
                              borderColor: tileBorder(selected),
                              opacity: pressed ? 0.9 : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name={selected ? 'checkmark-circle-outline' : 'ellipse-outline'}
                            size={textSize(16, 14)}
                            color={selected ? REPORT_ICON : surfaceColors.textMuted}
                          />
                          <Text
                            style={[
                              styles.choiceTileText,
                              {
                                color: selected ? REPORT_ICON : surfaceColors.textPrimary,
                                fontSize: textSize(13),
                                lineHeight: textSize(16),
                              },
                              getTextStyle(undefined, 'bodySemibold', 'start'),
                            ]}
                            numberOfLines={2}
                          >
                            {t(REASON_LABELS[reason])}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {row.length === 1 ? <View style={styles.choiceSpacer} /> : null}
                  </View>
                );
              })}
            </View>
            {showOther ? (
              <TextInput
                testID="question-report-other-input"
                value={otherText}
                onChangeText={setOtherText}
                placeholder={t('play.report.otherPlaceholder')}
                placeholderTextColor={surfaceColors.textMuted}
                multiline
                maxLength={500}
                style={[
                  styles.otherInput,
                  {
                    color: surfaceColors.textPrimary,
                    backgroundColor: surfaceColors.isDark
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(15,23,42,0.04)',
                    borderColor: surfaceColors.hairlineBorder,
                    minHeight: choiceHeight,
                    borderRadius: choiceRadius,
                    paddingHorizontal: scaled(SPACING.md),
                    paddingVertical: scaled(SPACING.sm),
                    fontSize: textSize(14),
                  },
                  getTextStyle(),
                ]}
              />
            ) : null}
            <Text
              style={[
                styles.locationLabel,
                {
                  color: surfaceColors.textPrimary,
                  fontSize: textSize(13),
                  lineHeight: textSize(17),
                },
                getTextStyle(undefined, 'bodyBold', 'center'),
              ]}
            >
              {t('play.report.locationLabel')}
            </Text>
            <View
              testID="question-report-location-pill"
              accessibilityValue={{ text: location ?? 'none' }}
              style={[styles.locationRow, { gap: scaled(SPACING.sm) }]}
            >
              {LOCATION_OPTIONS.map((option) => {
                const selected = location === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(option.key)}
                    accessibilityState={{ selected }}
                    onPress={() => setLocation(option.id)}
                    style={({ pressed }) => [
                      styles.choiceTile,
                      {
                        height: choiceHeight,
                        borderRadius: choiceRadius,
                        paddingHorizontal: scaled(10),
                        justifyContent: 'center',
                        backgroundColor: tileFill(selected),
                        borderColor: tileBorder(selected),
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={textSize(16, 14)}
                      color={selected ? REPORT_ICON : surfaceColors.textMuted}
                    />
                    <Text
                      style={[
                        styles.locationChoiceText,
                        {
                          color: selected ? REPORT_ICON : surfaceColors.textPrimary,
                          fontSize: textSize(13),
                          lineHeight: textSize(16),
                        },
                        getTextStyle(undefined, 'bodySemibold', 'center'),
                      ]}
                      numberOfLines={1}
                    >
                      {t(option.key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('play.report.submitA11y')}
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: COLORS.primary,
                  minHeight: choiceHeight,
                  borderRadius: choiceRadius,
                  opacity: !canSubmit ? 0.45 : pressed ? 0.88 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.submitText,
                  { fontSize: textSize(15), lineHeight: textSize(19) },
                  getTextStyle(undefined, 'bodySemibold', 'center'),
                ]}
              >
                {t('play.report.submit')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </WebAwareModal>
  );
}

export function QuestionReportControl({
  question,
  sessionId,
  offsetRight,
  offsetBottom,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: {
  question: QuestionCard;
  sessionId?: string;
  offsetRight: number;
  offsetBottom: number;
  /** UI round 2 preview: the screen draws its own trigger and controls `open`. */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t, getTextStyle } = useI18n();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  const submitReport = useMutation(api.content.submitQuestionReport);
  const submitting = useRef(false);

  return (
    <>
      {hideTrigger ? null : (
      <View style={[styles.reportFab, { right: offsetRight, bottom: offsetBottom }]}>
        <Pressable
          testID="question-report-button"
          accessibilityRole="button"
          accessibilityLabel={t('play.report.buttonA11y')}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.reportButton,
            SOFT_SURFACE_STYLES.face,
            { opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
        >
          <Ionicons name="warning" size={18} color={REPORT_ICON} />
          <Text
            style={[styles.reportButtonText, getTextStyle(undefined, 'bodySemibold', 'center')]}
            numberOfLines={1}
          >
            {t('play.report.button')}
          </Text>
        </Pressable>
      </View>
      )}
      <QuestionReportModal
        visible={open}
        question={question}
        sessionId={sessionId}
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          if (submitting.current) return;
          submitting.current = true;
          try {
            await submitReport(payload);
            setOpen(false);
            showThemedAlert(t('play.report.thanksTitle'), t('play.report.thanksBody'));
          } catch {
            showThemedAlert(t('play.report.errorTitle'), t('play.report.errorBody'));
          } finally {
            submitting.current = false;
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 24,
    padding: SPACING.md,
  },
  title: {
    fontFamily: FONTS.displayBold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.ui,
    textAlign: 'center',
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  reasonGrid: {
    minWidth: 0,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  choiceTile: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    gap: 8,
    borderWidth: 1,
  },
  choiceSpacer: {
    flex: 1,
    minWidth: 0,
  },
  choiceTileText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontFamily: FONTS.uiSemibold,
  },
  otherInput: {
    borderWidth: 1,
    fontFamily: FONTS.ui,
    textAlignVertical: 'top',
  },
  locationLabel: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  locationChoiceText: {
    flexShrink: 0,
    fontFamily: FONTS.uiSemibold,
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontFamily: FONTS.uiBold,
    color: '#FFFFFF',
  },
  reportFab: {
    position: 'absolute',
    zIndex: 32,
  },
  reportButton: {
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: REPORT_BUTTON_BG,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: 'rgba(51, 51, 51, 0.22)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  reportButtonText: {
    color: REPORT_ICON,
    fontFamily: FONTS.uiSemibold,
    fontSize: 12,
  },
});

import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable } from '@/components/ui/Pressable';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { BORDER_RADIUS, SPACING, FONTS, getChromeTopPaddingWithInsets } from '@/constants';
import { getQuestionImageSource } from '@/constants/questionImages';
import { SHOW_HOT_SEAT_UI } from '@/constants/featureFlags';
import { SOFT_SURFACE_STYLES } from '@/features/play/styles/softSurface';
import {
  RUMBLE_SECOND_TEAM_REVEAL_SECONDS,
  getNextRumbleCheckpointSeconds,
  getRumblePartyPhase,
  getRumblePartySlots,
} from '@/features/play/rumble';
import { PlayAnswerPanel } from '@/features/play/components/PlayAnswerPanel';
import { SecondaryLanguageText } from '@/features/play/components/SecondaryLanguageText';
import { useQuestionVariants } from '@/features/play/useQuestionVariants';
import { QuestionReportControl } from '@/features/play/components/QuestionReportModal';
import { WagerInfoModal } from '@/features/play/components/WagerInfoModal';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop, useTheme } from '@/lib/hooks/useTheme';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import { usePlayStore } from '@/store/play';
import { usePlayTextScale } from '@/store/display';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { HOME_SOFT_UI } from '@/themes';

const T = HOME_SOFT_UI.colors;

/** Deeper solid depth - matches extruded raised plastic pattern. */
function neumorphicLift3D(_tier: 'hero' | 'pill'): ViewStyle {
  return SOFT_SURFACE_STYLES.raised;
}

/**
 * Max font size scales with available width; `adjustsFontSizeToFit` shrinks from this down to
 * `minimumFontScale` so the full prompt stays on one line without clipping.
 * Narrow viewports get a higher floor and scale so body-size prompts are easier to read.
 */
export function getQuestionTextSafeWidth(
  windowWidth: number,
  insetLeft: number,
  insetRight: number,
  baseGutter: number
): number {
  const left = Math.max(baseGutter, insetLeft + SPACING.sm);
  const right = Math.max(baseGutter, insetRight + SPACING.sm);
  return Math.max(1, windowWidth - left - right);
}

export function getQuestionViewportScale(width: number, height: number): number {
  const viewportArea = Math.max(1, width) * Math.max(1, height);
  return Math.max(0.8, Math.min(1.6, Math.sqrt(viewportArea / (1200 * 675))));
}

function getQuestionPromptSizing(contentWidthPx: number): { maxFont: number; lineHeight: number } {
  const w = Math.max(200, Math.floor(contentWidthPx));
  const scale = w < 480 ? 0.056 : 0.048;
  const floor = w < 480 ? 15 : 13;
  const maxFont = Math.min(34, Math.max(floor, Math.round(w * scale)));
  const lineHeight = Math.ceil(maxFont * 1.28);
  return { maxFont, lineHeight };
}

/**
 * Min body size for question text on web. Long prompts can wrap; without a floor, length-based
 * one-line math drives fonts toward 9px on phone-sized viewports.
 */
function getWebMinQuestionFontSize(viewportShortSide: number): number {
  if (viewportShortSide < 480) return 17;
  if (viewportShortSide < 720) return 16;
  return 13;
}

/**
 * Web: `numberOfLines` + `adjustsFontSizeToFit` maps to overflow:hidden + text-overflow and clips text
 * because RN Web often does not shrink fonts reliably. Prefer a one-line size when it fits; otherwise
 * `minFont` is enforced and the prompt wraps to multiple lines.
 */
function estimateWebSingleLineFontSize(
  text: string,
  maxWidthPx: number,
  maxFont: number,
  minFont: number
): { fontSize: number; lineHeight: number } {
  const w = Math.max(120, Math.floor(maxWidthPx));
  const len = Math.max(1, [...text].length);
  const avgGlyphRatio = 0.56;
  const raw = w / (len * avgGlyphRatio);
  const fontSize = Math.floor(Math.max(minFont, Math.min(maxFont, raw)));
  return {
    fontSize,
    lineHeight: Math.ceil(fontSize * 1.35),
  };
}

function formatQuestionTimer(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.min(QUESTION_MAX_SECONDS, Math.floor(totalSeconds)))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getSafeElapsedSeconds(timerStartedAt: number | undefined, now: number): number {
  if (!timerStartedAt) return 0;
  const elapsed = Math.floor((now - timerStartedAt) / 1000);
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(QUESTION_MAX_SECONDS, elapsed)) : 0;
}

/** Scales the compact answer-phase / reveal prompt for the pre-reveal “active play” question only. */
const UNREVEALED_QUESTION_TYPE_SCALE = 1.28;
/** Display size for pre-reveal question + Show Answer control (1 = original). */
const UNREVEALED_QA_DISPLAY_SCALE = 0.8;

function scaleUpQuestionEmphasis(
  phase: { fontSize: number; lineHeight: number },
  viewportScale = 1,
  textScale = 1
): { fontSize: number; lineHeight: number } {
  const scale = UNREVEALED_QUESTION_TYPE_SCALE * UNREVEALED_QA_DISPLAY_SCALE;
  // Cap tracks play text size so large mode can grow past medium (floors still fit via adjustsFontSizeToFit).
  const capScale = viewportScale * textScale;
  return {
    fontSize: Math.min(
      Math.round(46 * UNREVEALED_QA_DISPLAY_SCALE * capScale),
      Math.round(phase.fontSize * scale)
    ),
    lineHeight: Math.min(
      Math.round(60 * UNREVEALED_QA_DISPLAY_SCALE * capScale),
      Math.round(phase.lineHeight * scale)
    ),
  };
}

/** No logo top bar on the question screen; keep legacy absolute timer below the safe area. */
const MATCH_TOP_BAR_EST_HEIGHT = 0;
const QUESTION_MAX_SECONDS = 10 * 60;

const WAGER_FAB_ICON = require('@/assets/wager.webp');

type RumbleChipTranslate = (
  key: 'play.rumbleChipHiddenName' | 'play.rumbleChipLocked' | 'play.rumbleChipAnswering',
  values?: Record<string, string | number>
) => string;

function RumblePartyChip({
  role,
  teamName,
  active,
  locked,
  compact,
  t,
}: {
  role: 'first' | 'second';
  teamName: string | null;
  active: boolean;
  locked: boolean;
  compact: boolean;
  t: RumbleChipTranslate;
}) {
  const darkModeFlatTop = useDarkModeFlatTop();
  const theme = useTheme();

  const displayName = locked
    ? t('play.rumbleChipHiddenName')
    : teamName?.trim() || t('play.rumbleChipHiddenName');
  // Both party slots answer in turn - never label the second team as a "steal".
  const subLabel = locked ? t('play.rumbleChipLocked') : t('play.rumbleChipAnswering');

  const roleNoun = role === 'first' ? 'First team' : 'Second team';
  const a11yLabel = locked
    ? `${roleNoun} locked`
    : active
      ? `${roleNoun} answering: ${displayName}`
      : `${roleNoun}: ${displayName}`;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
      style={[
        styles.rumblePartyChip,
        compact && styles.rumblePartyChipCompact,
        SOFT_SURFACE_STYLES.face,
        darkModeFlatTop,
        SOFT_SURFACE_STYLES.raised,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
        locked && styles.rumblePartyChipLocked,
        active && [
          styles.rumblePartyChipActive,
          { backgroundColor: theme.cardBackground, borderColor: theme.primary },
        ],
      ]}
    >
      <Text
        style={[
          styles.rumblePartyChipName,
          compact && styles.rumblePartyChipNameCompact,
          { color: theme.textOnBackground },
          locked && styles.rumblePartyChipNameLocked,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {displayName}
      </Text>
      <Text
        style={[
          styles.rumblePartyChipRole,
          compact && styles.rumblePartyChipRoleCompact,
          { color: theme.textSecondaryOnBackground },
          active && [styles.rumblePartyChipRoleActive, { color: theme.primary }],
        ]}
        numberOfLines={1}
      >
        {subLabel.toUpperCase()}
      </Text>
    </View>
  );
}

export default function PlayQuestionScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { direction, getTextStyle, t } = useI18n();
  const rowDirection = getRowDirection(direction);
  const darkModeFlatTop = useDarkModeFlatTop();
  const theme = useTheme();
  const playTextScale = usePlayTextScale();
  const surfaceColors = getPlaySurfaceColors();
  const BRAND = {
    canvas: surfaceColors.canvas,
    surface: surfaceColors.surface,
    charcoal: surfaceColors.textPrimary,
    amber: HOME_SOFT_UI.colors.accentGlow,
    shadowStrong: HOME_SOFT_UI.colors.shadowStrong,
  };
  const session = usePlayStore((state) => state.session);
  const cancelCurrentQuestion = usePlayStore((state) => state.cancelCurrentQuestion);
  const skipRumbleWait = usePlayStore((state) => state.skipRumbleWait);
  const revealAnswer = usePlayStore((state) => state.revealAnswer);
  const expireCurrentQuestionForTimeout = usePlayStore((state) => state.expireCurrentQuestionForTimeout);
  const initiateWager = usePlayStore((state) => state.initiateWager);
  const continueAfterStandardQuestion = usePlayStore((state) => state.continueAfterStandardQuestion);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [wagerInfoOpen, setWagerInfoOpen] = useState(false);


  const currentTeam = useMemo(() => {
    return session?.teams.find((t) => t.id === session.currentTeamId);
  }, [session?.teams, session?.currentTeamId]);

  const rumbleFirstTeam = useMemo(() => {
    const teamId = session?.currentQuestion?.rumbleFirstTeamId;
    return session?.teams.find((team) => team.id === teamId);
  }, [session?.currentQuestion?.rumbleFirstTeamId, session?.teams]);

  const rumbleSecondTeam = useMemo(() => {
    const teamId = session?.currentQuestion?.rumbleSecondTeamId;
    return session?.teams.find((team) => team.id === teamId);
  }, [session?.currentQuestion?.rumbleSecondTeamId, session?.teams]);

  useEffect(() => {
    if (!session?.timerStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const update = () => setElapsedSeconds(getSafeElapsedSeconds(session.timerStartedAt, Date.now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session?.timerStartedAt]);

  useEffect(() => {
    const currentQuestionId = session?.currentQuestion?.id;
    if (
      currentQuestionId &&
      session?.step === 'question' &&
      elapsedSeconds >= QUESTION_MAX_SECONDS &&
      session.timedOutQuestionId !== currentQuestionId
    ) {
      expireCurrentQuestionForTimeout();
    }
  }, [expireCurrentQuestionForTimeout, elapsedSeconds, session?.currentQuestion?.id, session?.step, session?.timedOutQuestionId]);

  useEffect(() => {
    if (!usePlayStore.persist.hasHydrated()) return;
    if (!session?.currentQuestion) {
      router.replace('/play/board');
    }
  }, [router, session?.currentQuestion]);

  /** Center weighted responsive layout - must run before any early return (Rules of Hooks). */
  const viewportShortSide = Math.min(windowWidth, windowHeight);
  const questionViewportScale =
    Platform.OS === 'web' ? getQuestionViewportScale(windowWidth, windowHeight) : 1;
  const isCompactHeader = windowWidth < 760 || viewportShortSide < 430;
  const isVeryCompactHeader = viewportShortSide < 390;
  /** Match the other play screens: compact chevron-only back control. */
  const backVariant = 'icon' as const;
  const topicPad = topicCardScreenPadding(windowWidth, insets, Platform.OS === 'web');
  const chromeSideWidth = Math.round(
    (isVeryCompactHeader ? 70 : isCompactHeader ? 78 : 112) * questionViewportScale
  );
  /** Matches shared non-home chrome (manual inset - no SafeAreaView top edge). */
  const questionChromePaddingTop = getChromeTopPaddingWithInsets(
    insets.top,
    Platform.OS === 'web'
  );
  const questionContentWidth = topicPad.contentWidth;
  /** Keep prompt text clear of landscape camera cutouts and Android navigation bars. */
  const promptLayoutWidth = Math.min(
    questionContentWidth,
    getQuestionTextSafeWidth(
      windowWidth,
      insets.left,
      insets.right,
      Math.min(topicPad.paddingLeft, topicPad.paddingRight)
    )
  );
  const questionPromptSizing = useMemo(() => {
    const sizing = getQuestionPromptSizing(promptLayoutWidth);
    return {
      maxFont: Math.max(11, Math.round(sizing.maxFont * playTextScale)),
      lineHeight: Math.max(14, Math.round(sizing.lineHeight * playTextScale)),
    };
  }, [playTextScale, promptLayoutWidth]);

  /** Tighter horizontal padding on small viewports; scales with short side on answer phase scroll. */
  const answerPhaseScrollPaddingH = useMemo(() => {
    const short = Math.min(windowWidth, windowHeight);
    return Math.max(SPACING.md, Math.min(SPACING.xl, Math.round(short * 0.042)));
  }, [windowWidth, windowHeight]);

  /** Primary (and optional secondary) content-language text for the chosen question. */
  const questionVariants = useQuestionVariants(session?.currentQuestion);
  const promptText = questionVariants?.primary.prompt ?? '';

  /**
   * Base sizing for the prompt in the answer/reveal flow (and shared caps).
   * The pre-reveal “Show answer” state uses `unrevealedActiveQuestionTypography` (larger).
   */
  const compactQuestionPhaseTypography = useMemo(() => {
    const max = questionPromptSizing.maxFont;
    if (Platform.OS === 'web') {
      const min = getWebMinQuestionFontSize(viewportShortSide);
      const typography = estimateWebSingleLineFontSize(promptText, promptLayoutWidth, max, min);
      return {
        fontSize: Math.round(typography.fontSize * questionViewportScale),
        lineHeight: Math.round(typography.lineHeight * questionViewportScale),
      };
    }
    return {
      fontSize: max,
      lineHeight: questionPromptSizing.lineHeight,
    };
  }, [promptText, promptLayoutWidth, questionPromptSizing, questionViewportScale, viewportShortSide]);

  const unrevealedActiveQuestionTypography = useMemo(
    () => scaleUpQuestionEmphasis(compactQuestionPhaseTypography, questionViewportScale, playTextScale),
    [compactQuestionPhaseTypography, playTextScale, questionViewportScale]
  );

  const isAnswerPhase = session?.step === 'answer';

  /** Same rules as `PlayAnswerPanel` canWager - after points are awarded, offer wager for the next team. */
  const answerPhaseCanWager = useMemo(() => {
    if (!session) return false;
    if (!session.config.wagerEnabled) return false;
    if (session.bonus.active) return false;
    if (session.wager) return false;
    if (session.timedOutQuestionId === session.currentQuestion?.id) return false;
    if (session.phase !== 'scoring') return false;
    const used =
      session.teams.find((team) => team.id === session.currentTeamId)?.wagersUsed ?? 0;
    if (used >= session.wagersPerTeam) return false;
    return session.teams.length >= 2;
  }, [session]);

  if (!session?.currentQuestion) {
    // After "Next Turn", store clears currentQuestion before the fade to board finishes.
    // Keep the live canvas color (not StyleSheet-frozen cream) so dark mode never flashes white.
    return (
      <View
        testID="question-turn-transition-canvas"
        style={[styles.canvas, { backgroundColor: surfaceColors.canvas }]}
      />
    );
  }

  const q = session.currentQuestion;
  const primaryVariant = questionVariants?.primary ?? {
    locale: q.locale,
    prompt: q.prompt,
    answer: q.answer,
    fellBackToEnglish: false,
  };
  const secondaryVariant = questionVariants?.secondary ?? null;
  const secondaryPrompt = secondaryVariant ? (
    <SecondaryLanguageText
      testID="question-secondary-prompt"
      variant={secondaryVariant}
      field="prompt"
      primaryFontSize={unrevealedActiveQuestionTypography.fontSize}
      primaryLineHeight={unrevealedActiveQuestionTypography.lineHeight}
      color={T.textPrimary}
      maxWidth={promptLayoutWidth}
    />
  ) : null;
  const questionBoxPrompt = (
    <Text
      testID="question-primary-prompt"
      style={[
        styles.questionText,
        getTextStyle(primaryVariant.locale, 'display', 'center', primaryVariant.prompt),
        {
          color: T.textPrimary,
          fontSize: unrevealedActiveQuestionTypography.fontSize,
          lineHeight: unrevealedActiveQuestionTypography.lineHeight,
          maxWidth: promptLayoutWidth,
          width: '100%',
          alignSelf: 'center',
        },
        Platform.OS === 'web' ? styles.questionTextWeb : null,
      ]}
      {...(Platform.OS === 'web'
        ? {}
        : {
            numberOfLines: 3,
            adjustsFontSizeToFit: true,
            minimumFontScale: 0.72,
            maxFontSizeMultiplier: 1.2,
          })}
    >
      {primaryVariant.prompt}
    </Text>
  );
  const promptImageSource =
    (q.promptImageKey ? getQuestionImageSource(q.promptImageKey) : null) ??
    (q.promptImageUrl ? { uri: q.promptImageUrl } : null);
  const hotSeatChallenge = SHOW_HOT_SEAT_UI ? session.hotSeat?.activeChallenge : undefined;
  const displaySeconds = Math.min(elapsedSeconds, QUESTION_MAX_SECONDS);
  const hasTimedOut = session.timedOutQuestionId === q.id;
  const timeStr = formatQuestionTimer(displaySeconds);

  const isRumbleQuestion = session.mode === 'rumble';
  const rumblePartyPhase = isRumbleQuestion ? getRumblePartyPhase(elapsedSeconds) : null;
  const rumblePartySlots = isRumbleQuestion
    ? getRumblePartySlots(elapsedSeconds)
    : { firstRevealed: false, secondRevealed: false, activeSlot: null as null };
  const rumbleTimingGuide =
    rumblePartyPhase === 'waiting'
      ? t('play.rumbleWaiting')
      : rumblePartyPhase === 'firstAnswering'
        ? t('play.rumbleFirstWindow', {
            team: rumbleFirstTeam?.name ?? currentTeam?.name ?? 'Team',
          })
        : rumblePartyPhase === 'transition'
          ? t('play.rumbleTransitionWindow')
          : rumblePartyPhase === 'secondAnswering'
            ? t('play.rumbleSecondWindow', {
                team: rumbleSecondTeam?.name ?? 'Next team',
              })
            : rumblePartyPhase === 'ended'
              ? t('play.rumbleRoundEnded')
              : null;
  const canShowAnswer =
    !hasTimedOut &&
    (!isRumbleQuestion ||
      elapsedSeconds >= RUMBLE_SECOND_TEAM_REVEAL_SECONDS);
  const canSkipRumbleWait =
    isRumbleQuestion &&
    session.step === 'question' &&
    getNextRumbleCheckpointSeconds(elapsedSeconds) !== null;
  const hotSeatNames = hotSeatChallenge?.participants
    .map((participant) => participant.playerName)
    .join(' vs ');
  const showAnswerPhaseNextTurnDock = isAnswerPhase && !session.wager && session.phase === 'scoring';

  /**
   * Shared pill chrome for all modes (including rumble). Hot Seat still uses the
   * multi-line banner so participant names stay readable.
   */
  const usePillHeader = !hotSeatNames;

  const onBackToBoard = () => {
    cancelCurrentQuestion();
    router.replace('/play/board');
  };

  const timerNode = (
    <View
      style={
        usePillHeader
          ? [
              styles.timerRingPill,
              darkModeFlatTop,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
                minWidth: Math.round(68 * questionViewportScale),
                height: Math.round(40 * questionViewportScale),
                borderRadius: Math.round(BORDER_RADIUS.button * questionViewportScale),
                paddingHorizontal: Math.round(8 * questionViewportScale),
              },
            ]
          : styles.timerRing
      }
    >
      <Text
        style={[
          usePillHeader ? styles.timerValuePill : styles.timerValue,
          {
            color: BRAND.charcoal,
            fontSize: Math.round((usePillHeader ? 13 : 14) * questionViewportScale),
            lineHeight: Math.round((usePillHeader ? 16 : 18) * questionViewportScale),
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit={false}
      >
        {timeStr}
      </Text>
    </View>
  );

  /** Rumble keeps topic/points only - party chips show who is answering. */
  const metaPillLabel = isRumbleQuestion
    ? isVeryCompactHeader
      ? `${q.categoryName} | ${q.pointValue} PTS`
      : `TOPIC: ${q.categoryName} | ${q.pointValue} POINTS`
    : isVeryCompactHeader
      ? `${currentTeam?.name || 'TEAM'} | ${q.categoryName} | ${q.pointValue} PTS`
      : `${currentTeam?.name || 'TEAM'} | TOPIC: ${q.categoryName} | ${q.pointValue} POINTS`;

  const metaPill = (
    <View
      style={[
        styles.metaPill,
        SOFT_SURFACE_STYLES.face,
        darkModeFlatTop,
        SOFT_SURFACE_STYLES.raised,
        {
          backgroundColor: theme.cardBackground,
          maxWidth: Math.round(560 * questionViewportScale),
          minHeight: Math.round(44 * questionViewportScale),
          paddingVertical: Math.round(8 * questionViewportScale),
          paddingHorizontal: Math.round(SPACING.md * questionViewportScale),
        },
      ]}
      accessibilityRole="summary"
    >
      <Text
        style={[
          styles.metaPillText,
          isCompactHeader && styles.metaPillTextCompact,
          {
            color: theme.textOnBackground,
            fontSize: Math.round((isCompactHeader ? 10.5 : 12) * questionViewportScale),
            lineHeight: Math.round((isCompactHeader ? 13 : 15) * questionViewportScale),
            letterSpacing: (isCompactHeader ? 0.55 : 0.75) * questionViewportScale,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {metaPillLabel.toUpperCase()}
      </Text>
    </View>
  );

  // Keep the active wager visible through the answer reveal, which is embedded in this route.
  const wagerMultiplier = session.wager ? (
    <Text
      style={[styles.wagerMultiplierText, { color: BRAND.amber }]}
      numberOfLines={2}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      Wager x{session.wager.multiplier} (Correct: {session.wager.multiplier}x gain, incorrect:{' '}
      {Math.max(0.5, session.wager.multiplier - 0.5)}x loss)
    </Text>
  ) : null;

  const rumblePartyChips = isRumbleQuestion ? (
    <View
      testID="rumble-party-status-row"
      style={styles.rumblePartyStatusRow}
      accessibilityRole="summary"
    >
      <View testID="rumble-party-chips" style={styles.rumblePartyRow}>
        <RumblePartyChip
          role="first"
          teamName={rumblePartySlots.firstRevealed ? rumbleFirstTeam?.name ?? null : null}
          active={rumblePartySlots.activeSlot === 'first'}
          locked={!rumblePartySlots.firstRevealed}
          compact={isCompactHeader}
          t={(key, values) => t(key, values)}
        />
        <RumblePartyChip
          role="second"
          teamName={rumblePartySlots.secondRevealed ? rumbleSecondTeam?.name ?? null : null}
          active={rumblePartySlots.activeSlot === 'second'}
          locked={!rumblePartySlots.secondRevealed}
          compact={isCompactHeader}
          t={(key, values) => t(key, values)}
        />
      </View>
      {canSkipRumbleWait ? (
        <Pressable
          testID="rumble-skip-wait"
          accessibilityRole="button"
          accessibilityLabel={t('play.rumbleSkipWait')}
          onPress={() => {
            skipRumbleWait?.();
          }}
          style={({ pressed }) => [
            styles.rumbleSkipWaitButton,
            isCompactHeader && styles.rumbleSkipWaitButtonCompact,
            SOFT_SURFACE_STYLES.face,
            darkModeFlatTop,
            SOFT_SURFACE_STYLES.raised,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text
            style={[
              styles.rumbleSkipWaitText,
              isCompactHeader && styles.rumbleSkipWaitTextCompact,
              { color: theme.textOnBackground },
            ]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {t('play.rumbleSkipWait')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const promptBlock = (
    <View style={styles.revealPromptBlock}>
      {promptImageSource ? (
        <Image
          testID="question-prompt-image"
          source={promptImageSource}
          style={styles.promptImageReveal}
          contentFit="contain"
        />
      ) : null}
      <Text
        testID="question-primary-prompt"
        style={[
          styles.questionTextReveal,
          getTextStyle(primaryVariant.locale, 'display', 'center', primaryVariant.prompt),
          {
            color: T.textPrimary,
            fontSize: unrevealedActiveQuestionTypography.fontSize,
            lineHeight: unrevealedActiveQuestionTypography.lineHeight,
            maxWidth: promptLayoutWidth,
            width: '100%',
            alignSelf: 'center',
          },
          Platform.OS === 'web' ? styles.questionTextWeb : null,
        ]}
        {...(Platform.OS === 'web'
          ? {}
          : {
              numberOfLines: 2,
              adjustsFontSizeToFit: true,
              minimumFontScale: 0.62,
              maxFontSizeMultiplier: 1.2,
            })}
      >
        {primaryVariant.prompt}
      </Text>
      {secondaryPrompt}
    </View>
  );

  return (
    <View style={[styles.canvas, { backgroundColor: surfaceColors.canvas }]}>
      {usePillHeader ? (
        <View
          style={[
            styles.pillChromeBlock,
            {
              paddingTop: questionChromePaddingTop,
              paddingLeft: topicPad.paddingLeft,
              paddingRight: topicPad.paddingRight,
            },
          ]}
        >
          <View style={styles.pillChromeRow}>
            <View style={[styles.chromeSide, { width: chromeSideWidth, minWidth: chromeSideWidth }]}>
              <HeaderBackButton
                onPress={onBackToBoard}
                direction={direction}
                rowDirection={rowDirection}
                label={t('common.back')}
                accessibilityLabel="Back to question board"
                variant={backVariant}
              />
            </View>
            <View style={styles.chromeCenter}>{metaPill}</View>
            <View
              style={[
                styles.chromeSide,
                styles.chromeSideRight,
                { width: chromeSideWidth, minWidth: chromeSideWidth },
              ]}
            >
              {timerNode}
            </View>
          </View>
          {wagerMultiplier}
          {rumblePartyChips}
          {rumbleTimingGuide ? (
            <Text
              testID="rumble-timing-guide"
              style={[styles.rumbleStatusUnderPill, { color: BRAND.charcoal }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {rumbleTimingGuide.toUpperCase()}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={[
              styles.header,
              {
                paddingTop: questionChromePaddingTop,
              },
            ]}
          >
            <View
              style={[
                styles.backButtonSlot,
                { left: Math.max(insets.left + SPACING.sm, SPACING.xl) },
              ]}
            >
              <HeaderBackButton
                onPress={onBackToBoard}
                direction={direction}
                rowDirection={rowDirection}
                label={t('common.back')}
                accessibilityLabel="Back to question board"
                variant={backVariant}
              />
            </View>
            <Text style={[styles.teamTag, { color: BRAND.charcoal }]}>
              {`[${currentTeam?.name || 'TEAM'}]`.toUpperCase()}
            </Text>
            {hotSeatNames ? (
              <View
                style={[
                  styles.hotSeatBanner,
                  darkModeFlatTop,
                  { backgroundColor: theme.cardBackground, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.hotSeatTitle, { color: theme.textSecondaryOnBackground }]}>
                  {t('play.hotSeatActiveTitle').toUpperCase()}
                </Text>
                <Text style={[styles.hotSeatNames, { color: theme.textOnBackground }]}>
                  {hotSeatNames}
                </Text>
              </View>
            ) : null}
            <Text
              style={[styles.topicText, { color: BRAND.charcoal }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {`Topic: ${q.categoryName}`.toUpperCase()}
            </Text>
            <Text style={[styles.pointsText, { color: BRAND.charcoal + '88' }]}>
              {`Points: ${q.pointValue}`}
            </Text>
            {wagerMultiplier}
          </View>
          <View
            style={[
              styles.timerContainer,
              {
                top: MATCH_TOP_BAR_EST_HEIGHT + questionChromePaddingTop,
                right: Math.max(insets.right, SPACING.sm),
              },
            ]}
          >
            {timerNode}
          </View>
        </>
      )}

      {isAnswerPhase ? (
        <View style={styles.answerPhaseShell} pointerEvents="box-none">
          <ScrollView
            testID="question-answer-scroll"
            style={styles.answerScroll}
            contentContainerStyle={[
              styles.answerScrollContent,
              Platform.OS === 'web' ? styles.answerScrollContentWeb : null,
              {
                paddingBottom: Math.max(
                  insets.bottom,
                  Math.round(
                    (SPACING.lg + (showAnswerPhaseNextTurnDock ? 82 : 0)) *
                      questionViewportScale
                  )
                ),
                paddingHorizontal: answerPhaseScrollPaddingH,
              },
            ]}
            showsVerticalScrollIndicator
            bounces
          >
            <View
              style={[
                styles.answerContentStack,
                { maxWidth: questionContentWidth },
                Platform.OS === 'web' ? styles.answerContentStackWeb : null,
              ]}
            >
              {promptBlock}
              <PlayAnswerPanel
                embedded
                scrollEmbedded
                viewportScale={questionViewportScale}
                suppressPostScoreWagerButton={answerPhaseCanWager}
                suppressPostScoreActions={showAnswerPhaseNextTurnDock}
              />
            </View>
          </ScrollView>
          {showAnswerPhaseNextTurnDock ? (
            <View
              testID="question-answer-next-turn-dock"
              style={[
                styles.answerNextTurnDock,
                {
                  left: Math.max(insets.left, answerPhaseScrollPaddingH),
                  right: Math.max(insets.right, answerPhaseScrollPaddingH),
                  bottom: Math.max(insets.bottom, SPACING.sm),
                },
              ]}
              pointerEvents="box-none"
            >
              <View
                style={[
                  styles.answerNextTurnDockRow,
                  {
                    maxWidth: Math.round(600 * questionViewportScale),
                    gap: Math.round(SPACING.sm * questionViewportScale),
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    continueAfterStandardQuestion();
                    router.replace('/play/board');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={(session.bonus.active
                    ? t('play.finishMatch')
                    : t('play.nextTurn')
                  ).toUpperCase()}
                  style={({ pressed }) => [
                    styles.answerNextTurnButton,
                    SOFT_SURFACE_STYLES.face,
                    darkModeFlatTop,
                    {
                      minHeight: Math.round(54 * questionViewportScale),
                      maxWidth: Math.round(320 * questionViewportScale),
                      borderRadius: Math.round(BORDER_RADIUS.button * questionViewportScale),
                      paddingHorizontal: Math.round(SPACING.lg * questionViewportScale),
                      paddingVertical: Math.round(SPACING.md * questionViewportScale),
                      backgroundColor: surfaceColors.surface,
                      opacity: pressed ? 0.94 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                    neumorphicLift3D('pill'),
                  ]}
                >
                  <Text
                    testID="question-answer-next-turn-text"
                    style={[
                      styles.answerNextTurnText,
                      {
                        fontSize: Math.round(14 * questionViewportScale),
                        lineHeight: Math.round(18 * questionViewportScale),
                        letterSpacing: 1.2 * questionViewportScale,
                        color: surfaceColors.textPrimary,
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {(session.bonus.active ? t('play.finishMatch') : t('play.nextTurn')).toUpperCase()}
                  </Text>
                </Pressable>
                {answerPhaseCanWager ? (
                  <Pressable
                    testID="question-answer-wager-button"
                    accessibilityRole="button"
                    accessibilityLabel={t('play.wagerNextTeam')}
                    onPress={() => {
                      const result = initiateWager();
                      if (result.ok) {
                        router.replace('/play/board');
                      }
                    }}
                    style={({ pressed }) => [
                      styles.answerDockWagerButton,
                      SOFT_SURFACE_STYLES.face,
                      darkModeFlatTop,
                      {
                        minHeight: Math.round(54 * questionViewportScale),
                        maxWidth: Math.round(220 * questionViewportScale),
                        borderRadius: Math.round(BORDER_RADIUS.button * questionViewportScale),
                        gap: Math.round(6 * questionViewportScale),
                        paddingHorizontal: Math.round(SPACING.md * questionViewportScale),
                        paddingVertical: Math.round(SPACING.md * questionViewportScale),
                        opacity: pressed ? 0.92 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                      neumorphicLift3D('pill'),
                      styles.answerDockWagerDepth,
                    ]}
                  >
                    <Image
                      source={WAGER_FAB_ICON}
                      style={[
                        styles.answerDockWagerImage,
                        {
                          width: Math.round(22 * questionViewportScale),
                          height: Math.round(22 * questionViewportScale),
                        },
                      ]}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      accessibilityIgnoresInvertColors
                    />
                    <Text
                      style={[
                        styles.answerDockWagerText,
                        {
                          fontSize: Math.round(13 * questionViewportScale),
                          lineHeight: Math.round(17 * questionViewportScale),
                          letterSpacing: questionViewportScale,
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t('play.wagerCardTitle').toUpperCase()}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          {/* Main question and action stack */}
          <View
            style={[
              styles.contentArea,
              {
                paddingLeft: topicPad.paddingLeft,
                paddingRight: topicPad.paddingRight,
                paddingBottom: Math.max(insets.bottom, SPACING.md),
              },
            ]}
          >
            <ScrollView
              testID="question-content-scroll"
              style={[styles.questionScroll, { width: questionContentWidth }]}
              contentContainerStyle={[
                styles.questionScrollContent,
                Platform.OS === 'web' ? styles.questionScrollContentWeb : null,
              ]}
            showsVerticalScrollIndicator
            bounces
            nestedScrollEnabled
            >
              <View
                style={[
                  styles.questionBox,
                  {
                    gap: Math.round(SPACING.xl * questionViewportScale),
                    paddingTop: Math.round(SPACING.sm * questionViewportScale),
                    paddingBottom: Math.round(SPACING.md * questionViewportScale),
                  },
                ]}
              >
                {promptImageSource ? (
                  <Image
                    testID="question-prompt-image"
                    source={promptImageSource}
                    style={[
                      styles.promptImage,
                      { height: Math.round(200 * questionViewportScale) },
                    ]}
                    contentFit="contain"
                  />
                ) : null}
                {secondaryPrompt ? (
                  <View style={styles.bilingualPromptStack}>
                    {questionBoxPrompt}
                    {secondaryPrompt}
                  </View>
                ) : (
                  questionBoxPrompt
                )}

                <Pressable
                  onPress={() => {
                    revealAnswer();
                  }}
                  disabled={!canShowAnswer}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canShowAnswer }}
                  style={({ pressed }) => [
                    styles.answerButton,
                    {
                      width: Math.round(286 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                      minHeight: Math.round(58 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                      paddingHorizontal: Math.round(32 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                      paddingVertical: Math.round(16 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                    },
                    SOFT_SURFACE_STYLES.face,
                    darkModeFlatTop,
                    {
                      backgroundColor: theme.cardBackground,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: !canShowAnswer ? 0.45 : pressed ? 0.95 : 1,
                    },
                    neumorphicLift3D('pill'),
                  ]}
                >
                  <Text
                    style={[
                      styles.answerButtonText,
                      {
                        color: BRAND.charcoal,
                        fontSize: Math.round(15 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                        lineHeight: Math.round(19 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale),
                        letterSpacing: 1.2 * UNREVEALED_QA_DISPLAY_SCALE * questionViewportScale,
                      },
                    ]}
                  >
                    {t('play.showAnswer').toUpperCase()}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </>
      )}

      {isAnswerPhase ? (
        <QuestionReportControl
          question={q}
          sessionId={session.id}
          offsetRight={Math.max(insets.right, SPACING.sm)}
          offsetBottom={
            Math.max(insets.bottom, SPACING.sm) +
            (showAnswerPhaseNextTurnDock ? Math.round(70 * questionViewportScale) : 0)
          }
        />
      ) : null}
      <WagerInfoModal visible={wagerInfoOpen} onClose={() => setWagerInfoOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: T.canvas,
    position: 'relative',
  },
  pillChromeBlock: {
    width: '100%',
    paddingBottom: SPACING.xs,
    zIndex: 10,
    gap: 2,
  },
  pillChromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  rumbleStatusUnderPill: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.72,
    paddingHorizontal: SPACING.md,
  },
  rumblePartyStatusRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    gap: SPACING.sm,
    paddingTop: 2,
    paddingHorizontal: SPACING.xs,
  },
  rumblePartyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: 420,
    gap: SPACING.sm,
  },
  rumbleSkipWaitButton: {
    flexShrink: 0,
    alignSelf: 'center',
    minWidth: 72,
    maxWidth: 96,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  rumbleSkipWaitButtonCompact: {
    minWidth: 64,
    maxWidth: 84,
    minHeight: 40,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  rumbleSkipWaitText: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  rumbleSkipWaitTextCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  rumblePartyChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    gap: 1,
  },
  rumblePartyChipCompact: {
    minHeight: 40,
    borderRadius: 14,
    paddingVertical: 5,
  },
  rumblePartyChipLocked: {
    opacity: 0.55,
  },
  rumblePartyChipActive: {
    borderColor: T.accentGlow,
    backgroundColor: T.surface,
  },
  rumblePartyChipName: {
    fontFamily: FONTS.uiBold,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: 0.2,
    color: T.textPrimary,
    textAlign: 'center',
    width: '100%',
  },
  rumblePartyChipNameCompact: {
    fontSize: 12.5,
    lineHeight: 15,
  },
  rumblePartyChipNameLocked: {
    opacity: 0.85,
    letterSpacing: 1.2,
  },
  rumblePartyChipRole: {
    fontFamily: FONTS.uiBold,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.7,
    color: T.textMuted,
    textAlign: 'center',
  },
  rumblePartyChipRoleCompact: {
    fontSize: 8.5,
    lineHeight: 10,
  },
  rumblePartyChipRoleActive: {
    color: T.accentGlow,
  },
  chromeSide: {
    width: 88,
    minWidth: 88,
    justifyContent: 'center',
  },
  chromeSideRight: {
    alignItems: 'flex-end',
  },
  chromeCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    width: '100%',
    maxWidth: 560,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: T.surface,
    gap: SPACING.xs,
  },
  metaPillText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.75,
    color: T.textPrimary,
    flexShrink: 1,
    textAlign: 'center',
  },
  metaPillTextCompact: {
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0.55,
  },
  wagerMultiplierText: {
    fontFamily: FONTS.displayBold,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  timerRingPill: {
    minWidth: 68,
    height: 40,
    borderRadius: BORDER_RADIUS.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51, 51, 51, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    paddingHorizontal: 8,
    ...SOFT_SURFACE_STYLES.face,
    ...SOFT_SURFACE_STYLES.raised,
  },
  timerValuePill: {
    fontFamily: FONTS.uiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
  answerScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  answerScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xs,
  },
  answerScrollContentWeb: {
    justifyContent: 'center',
    paddingTop: 0,
  },
  answerContentStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  answerContentStackWeb: {
    transform: [{ translateY: -40 }],
  },
  answerPhaseShell: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  answerDockWagerButton: {
    minHeight: 54,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 220,
    borderRadius: BORDER_RADIUS.button,
    backgroundColor: '#FF8A00',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  answerDockWagerDepth: {
    borderTopColor: 'rgba(255, 214, 163, 0.72)',
    borderBottomColor: '#C76400',
    shadowColor: 'rgba(255, 138, 0, 0.42)',
  },
  answerDockWagerImage: {
    width: 22,
    height: 22,
    flexShrink: 0,
  },
  answerDockWagerText: {
    fontFamily: FONTS.uiBold,
    fontSize: 13,
    letterSpacing: 1,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  answerNextTurnDock: {
    position: 'absolute',
    zIndex: 28,
    alignItems: 'center',
  },
  answerNextTurnDockRow: {
    width: '100%',
    maxWidth: 600,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  answerNextTurnButton: {
    minHeight: 54,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 320,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  answerNextTurnText: {
    fontFamily: FONTS.uiBold,
    fontSize: 14,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  revealPromptBlock: {
    width: '100%',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  promptImageReveal: {
    width: '100%',
    maxHeight: 120,
  },
  questionTextReveal: {
    textAlign: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: SPACING.lg,
    gap: 0,
    paddingBottom: SPACING.xs,
    zIndex: 10,
  },
  backButtonSlot: {
    position: 'absolute',
    left: SPACING.lg,
    top: '50%',
    marginTop: -22,
    zIndex: 12,
  },
  teamTag: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    letterSpacing: 1,
    opacity: 0.8,
  },
  rumbleTeamWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 26,
  },
  rumbleStatus: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    opacity: 0.7,
    textAlign: 'center',
  },
  hotSeatBanner: {
    marginTop: SPACING.xs,
    borderRadius: 14,
    backgroundColor: T.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...SOFT_SURFACE_STYLES.face,
    ...SOFT_SURFACE_STYLES.raised,
  },
  hotSeatTitle: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    color: T.textPrimary,
    letterSpacing: 1,
    opacity: 0.65,
  },
  hotSeatNames: {
    fontFamily: FONTS.displayBold,
    fontSize: 15,
    color: T.textPrimary,
    textAlign: 'center',
  },
  topicText: {
    fontFamily: FONTS.display,
    fontSize: 15,
    letterSpacing: 0.35,
    lineHeight: 18,
  },
  pointsText: {
    fontFamily: FONTS.ui,
    fontSize: 12,
    marginTop: 1,
  },
  timerContainer: {
    position: 'absolute',
    width: 64,
    height: 64,
    zIndex: 20,
  },
  timerRing: {
    flex: 1,
    minWidth: 68,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(51, 51, 51, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  timerValue: {
    fontFamily: FONTS.uiBold,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xs,
  },
  questionScroll: {
    flex: 1,
    minHeight: 0,
  },
  questionScrollContent: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  questionScrollContentWeb: {
    overflow: 'visible',
  },
  questionTextWeb: {
    overflow: 'visible',
    flexShrink: 1,
  },
  questionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    width: '100%',
    maxWidth: '100%',
    overflow: 'visible',
  },
  promptImage: {
    width: '100%',
    height: 200,
  },
  questionText: {
    textAlign: 'center',
    width: '100%',
  },
  /** Primary prompt with the secondary language beneath it (two content languages set). */
  bilingualPromptStack: {
    width: '100%',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  answerButton: {
    width: Math.round(286 * UNREVEALED_QA_DISPLAY_SCALE),
    maxWidth: '88%',
    minHeight: Math.round(58 * UNREVEALED_QA_DISPLAY_SCALE),
    paddingHorizontal: Math.round(32 * UNREVEALED_QA_DISPLAY_SCALE),
    paddingVertical: Math.round(16 * UNREVEALED_QA_DISPLAY_SCALE),
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerButtonText: {
    fontFamily: FONTS.uiBold,
    fontSize: Math.round(15 * UNREVEALED_QA_DISPLAY_SCALE),
    letterSpacing: 1.2 * UNREVEALED_QA_DISPLAY_SCALE,
  },
});

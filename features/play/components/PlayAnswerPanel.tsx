import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { showThemedAlert } from '@/store/themedAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '@/components/ui/Pressable';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Image } from 'expo-image';
import { Button } from '@/components/ui/Button';
import { FONTS, BORDER_RADIUS, FONT_SIZES, SPACING, COLORS, TYPE_SCALE } from '@/constants';
import { PlayScaffold } from '@/features/play/components/PlayScaffold';
import { SOFT_SURFACE_FACE, softSurfaceLift } from '@/features/play/styles/softSurface';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { SecondaryLanguageText } from '@/features/play/components/SecondaryLanguageText';
import { useQuestionVariants } from '@/features/play/useQuestionVariants';
import { useDarkModeFlatTop, useTheme } from '@/lib/hooks/useTheme';
import { usePlayStore } from '@/store/play';
import { usePlayTextScale } from '@/store/display';
import { abandonGameEntry } from '@/lib/wallet/gameEntry';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { HOME_SOFT_UI } from '@/themes';
import type { GameSessionState, TeamState } from '@/features/shared';

const T = HOME_SOFT_UI.colors;
/** `styles.questionPromptText` size, shared with the secondary-language prompt beneath it. */
const QUESTION_PROMPT_FONT_SIZE = 16;
const QUESTION_PROMPT_LINE_HEIGHT = 24;

/** Deeper drop shadow - reads as a raised plastic tile (tier scales with control size). */
function neumorphicLift(
  shadowColor: string,
  _tier: 'hero' | 'header' | 'pill' | 'card'
): ViewStyle {
  return {
    ...softSurfaceLift(),
    shadowColor,
  };
}

/** Flat card face — no bevel lips / gray strips (SOFT_SURFACE_FACE is flat). */
const PLASTIC_FACE: ViewStyle = {
  ...SOFT_SURFACE_FACE,
};

function getAnswerLayoutDensity(screenWidth: number, screenHeight: number) {
  const shortSide = Math.min(screenWidth, screenHeight);
  if (shortSide < 340) {
    return {
      borderWidth: 1,
      answerFontSize: FONT_SIZES.sm,
      answerLineHeight: 18,
      sectionTitleSize: FONT_SIZES.xs,
      railPadV: SPACING.xs,
      segmentTitleSize: 11,
      segmentMetaSize: 10,
      sheetGap: SPACING.sm,
      answerCardPadV: SPACING.sm,
      answerCardPadH: SPACING.sm,
    };
  }
  if (screenHeight < 400) {
    return {
      borderWidth: 1,
      answerFontSize: FONT_SIZES.md,
      answerLineHeight: 22,
      sectionTitleSize: FONT_SIZES.sm,
      railPadV: SPACING.sm,
      segmentTitleSize: FONT_SIZES.xs,
      segmentMetaSize: 10,
      sheetGap: SPACING.md,
      answerCardPadV: SPACING.md,
      answerCardPadH: SPACING.md,
    };
  }
  if (screenHeight < 520) {
    return {
      borderWidth: 1,
      answerFontSize: FONT_SIZES.lg,
      answerLineHeight: 26,
      sectionTitleSize: FONT_SIZES.md,
      railPadV: SPACING.md,
      segmentTitleSize: FONT_SIZES.sm,
      segmentMetaSize: FONT_SIZES.xs,
      sheetGap: SPACING.lg,
      answerCardPadV: SPACING.lg,
      answerCardPadH: SPACING.lg,
    };
  }
  return {
    borderWidth: 2,
    answerFontSize: FONT_SIZES.xl,
    answerLineHeight: 30,
    sectionTitleSize: FONT_SIZES.md,
    railPadV: SPACING.md,
    segmentTitleSize: FONT_SIZES.sm,
    segmentMetaSize: FONT_SIZES.xs,
    sheetGap: SPACING.lg,
    answerCardPadV: SPACING.lg,
    answerCardPadH: SPACING.lg,
  };
}

function getAwardTargetTeams(session: GameSessionState): TeamState[] {
  if (session.mode !== 'rumble' || !session.currentQuestion) {
    return session.teams;
  }

  const assignedTeamIds = [
    session.currentQuestion.rumbleFirstTeamId,
    session.currentQuestion.rumbleSecondTeamId,
  ];

  return assignedTeamIds
    .map((teamId) => session.teams.find((team) => team.id === teamId))
    .filter((team): team is TeamState => Boolean(team));
}

type AnswerDensity = ReturnType<typeof getAnswerLayoutDensity> & {
  awardStackMinH: number;
  awardStackPadV: number;
  answerEyebrowMarginBottom: number;
};

function mergeAnswerDensity(
  base: ReturnType<typeof getAnswerLayoutDensity>,
  opts: {
    windowHeight: number;
    insetTop: number;
    insetBottom: number;
    stackedAwards: boolean;
    awardSegments: number;
    showPointsSection: boolean;
    showPostScoreRow: boolean;
    wagerFooter: boolean;
    bonusSubtitle: boolean;
  }
): AnswerDensity {
  const chromeEst = 128 + (opts.bonusSubtitle ? 22 : 0);
  const footerReserve = opts.wagerFooter ? 68 : 0;
  const avail =
    opts.windowHeight - opts.insetTop - opts.insetBottom - chromeEst - footerReserve;

  const minAnswer = 52;
  const minSection = 18;
  const minBtnRow = 46;
  const perStackRow = 40;
  const railBlock = 48;
  const pageGaps = base.sheetGap * 4;
  let need =
    pageGaps +
    minAnswer +
    (opts.showPointsSection
      ? minSection +
        (opts.stackedAwards ? opts.awardSegments * perStackRow + (opts.awardSegments - 1) * 4 : railBlock) +
        (opts.showPostScoreRow ? minBtnRow : 0)
      : 0);

  const defaultStack: Pick<
    AnswerDensity,
    'awardStackMinH' | 'awardStackPadV' | 'answerEyebrowMarginBottom'
  > = {
    awardStackMinH: 48,
    awardStackPadV: SPACING.sm,
    answerEyebrowMarginBottom: SPACING.sm,
  };

  if (avail < need + 24) {
    return {
      ...base,
      borderWidth: 1,
      sheetGap: SPACING.xs,
      answerCardPadV: SPACING.xs,
      answerCardPadH: SPACING.sm,
      answerFontSize: Math.min(base.answerFontSize, FONT_SIZES.sm),
      answerLineHeight: Math.min(base.answerLineHeight, 18),
      sectionTitleSize: FONT_SIZES.xs,
      railPadV: SPACING.xs,
      segmentTitleSize: Math.min(base.segmentTitleSize, 11),
      segmentMetaSize: Math.min(base.segmentMetaSize, 10),
      awardStackMinH: 34,
      awardStackPadV: SPACING.xs,
      answerEyebrowMarginBottom: SPACING.xs,
    };
  }
  if (avail < need + 56) {
    return {
      ...base,
      sheetGap: Math.min(base.sheetGap, SPACING.sm),
      answerCardPadV: Math.min(base.answerCardPadV, SPACING.sm),
      awardStackMinH: 40,
      awardStackPadV: SPACING.xs,
      answerEyebrowMarginBottom: SPACING.xs,
    };
  }
  return { ...base, ...defaultStack };
}

/**
 * Tapers type, padding, and tile size from 1.0 on compact viewports down toward ~0.7
 * on large or very wide screens so the answer + scoring block stays a readable size.
 */
function getAnswerViewportScale(width: number, height: number): number {
  const short = Math.min(width, height);
  if (short < 1) return 1;
  const fromShort = Math.min(1, 420 / short);
  const long = Math.max(width, height);
  const wideDampen = long / short > 2.35 ? 0.9 : 1;
  return Math.max(0.7, fromShort * wideDampen);
}

function roundPx(n: number) {
  return Math.max(1, Math.round(n));
}

function scaleAnswerDensity(d: AnswerDensity, scale: number, textScale = 1): AnswerDensity {
  const r = (n: number) => roundPx(n * scale);
  const rFont = (n: number, min = 8) => Math.max(min, Math.round(n * scale * textScale));
  return {
    ...d,
    borderWidth: Math.max(1, Math.min(2, r(d.borderWidth))),
    answerFontSize: rFont(d.answerFontSize, 10),
    answerLineHeight: rFont(d.answerLineHeight, 14),
    sectionTitleSize: rFont(d.sectionTitleSize),
    railPadV: r(d.railPadV),
    segmentTitleSize: rFont(d.segmentTitleSize, 9),
    segmentMetaSize: rFont(d.segmentMetaSize, 8),
    sheetGap: r(d.sheetGap),
    answerCardPadV: r(d.answerCardPadV),
    answerCardPadH: r(d.answerCardPadH),
    awardStackMinH: Math.max(30, r(d.awardStackMinH)),
    awardStackPadV: r(d.awardStackPadV),
    answerEyebrowMarginBottom: r(d.answerEyebrowMarginBottom),
  };
}

/**
 * Constrain embedded answer column so cards are not edge-to-edge on very wide viewports;
 * `shortSide` is the main driver, `width` the hard ceiling.
 */
function getAnswerContentMaxWidth(
  width: number,
  height: number,
  viewportScale: number
): number {
  const short = Math.min(width, height);
  const compactHeight = height < 430;
  const fromShort = short * (compactHeight ? 1.28 : 1.42) + 80;
  const fromWidth = width - 32;
  const cap = (compactHeight ? 620 : 700) * Math.max(1, viewportScale);
  return Math.max(320, Math.min(cap, fromShort * Math.max(1, viewportScale), fromWidth));
}

function shouldStackAwardLayout(
  screenWidth: number,
  teamCount: number,
  viewportScale: number = 1
): boolean {
  const segments = teamCount + 1;
  const segW = 44 * Math.max(0.78, Math.min(1, viewportScale));
  const minForRail = segments * segW + Math.max(0, segments - 1) * 2;
  return screenWidth < minForRail + 24;
}

export function PlayAnswerPanel({
  embedded = false,
  scrollEmbedded = false,
  viewportScale,
  suppressPostScoreWagerButton = false,
  suppressPostScoreActions = false,
}: {
  embedded?: boolean;
  /** Use inside a parent ScrollView: no nested flex-fill so the column sizes naturally. */
  scrollEmbedded?: boolean;
  /** Parent-owned scale for proportional embedded layouts. */
  viewportScale?: number;
  /** When the parent (e.g. question route) shows a floating wager CTA, hide the inline orange button. */
  suppressPostScoreWagerButton?: boolean;
  /** When the parent owns a sticky post-score CTA, hide the inline post-score row. */
  suppressPostScoreActions?: boolean;
}) {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const darkModeFlatTop = useDarkModeFlatTop();
  const surfaceColors = getPlaySurfaceColors();
  const { direction, getTextStyle, t } = useI18n();
  const playTextScale = usePlayTextScale();
  const session = usePlayStore((state) => state.session);
  /** Primary (and optional secondary) content-language text for the chosen question. */
  const questionVariants = useQuestionVariants(session?.currentQuestion);
  const resetSession = usePlayStore((state) => state.resetSession);
  const refundEntryMutation = useMutation(api.wallet.refundEntry);
  const awardStandardQuestion = usePlayStore((state) => state.awardStandardQuestion);
  const continueAfterStandardQuestion = usePlayStore((state) => state.continueAfterStandardQuestion);
  const initiateWager = usePlayStore((state) => state.initiateWager);
  const resolveWager = usePlayStore((state) => state.resolveWager);
  const awardTargetTeams = useMemo(
    () => (session ? getAwardTargetTeams(session) : []),
    [session]
  );

  const scrollChain = embedded && scrollEmbedded;

  const answerViewportScale = useMemo(
    () => viewportScale ?? getAnswerViewportScale(windowWidth, windowHeight),
    [viewportScale, windowWidth, windowHeight]
  );

  const answerContentMaxWidth = useMemo(
    () => getAnswerContentMaxWidth(windowWidth, windowHeight, answerViewportScale),
    [windowWidth, windowHeight, answerViewportScale]
  );

  /** Tighter only on very short embedded answer layouts; web/tablet should feel like a reveal stage. */
  const combinedCardLayoutScale = scrollChain ? (windowHeight < 430 ? 0.88 : 0.96) : 1;
  /** Keep the embedded correct-answer card compact so scoring controls remain visually distinct. */
  const answerCardOnlyScale = scrollChain ? (windowHeight < 430 ? 0.88 : 0.94) : 1;

  const awardRowGap = useMemo(
    () => Math.max(SPACING.xs, Math.round(SPACING.md * (0.85 * answerViewportScale + 0.15))),
    [answerViewportScale]
  );

  const awardRowGapTight = useMemo(
    () => Math.max(SPACING.xs, Math.round(awardRowGap * combinedCardLayoutScale)),
    [awardRowGap, combinedCardLayoutScale]
  );

  const answerImageHeight = useMemo(
    () => Math.max(100, Math.round(160 * (0.85 * answerViewportScale + 0.15))),
    [answerViewportScale]
  );

  const cardRadiusScaled = useMemo(
    () => Math.max(10, Math.round(BORDER_RADIUS.button * answerViewportScale)),
    [answerViewportScale]
  );

  const awardTileRadius = useMemo(
    () => Math.max(10, Math.round(14 * (0.85 * answerViewportScale + 0.15))),
    [answerViewportScale]
  );

  const layoutDensity: AnswerDensity = useMemo(() => {
    const base = getAnswerLayoutDensity(windowWidth, windowHeight);
    if (!session?.currentQuestion) {
      return scaleAnswerDensity(
        mergeAnswerDensity(base, {
          windowHeight,
          insetTop: insets.top,
          insetBottom: insets.bottom,
          stackedAwards: false,
          awardSegments: 3,
          showPointsSection: false,
          showPostScoreRow: false,
          wagerFooter: false,
          bonusSubtitle: false,
        }),
        answerViewportScale,
        playTextScale
      );
    }
    const wagerActive = !!session.wager;
    const postScore = !wagerActive && session.phase === 'scoring';
    const awardTeamCount = getAwardTargetTeams(session).length;
    const stacked = shouldStackAwardLayout(windowWidth, awardTeamCount, answerViewportScale);
    const bonusSubtitle = session.bonus.active && windowHeight >= 360;
    return scaleAnswerDensity(
      mergeAnswerDensity(base, {
        windowHeight,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        stackedAwards: stacked,
        awardSegments: awardTeamCount + 1,
        showPointsSection: !wagerActive,
        showPostScoreRow: postScore,
        wagerFooter: wagerActive,
        bonusSubtitle,
      }),
      answerViewportScale,
      playTextScale
    );
  }, [windowWidth, windowHeight, insets.top, insets.bottom, session, answerViewportScale, playTextScale]);

  const rowDir = getRowDirection(direction);
  const chromeGap =
    Math.min(windowWidth, windowHeight) < 420 ? SPACING.sm : SPACING.lg;
  /** One rhythm for gaps between answer card, headings, awards, and action rows (matches question `chromeGap` × density). */
  const sectionGap = Math.min(Math.round(chromeGap * (0.75 + 0.25 * answerViewportScale)), layoutDensity.sheetGap);
  const pageColumnGap = sectionGap;
  const actionButtonStyle = {
    minHeight: Math.round(56 * answerViewportScale),
    borderRadius: Math.round(BORDER_RADIUS.button * answerViewportScale),
    paddingHorizontal: Math.round((SPACING.xl + 4) * answerViewportScale),
  };
  const actionButtonTextStyle = {
    fontSize: Math.round(14 * answerViewportScale),
    lineHeight: Math.round(18 * answerViewportScale),
    letterSpacing: 2 * answerViewportScale,
  };

  const confirmLeaveMatch = () => {
    const performLeave = async () => {
      await abandonGameEntry(refundEntryMutation, {
        reservationId: usePlayStore.getState().entryReservationId,
        reason: 'user_abandoned',
        resetSession: () => resetSession(),
      });
      router.replace('/(app)/');
    };

    showThemedAlert(t('play.leaveMatchTitle'), t('play.leaveMatchBody'), [
      { text: t('common.stay'), style: 'cancel' },
      {
        text: t('common.leave'),
        style: 'destructive',
        onPress: () => {
          void performLeave();
        },
      },
    ]);
  };

  if (!session?.currentQuestion) {
    if (embedded) {
      return null;
    }
    return (
      <PlayScaffold title={t('common.loading')}>
        <Text>{t('common.loading')}</Text>
      </PlayScaffold>
    );
  }

  const currentQuestion = session.currentQuestion;
  const primaryVariant = questionVariants?.primary ?? {
    locale: currentQuestion.locale,
    prompt: currentQuestion.prompt,
    answer: currentQuestion.answer,
    fellBackToEnglish: false,
  };
  const secondaryVariant = questionVariants?.secondary ?? null;
  const questionTextStyle = (
    role: 'body' | 'bodyMedium' | 'bodySemibold' | 'bodyBold' | 'display' | 'displayBold',
    edge: 'start' | 'center' | 'end',
    content?: string
  ) => getTextStyle(primaryVariant.locale, role, edge, content);
  const wager = session.wager;
  const isTimedOut = session.timedOutQuestionId === currentQuestion.id;
  const showPostScoreActions = !wager && session.phase === 'scoring';
  const canWager =
    session.config.wagerEnabled &&
    !session.bonus.active &&
    !wager &&
    !isTimedOut &&
    session.phase === 'scoring' &&
    (session.teams.find((team) => team.id === session.currentTeamId)?.wagersUsed ?? 0) < session.wagersPerTeam;

  const pointsThisQuestion =
    currentQuestion.pointValue * (session.bonus.active ? session.bonus.multiplier : 1);

  const stackedAwards = shouldStackAwardLayout(windowWidth, awardTargetTeams.length, answerViewportScale);
  const hideSubtitle = windowHeight < 360;
  const awardChoiceCommitted =
    session.phase === 'scoring' && session.lastAwardedTeamId !== undefined;
  const teamAwardSurface = (teamId: string, variant: 'stack' | 'rail' | 'tile'): string => {
    const idle = variant === 'rail' ? colors.backgroundSecondary : colors.cardBackground;
    if (awardChoiceCommitted) {
      return session.lastAwardedTeamId === teamId
        ? 'rgba(255, 179, 71, 0.18)'
        : idle;
    }
    if (session.phase === 'answerLock' && teamId === session.currentTeamId) {
      return 'rgba(255, 179, 71, 0.12)';
    }
    return idle;
  };

  const neitherAwardSurface = (variant: 'stack' | 'rail' | 'tile'): string => {
    const idle = variant === 'rail' ? colors.backgroundSecondary : colors.cardBackground;
    if (awardChoiceCommitted && session.lastAwardedTeamId === null) {
      return 'rgba(255, 179, 71, 0.14)';
    }
    return idle;
  };

  const footer = wager ? (
    <View style={[styles.footerRow, { flexDirection: rowDir, gap: sectionGap }]}>
      <View style={styles.footerBtn}>
        <Button
          title={`CORRECT FOR ${session.teams.find((team) => team.id === wager.targetTeamId)?.name ?? 'Target Team'}`.toUpperCase()}
          onPress={() => {
            resolveWager(true);
            router.replace('/play/board');
          }}
          style={[
            styles.softUiBtn,
            darkModeFlatTop,
            actionButtonStyle,
            { backgroundColor: colors.cardBackground },
          ]}
          textStyle={[
            styles.softUiBtnText,
            actionButtonTextStyle,
            { color: colors.textOnBackground },
            getTextStyle(undefined, 'bodySemibold', 'center'),
          ]}
        />
      </View>
      <View style={styles.footerBtn}>
        <Button
          title="INCORRECT"
          onPress={() => {
            resolveWager(false);
            router.replace('/play/board');
          }}
          style={[
            styles.softUiBtn,
            darkModeFlatTop,
            actionButtonStyle,
            { backgroundColor: surfaceColors.dangerSoftBackground },
          ]}
          textStyle={[
            styles.softUiBtnText,
            actionButtonTextStyle,
            { color: COLORS.error },
            getTextStyle(undefined, 'bodySemibold', 'center'),
          ]}
        />
      </View>
    </View>
  ) : undefined;

  const awardTileMinHeight =
    (scrollChain ? (windowHeight < 430 ? 76 : 88) : 72) * Math.max(1, answerViewportScale);
  const awardTitleFontSize = Math.max(
    windowWidth >= 900 ? 15 : 12,
    Math.round(layoutDensity.segmentTitleSize * (scrollChain ? 1.14 : 1.05))
  );
  const awardMetaFontSize = Math.max(
    windowWidth >= 900 ? 12 : 10,
    Math.round(layoutDensity.segmentMetaSize * (scrollChain ? 1.08 : 1))
  );
  const awardSelectedBorder = '#FFB347';
  const awardIdleBorder = colors.border;

  const postScoreActions = showPostScoreActions ? (
    <View style={[styles.postScoreActionRow, { flexDirection: rowDir, gap: sectionGap }]}>
      <View style={styles.postScorePrimaryBtn}>
        <Button
          title={(session.bonus.active ? t('play.finishMatch') : t('play.nextTurn')).toUpperCase()}
          onPress={() => {
            continueAfterStandardQuestion();
            router.replace('/play/board');
          }}
          style={[
            styles.softUiBtn,
            darkModeFlatTop,
            actionButtonStyle,
            { backgroundColor: colors.cardBackground },
          ]}
          textStyle={[
            styles.softUiBtnText,
            actionButtonTextStyle,
            { color: colors.textOnBackground },
            getTextStyle(undefined, 'bodySemibold', 'center'),
          ]}
        />
      </View>
      {canWager && !suppressPostScoreWagerButton ? (
        <View style={styles.postScoreWagerBtn}>
          <Button
            title={t('play.wagerNextTeam').toUpperCase()}
            onPress={() => {
              const result = initiateWager();
              if (result.ok) {
                router.replace('/play/board');
              }
            }}
            style={[
              styles.softUiBtn,
              darkModeFlatTop,
              actionButtonStyle,
              { backgroundColor: COLORS.secondary },
            ]}
            textStyle={[
              styles.softUiBtnText,
              actionButtonTextStyle,
              { color: '#FFFFFF' },
              getTextStyle(undefined, 'bodySemibold', 'center'),
            ]}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  const renderSelectedCheck = (selected: boolean) =>
    selected ? (
      <View style={styles.awardCheckMark}>
        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
      </View>
    ) : null;

  const renderAwardTargets = () => {
    if (stackedAwards) {
      return (
        <View style={[styles.awardStack, { gap: awardRowGapTight }]}>
          {awardTargetTeams.map((team) => (
              <Pressable
                key={team.id}
                style={({ pressed }) => [
                  styles.awardTile,
                  darkModeFlatTop,
                  {
                    borderRadius: Math.max(8, Math.round(awardTileRadius * combinedCardLayoutScale)),
                    backgroundColor: teamAwardSurface(team.id, 'tile'),
                    minHeight: Math.max(44, Math.round(awardTileMinHeight * combinedCardLayoutScale)),
                    paddingVertical: Math.max(8, Math.round(layoutDensity.awardStackPadV * combinedCardLayoutScale)),
                    paddingHorizontal: Math.max(10, Math.round(SPACING.sm * combinedCardLayoutScale)),
                    alignSelf: 'stretch',
                    borderWidth: awardChoiceCommitted && session.lastAwardedTeamId === team.id ? 2 : StyleSheet.hairlineWidth,
                    borderColor: awardChoiceCommitted && session.lastAwardedTeamId === team.id ? awardSelectedBorder : awardIdleBorder,
                    opacity: isTimedOut ? 0.45 : pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                disabled={isTimedOut}
                onPress={() => awardStandardQuestion(team.id)}
                accessibilityRole="button"
                accessibilityLabel={`${team.name}, +${pointsThisQuestion}`}
                accessibilityState={{ disabled: isTimedOut, selected: awardChoiceCommitted && session.lastAwardedTeamId === team.id }}
              >
                {renderSelectedCheck(awardChoiceCommitted && session.lastAwardedTeamId === team.id)}
                <Text
                  style={[
                    styles.segmentTitle,
                    { color: T.textPrimary, fontSize: awardTitleFontSize, lineHeight: Math.round(awardTitleFontSize * 1.18) },
                    getTextStyle(undefined, 'bodyBold', 'center'),
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {team.name}
                </Text>
                <Text
                  style={[
                    styles.segmentMeta,
                    { color: colors.textSecondaryOnBackground, fontSize: awardMetaFontSize, lineHeight: Math.round(awardMetaFontSize * 1.2) },
                    getTextStyle(undefined, 'body', 'center'),
                  ]}
                  numberOfLines={1}
                >
                  +{pointsThisQuestion} pts
                </Text>
              </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [
              styles.awardNeitherTileBase,
              {
                borderRadius: Math.max(8, Math.round(awardTileRadius * combinedCardLayoutScale)),
                backgroundColor: neitherAwardSurface('tile'),
                minHeight: Math.max(44, Math.round(awardTileMinHeight * combinedCardLayoutScale)),
                paddingVertical: Math.max(8, Math.round(layoutDensity.awardStackPadV * combinedCardLayoutScale)),
                paddingHorizontal: Math.max(10, Math.round(SPACING.sm * combinedCardLayoutScale)),
                alignSelf: 'stretch',
                borderWidth: awardChoiceCommitted && session.lastAwardedTeamId === null ? 2 : 1,
                borderColor: awardChoiceCommitted && session.lastAwardedTeamId === null ? awardSelectedBorder : colors.border,
                opacity: isTimedOut ? 0.45 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            disabled={isTimedOut}
            onPress={() => awardStandardQuestion(null)}
            accessibilityRole="button"
            accessibilityLabel={t('play.neitherTeam')}
            accessibilityState={{ disabled: isTimedOut, selected: awardChoiceCommitted && session.lastAwardedTeamId === null }}
          >
            {renderSelectedCheck(awardChoiceCommitted && session.lastAwardedTeamId === null)}
            <Text
              style={[
                styles.segmentTitle,
                { color: T.textPrimary, fontSize: awardTitleFontSize, lineHeight: Math.round(awardTitleFontSize * 1.18) },
                getTextStyle(undefined, 'bodyBold', 'center'),
              ]}
              numberOfLines={1}
            >
              {t('play.neitherTeam')}
            </Text>
            <Text
              style={[
                styles.segmentMeta,
                { color: colors.textSecondaryOnBackground, fontSize: awardMetaFontSize, lineHeight: Math.round(awardMetaFontSize * 1.2) },
                getTextStyle(undefined, 'body', 'center'),
              ]}
              numberOfLines={2}
            >
              {t('play.noPointsAwarded')}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.awardRow, { flexDirection: rowDir, gap: awardRowGapTight }]}>
        {awardTargetTeams.map((team) => (
          <Pressable
            key={team.id}
            style={({ pressed }) => [
              styles.awardTile,
              darkModeFlatTop,
              {
                borderRadius: Math.max(8, Math.round(awardTileRadius * combinedCardLayoutScale)),
                minHeight: Math.max(44, Math.round(awardTileMinHeight * combinedCardLayoutScale)),
                paddingVertical: Math.max(8, Math.round(layoutDensity.railPadV * combinedCardLayoutScale)),
                paddingHorizontal: Math.max(10, Math.round(SPACING.xs * combinedCardLayoutScale)),
                backgroundColor: teamAwardSurface(team.id, 'tile'),
                borderWidth: awardChoiceCommitted && session.lastAwardedTeamId === team.id ? 2 : StyleSheet.hairlineWidth,
                borderColor: awardChoiceCommitted && session.lastAwardedTeamId === team.id ? awardSelectedBorder : awardIdleBorder,
                opacity: isTimedOut ? 0.45 : pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            disabled={isTimedOut}
            onPress={() => awardStandardQuestion(team.id)}
            accessibilityRole="button"
            accessibilityLabel={`${team.name}, +${pointsThisQuestion}`}
            accessibilityState={{ disabled: isTimedOut, selected: awardChoiceCommitted && session.lastAwardedTeamId === team.id }}
          >
            {renderSelectedCheck(awardChoiceCommitted && session.lastAwardedTeamId === team.id)}
            <Text
              style={[
                styles.segmentTitle,
                { color: T.textPrimary, fontSize: awardTitleFontSize, lineHeight: Math.round(awardTitleFontSize * 1.18) },
                getTextStyle(undefined, 'bodyBold', 'center'),
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {team.name}
            </Text>
            <Text
              style={[
                styles.segmentMeta,
                { color: colors.textSecondaryOnBackground, fontSize: awardMetaFontSize, lineHeight: Math.round(awardMetaFontSize * 1.2) },
                getTextStyle(undefined, 'body', 'center'),
              ]}
              numberOfLines={1}
            >
              +{pointsThisQuestion} pts
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [
            styles.awardNeitherTileBase,
            {
              borderRadius: Math.max(8, Math.round(awardTileRadius * combinedCardLayoutScale)),
              minHeight: Math.max(44, Math.round(awardTileMinHeight * combinedCardLayoutScale)),
              paddingVertical: Math.max(8, Math.round(layoutDensity.railPadV * combinedCardLayoutScale)),
              paddingHorizontal: Math.max(10, Math.round(SPACING.xs * combinedCardLayoutScale)),
              backgroundColor: neitherAwardSurface('tile'),
              borderWidth: awardChoiceCommitted && session.lastAwardedTeamId === null ? 2 : 1,
              borderColor: awardChoiceCommitted && session.lastAwardedTeamId === null ? awardSelectedBorder : colors.border,
              opacity: isTimedOut ? 0.45 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          disabled={isTimedOut}
          onPress={() => awardStandardQuestion(null)}
          accessibilityRole="button"
          accessibilityLabel={t('play.neitherTeam')}
          accessibilityState={{ disabled: isTimedOut, selected: awardChoiceCommitted && session.lastAwardedTeamId === null }}
        >
          {renderSelectedCheck(awardChoiceCommitted && session.lastAwardedTeamId === null)}
          <Text
            style={[
              styles.segmentTitle,
              { color: T.textPrimary, fontSize: awardTitleFontSize, lineHeight: Math.round(awardTitleFontSize * 1.18) },
              getTextStyle(undefined, 'bodyBold', 'center'),
            ]}
            numberOfLines={1}
          >
            {t('play.neitherTeam')}
          </Text>
          <Text
            style={[
              styles.segmentMeta,
              { color: colors.textSecondaryOnBackground, fontSize: awardMetaFontSize, lineHeight: Math.round(awardMetaFontSize * 1.2) },
              getTextStyle(undefined, 'body', 'center'),
            ]}
            numberOfLines={2}
          >
            {t('play.noPointsAwarded')}
          </Text>
        </Pressable>
      </View>
    );
  };

  const wagerAnswerFontSize = Math.max(12, Math.round(layoutDensity.answerFontSize * 1.25));
  const wagerAnswerLineHeight = Math.max(16, Math.round(layoutDensity.answerLineHeight * 1.25));
  const answerTextBlockWager = (
    <>
      {currentQuestion.answerImageUrl ? (
        <Image
          source={{ uri: currentQuestion.answerImageUrl }}
          style={[styles.answerImage, { height: answerImageHeight }]}
          contentFit="contain"
        />
      ) : null}
      <View style={styles.answerHeaderBadge}>
        <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
        <Text
          style={[
            styles.correctAnswerKicker,
            { fontSize: Math.max(11, layoutDensity.segmentTitleSize) },
            getTextStyle(undefined, 'bodyBold', 'center'),
          ]}
          accessibilityRole="header"
        >
          {t('play.correctAnswer').toUpperCase()}
        </Text>
      </View>
      <Text
        style={[
          styles.answerText,
          {
            color: T.textPrimary,
            // Density already includes playTextScale; hard floors used to cancel TV/phone sizing.
            fontSize: wagerAnswerFontSize,
            lineHeight: wagerAnswerLineHeight,
            marginTop: layoutDensity.answerEyebrowMarginBottom,
          },
          questionTextStyle('displayBold', 'center', primaryVariant.answer),
        ]}
        maxFontSizeMultiplier={1.25}
        numberOfLines={6}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {primaryVariant.answer}
      </Text>
      {secondaryVariant ? (
        <SecondaryLanguageText
          testID="answer-secondary-answer"
          variant={secondaryVariant}
          field="answer"
          primaryFontSize={wagerAnswerFontSize}
          primaryLineHeight={wagerAnswerLineHeight}
          color={T.textPrimary}
          marginTop={SPACING.xs}
        />
      ) : null}
    </>
  );

  const combinedAnswerFontSize = Math.max(
    10,
    Math.round(layoutDensity.answerFontSize * (scrollChain ? 0.95 : 1.2) * answerCardOnlyScale)
  );
  const combinedAnswerLineHeight = Math.max(
    14,
    Math.round(layoutDensity.answerLineHeight * (scrollChain ? 0.95 : 1.2) * answerCardOnlyScale)
  );
  /** Centered “correct answer + solution” (reference: single white panel, no green chrome). */
  const answerTextBlockCombined = (
    <>
      {isTimedOut ? (
        <View
          testID="timeout-result-status"
          accessibilityRole="text"
          accessibilityLabel={`${t('play.timeUpTitle')}. ${t('play.noPointsAwarded')}`}
          style={[styles.timeoutResultStatus, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Text style={[styles.timeoutResultText, { color: colors.textOnBackground }]}>
            {t('play.timeUpTitle').toUpperCase()}
          </Text>
          <Text style={[styles.timeoutResultDivider, { color: colors.textSecondaryOnBackground }]}>·</Text>
          <Text style={[styles.timeoutResultText, { color: colors.textSecondaryOnBackground }]}>
            {t('play.noPointsAwarded').toUpperCase()}
          </Text>
        </View>
      ) : null}
      {currentQuestion.answerImageUrl ? (
        <Image
          source={{ uri: currentQuestion.answerImageUrl }}
          style={[
            styles.answerImage,
            {
              height: Math.max(72, Math.round(answerImageHeight * answerCardOnlyScale)),
              marginBottom: Math.max(
                SPACING.xs,
                Math.round(SPACING.md * combinedCardLayoutScale * answerCardOnlyScale)
              ),
            },
          ]}
          contentFit="contain"
        />
      ) : null}
      <Text
        style={[
          styles.referenceAnswerLabel,
          { color: colors.textSecondaryOnBackground },
          combinedCardLayoutScale < 1
            ? {
                fontSize: Math.max(8, Math.round(12 * combinedCardLayoutScale * answerCardOnlyScale)),
                lineHeight: Math.max(11, Math.round(16 * combinedCardLayoutScale * answerCardOnlyScale)),
              }
            : null,
        ]}
        accessibilityRole="header"
      >
        {t('play.correctAnswer').toUpperCase()}
      </Text>
      <Text
        style={[
          styles.referenceAnswerMain,
          {
            color: colors.textOnBackground,
            fontSize: combinedAnswerFontSize,
            lineHeight: combinedAnswerLineHeight,
            marginTop: Math.max(
              SPACING.xs,
              Math.round(SPACING.md * combinedCardLayoutScale * answerCardOnlyScale)
            ),
          },
          questionTextStyle('displayBold', 'center', primaryVariant.answer),
        ]}
        maxFontSizeMultiplier={1.25}
        numberOfLines={4}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {primaryVariant.answer}
      </Text>
      {secondaryVariant ? (
        <SecondaryLanguageText
          testID="answer-secondary-answer"
          variant={secondaryVariant}
          field="answer"
          primaryFontSize={combinedAnswerFontSize}
          primaryLineHeight={combinedAnswerLineHeight}
          color={colors.textOnBackground}
          marginTop={SPACING.xs}
        />
      ) : null}
    </>
  );

  const answerBody = (
    <View style={[styles.bleed, scrollChain && styles.bleedScroll]}>
      <View
        style={[
          styles.shell,
          embedded ? styles.shellEmbedded : null,
          scrollChain && styles.shellScroll,
          {
            // When embedded on the question canvas, stay transparent so cream/canvas shows through
            // (palette `background` is pure white and reads as a mismatched slab).
            backgroundColor: scrollChain ? 'transparent' : colors.background,
            paddingLeft: Math.max(SPACING.md, insets.left),
            paddingRight: Math.max(SPACING.md, insets.right),
          },
        ]}
      >
        <View
          style={[
            styles.fitBody,
            scrollChain && styles.fitBodyScroll,
            { paddingBottom: Math.max(insets.bottom, SPACING.xs) },
          ]}
        >
          <View
            style={[
              styles.pageColumn,
              scrollChain && styles.pageColumnScroll,
              scrollChain
                ? {
                    gap: pageColumnGap,
                    maxWidth: answerContentMaxWidth,
                    width: '100%' as const,
                    alignSelf: 'center' as const,
                  }
                : { gap: pageColumnGap },
            ]}
          >
            <View
              style={[
                wager ? styles.answerBlockWager : styles.answerBlockMain,
                scrollChain && (wager ? styles.answerBlockWagerScroll : styles.answerBlockMainScroll),
                !scrollChain && styles.answerBlockGap,
              ]}
            >
              {/* Question route already renders pill chrome + prompt above this panel (`scrollEmbedded`). */}
              {!scrollChain ? (
                <>
                  <View
                    style={[
                      styles.questionMetaPill,
                      darkModeFlatTop,
                      { flexDirection: rowDir, backgroundColor: colors.cardBackground },
                    ]}
                  >
                    <Text style={[styles.questionMetaText, { color: colors.textOnBackground }]}>
                      {session.teams.find((t) => t.id === session.currentTeamId)?.name.toUpperCase() ?? 'TEAM 1'}
                    </Text>
                    <View style={[styles.questionMetaDivider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.questionMetaText, { color: colors.textOnBackground }]}>
                      TOPIC: {currentQuestion.categoryName.toUpperCase()}
                    </Text>
                    <View style={[styles.questionMetaDivider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.questionMetaText, { color: colors.textOnBackground }]}>
                      Points: {currentQuestion.pointValue}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.questionPromptText,
                      { color: colors.textOnBackground },
                      questionTextStyle('displayBold', 'center', primaryVariant.prompt),
                    ]}
                  >
                    {primaryVariant.prompt}
                  </Text>
                  {secondaryVariant ? (
                    <SecondaryLanguageText
                      testID="answer-secondary-prompt"
                      variant={secondaryVariant}
                      field="prompt"
                      primaryFontSize={QUESTION_PROMPT_FONT_SIZE}
                      primaryLineHeight={QUESTION_PROMPT_LINE_HEIGHT}
                      color={colors.textOnBackground}
                    />
                  ) : null}
                </>
              ) : null}

              {wager ? (
                <View
                  style={[
                    styles.answerRevealCard,
                    darkModeFlatTop,
                    {
                      borderColor: colors.border,
                      borderWidth: layoutDensity.borderWidth,
                      borderRadius: cardRadiusScaled,
                      backgroundColor: colors.cardBackground,
                      shadowColor: colors.primary,
                      paddingVertical: layoutDensity.answerCardPadV * 1.5,
                      paddingHorizontal: layoutDensity.answerCardPadH,
                    },
                    !scrollChain
                      ? { flex: 1, minHeight: 0, justifyContent: 'center' as const }
                      : null,
                  ]}
                >
                  <View style={[styles.answerAccentStrip, { backgroundColor: COLORS.success }]} />
                  {answerTextBlockWager}
                </View>
              ) : (
                <View style={[styles.answerCardAndScoringColumn, { gap: sectionGap }]}>
                  <View
                    style={[
                      styles.combinedAnswerScoringCard,
                      darkModeFlatTop,
                      {
                        backgroundColor: colors.cardBackground,
                        borderRadius: Math.max(
                          14,
                          Math.round(cardRadiusScaled * combinedCardLayoutScale * answerCardOnlyScale)
                        ),
                      },
                      !scrollChain
                        ? { flex: 1, minHeight: 0, justifyContent: 'center' as const }
                        : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.answerCardTop,
                        {
                          paddingVertical: Math.max(
                            6,
                            Math.round(
                              Math.max(SPACING.md, layoutDensity.answerCardPadV * 1.1) *
                                combinedCardLayoutScale *
                                answerCardOnlyScale
                            )
                          ),
                          paddingHorizontal: Math.max(
                            6,
                            Math.round(
                              layoutDensity.answerCardPadH * combinedCardLayoutScale * answerCardOnlyScale
                            )
                          ),
                        },
                      ]}
                    >
                      {answerTextBlockCombined}
                    </View>
                  </View>
                  {!isTimedOut && (session.phase === 'scoring' || (session.phase === 'answerLock' && !session.reviewingUsedQuestion)) ? (
                  <View
                    style={[
                      styles.scoringSectionPlain,
                      {
                        paddingHorizontal: Math.max(
                          8,
                          Math.round(layoutDensity.answerCardPadH * combinedCardLayoutScale)
                        ),
                        paddingBottom: Math.max(
                          SPACING.xs,
                          Math.round(
                            SPACING.lg * (0.75 + 0.25 * answerViewportScale) * combinedCardLayoutScale
                          )
                        ),
                      },
                    ]}
                  >
                    {session.phase !== 'scoring' ? (
                      <Text
                        style={[
                          styles.whoGetsPointsHeading,
                          {
                            color: colors.textOnBackground,
                            fontSize: Math.max(
                              FONT_SIZES.xs,
                              Math.round(
                                Math.max(FONT_SIZES.sm, layoutDensity.sectionTitleSize - 1) *
                                  (scrollChain ? 0.9 : 1)
                              )
                            ),
                            marginBottom: Math.max(
                              SPACING.xs,
                              Math.round(SPACING.lg * combinedCardLayoutScale)
                            ),
                          },
                          getTextStyle(undefined, 'bodyBold', 'center'),
                        ]}
                        numberOfLines={2}
                        accessibilityRole="header"
                      >
                        {t('play.whoGetsPoints')}
                      </Text>
                    ) : null}
                    <View style={styles.scoringPanelAwardRegion}>{renderAwardTargets()}</View>
                  </View>
                  ) : null}
                </View>
              )}

              {!wager && postScoreActions && !suppressPostScoreActions ? (
                <View style={styles.postScoreRegion}>{postScoreActions}</View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (embedded) {
    return (
      <View
        style={[
          styles.embeddedRoot,
          scrollChain && styles.embeddedRootScroll,
          {
            backgroundColor: scrollChain ? 'transparent' : colors.background,
          },
        ]}
      >
        {answerBody}
        {footer ? (
          <View
            style={[
              styles.embeddedWagerFooter,
              {
                backgroundColor: scrollChain ? 'transparent' : colors.background,
                borderTopColor: colors.border,
                paddingLeft: Math.max(SPACING.md, insets.left),
                paddingRight: Math.max(SPACING.md, insets.right),
                paddingBottom: Math.max(insets.bottom, SPACING.md),
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <PlayScaffold
      title={t('play.resolveTurnTitle')}
      backgroundColor={colors.background}
      subtitle={
        hideSubtitle || !session.bonus.active ? undefined : t('play.resolveBonusSubtitle')
      }
      showHud
      session={session}
      bodyScrollEnabled={false}
      bodyFrame={false}
      bodyEdgeToEdge
      contentSafeAreaHorizontal
      onBack={confirmLeaveMatch}
      footer={footer}
    >
      {answerBody}
    </PlayScaffold>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  /** In ScrollView (`scrollEmbedded`), `flex: undefined` does not override a prior `flex: 1`; children then measure height 0 and overlap siblings that overflow. Use explicit `flex: 0` so the column sizes to its content. */
  embeddedRootScroll: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch' as const,
    width: '100%',
    minWidth: 0,
  },
  bleedScroll: {
    flex: 0,
    minWidth: 0,
  },
  shellScroll: {
    flex: 0,
  },
  fitBodyScroll: {
    flex: 0,
  },
  pageColumnScroll: {
    flex: 0,
    flexGrow: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  answerBlockMainScroll: {
    flex: 0,
    width: '100%',
  },
  answerBlockWagerScroll: {
    flex: 0,
    width: '100%',
    justifyContent: 'flex-start',
  },
  embeddedWagerFooter: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACING.sm,
  },
  bleed: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  shell: {
    flex: 1,
    minHeight: 0,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  shellEmbedded: {
    paddingTop: 0,
  },
  fitBody: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  pageColumn: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  answerBlockMain: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  answerBlockGap: {
    gap: SPACING.md,
  },
  answerBlockWager: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    justifyContent: 'center',
  },
  answerImage: {
    width: '100%',
    height: 160,
    marginBottom: SPACING.md,
  },
  questionMetaPill: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 24,
    ...PLASTIC_FACE,
    ...softSurfaceLift(),
    shadowColor: 'rgba(15, 23, 42, 0.1)',
  },
  questionMetaText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  questionMetaDivider: {
    width: 1,
    height: 16,
    marginHorizontal: SPACING.md,
  },
  questionPromptText: {
    fontSize: QUESTION_PROMPT_FONT_SIZE,
    lineHeight: QUESTION_PROMPT_LINE_HEIGHT,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  postScoreRegion: {
    flexShrink: 0,
    width: '100%',
    marginTop: SPACING.sm,
  },
  postScoreActionRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  postScorePrimaryBtn: {
    flex: 1,
    minWidth: 0,
  },
  postScoreWagerBtn: {
    flexShrink: 0,
    minWidth: 0,
  },
  /** Column: raised card (correct answer only) + plain canvas strip for “who gets points” + award tiles. */
  answerCardAndScoringColumn: {
    width: '100%',
    alignSelf: 'stretch',
  },
  /** Scoring copy + point buttons - no white card (sits on screen canvas). */
  scoringSectionPlain: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  /** Single raised card - BRAND_GUIDELINES: white surface, neumorphic lip, standard raised shadow, large radius. */
  combinedAnswerScoringCard: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SOFT_SURFACE_FACE,
    ...softSurfaceLift(),
  },
  timeoutResultStatus: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.pill,
    paddingVertical: 5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    maxWidth: '100%',
  },
  timeoutResultText: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.7,
    flexShrink: 1,
    textAlign: 'center',
  },
  timeoutResultDivider: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    lineHeight: 13,
  },
  referenceAnswerLabel: {
    ...TYPE_SCALE.labelCap,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  referenceAnswerMain: {
    textAlign: 'center',
  },
  whoGetsPointsHeading: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    maxWidth: '100%',
  },
  answerCardTop: {
    width: '100%',
  },
  /** Matches question `promptCard` - single card on page background */
  answerRevealCard: {
    position: 'relative',
    borderRadius: BORDER_RADIUS.xl,
    alignSelf: 'stretch',
    ...SOFT_SURFACE_FACE,
    ...softSurfaceLift(),
    borderWidth: 2,
    borderColor: 'rgba(0, 123, 255, 0.12)',
    overflow: 'hidden',
  },
  answerAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
  },
  answerHeaderBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: SPACING.sm,
    ...softSurfaceLift(),
    shadowColor: 'rgba(22, 163, 74, 0.35)',
  },
  correctAnswerKicker: {
    color: '#FFFFFF',
    letterSpacing: 1.2,
    textAlign: 'center',
    fontWeight: '800',
  },
  answerText: {
    textAlign: 'center',
  },
  awardRow: {
    width: '100%',
    alignItems: 'stretch',
  },
  /** Tappable score cell - same raised white control as BRAND_GUIDELINES Standard button surface (radius 14). */
  awardTile: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    ...SOFT_SURFACE_FACE,
    ...softSurfaceLift(),
  },
  /** Dashed outline per wireframe; use raised shadow, not neumorphic lip (uniform border would replace face). */
  awardNeitherTileBase: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    ...softSurfaceLift(),
  },
  awardCheckMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFB347',
  },
  scoringPanelAwardRegion: {
    width: '100%',
  },
  sectionTitle: {
    flexShrink: 0,
    textAlign: 'center',
  },
  awardStack: {
    alignSelf: 'stretch',
  },
  segmentTitle: {
    fontFamily: FONTS.uiBold,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentMeta: {
    fontFamily: FONTS.ui,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  footerRow: {
    alignItems: 'stretch',
  },
  footerBtn: {
    flex: 1,
    minWidth: 0,
  },
  softUiBtn: {
    width: '100%',
    borderRadius: BORDER_RADIUS.button,
    ...PLASTIC_FACE,
    ...neumorphicLift('rgba(15, 23, 42, 0.14)', 'pill'),
  },
  softUiBtnText: {
    fontFamily: FONTS.displayBold,
    letterSpacing: 2,
    fontSize: 14,
  },
});

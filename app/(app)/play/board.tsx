import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, useWindowDimensions, Platform, type LayoutChangeEvent } from 'react-native';
import { showThemedAlert } from '@/store/themedAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Pressable } from '@/components/ui/Pressable';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { BORDER_RADIUS, BREAKPOINTS, COLORS, FONT_SIZES, LAYOUT, SPACING } from '@/constants';
import { SHOW_HOT_SEAT_UI } from '@/constants/featureFlags';
import { FONTS } from '@/constants/theme';
import {
  getCategoryPictureSource,
  MISSING_CATEGORY_PICTURE_LABEL,
} from '@/constants/categoryPictures';
import {
  computeBoardVerticalLayout,
  getBoardBodyHeight,
  getBoardContentMaxWidth,
  getBoardPointTileBox,
  getBoardRailWidth,
  getBoardTopicCellBox,
  getBoardTopicGridAlignment,
} from '@/features/play/boardLayout';
import { getRandomRemainingQuestion } from '@/features/play/data';
import {
  RANDOM_FLASH_GREEN,
  RANDOM_FLASH_GREEN_TEXT,
  RANDOM_FLASH_OFF_MS,
  RANDOM_FLASH_ON_MS,
  buildRandomFlashSequence,
  type RandomPickMode,
} from '@/features/play/randomQuestionFlash';
import type { GameConfig, LifelineId, QuestionCard } from '@/features/shared';
import { PlayMatchMenuModal } from '@/features/play/components/PlayMatchMenuModal';
import { PlayMatchTopBar } from '@/features/play/components/PlayMatchTopBar';
import { PlayScaffold } from '@/features/play/components/PlayScaffold';
import { WagerInfoModal } from '@/features/play/components/WagerInfoModal';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { StudioReveal } from '@/components/studio/StudioReveal';
import { SOFT_SURFACE_FACE, softSurfaceLift } from '@/features/play/styles/softSurface';
import { hapticSuccess, hapticTick } from '@/lib/haptics';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop, useTheme } from '@/lib/hooks/useTheme';
import { usePlayStore } from '@/store/play';
import { abandonGameEntry } from '@/lib/wallet/gameEntry';
import { HOME_SOFT_UI } from '@/themes';
import { scaleFont, useResponsivePlayFontSizes } from '@/utils/responsiveTypography';
import { usePlayTextScale } from '@/store/display';

const T = HOME_SOFT_UI;
/** Category card width / height. Kept fixed so scale-up never stretches the design. */
const CATEGORY_CARD_ASPECT_RATIO = 1.62;

/** Topic art is a portrait tile: same width as the layout cap, extra height for the illustration.
 * Dynamic ratio - tighter on small screens to prevent clipping in native landscape. */
function getTopicArtHeightRatio(screenHeight: number): number {
  if (screenHeight < 420) return 0.98;
  if (screenHeight < 560) return 1.06;
  return 1.18;
}

export function getWebCategoryTitleFontSize(
  title: string,
  width: number,
  maximum: number
): number {
  const characters = Math.max(1, [...title.trim()].length);
  return Math.max(
    8,
    Math.min(maximum, Math.floor((Math.max(1, width) - 4) / (characters * 0.68)))
  );
}

interface BoardRow {
  pointValue: number;
  left: QuestionCard;
  right: QuestionCard;
}

type CategoryColumn = {
  categoryId: string;
  categoryName: string;
  rows: BoardRow[];
};

function groupBoardTrivia(session: NonNullable<ReturnType<typeof usePlayStore.getState>['session']>): {
  categoryId: string;
  categoryName: string;
  rows: BoardRow[];
}[] {
  const cols = new Map<
    string,
    {
      categoryName: string;
      cells: Map<number, { left?: QuestionCard; right?: QuestionCard }>;
    }
  >();

  for (const q of session.board) {
    let col = cols.get(q.categoryId);
    if (!col) {
      col = { categoryName: q.categoryName, cells: new Map() };
      cols.set(q.categoryId, col);
    }
    const slot = col.cells.get(q.pointValue) ?? {};
    if (q.boardSide === 'left') slot.left = q;
    else if (q.boardSide === 'right') slot.right = q;
    else {
      if (!slot.left) slot.left = q;
      else slot.right = q;
    }
    col.cells.set(q.pointValue, slot);
  }

  return Array.from(cols.entries()).map(([categoryId, { categoryName, cells }]) => {
    const rows: BoardRow[] = Array.from(cells.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pointValue, sides]) => {
        const left = sides.left ?? sides.right!;
        const right = sides.right ?? sides.left!;
        return { pointValue, left, right };
      });
    return { categoryId, categoryName, rows };
  });
}

function chunkColumns<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

function getGridColumnCount(mode: string, categoryCount: number): number {
  if (mode === 'quickPlay' && categoryCount === 4) return 2;
  if (categoryCount <= 2) return Math.max(1, categoryCount);
  return 3;
}

/** Keeps each topic column wide enough for rails + art + gaps - drops from 3→2→1 cols on narrow widths. */
function clampGridColumns(
  preferredCols: number,
  innerWidth: number,
  gridGap: number,
  categoryCount: number
): number {
  if (categoryCount <= 0) return 1;
  const usableRow = Math.max(0, innerWidth);
  /** Minimum space per topic cell before we reduce column count - must fit long category titles without abandoning the intended 3x2 board too early. */
  const MIN_CELL = 176;
  let cols = Math.min(preferredCols, categoryCount);
  while (cols > 1) {
    const cell = (usableRow - gridGap * (cols - 1)) / cols;
    if (cell >= MIN_CELL) break;
    cols -= 1;
  }
  return Math.max(1, cols);
}

function computeTopicFit(
  innerWidth: number,
  m: BoardMetrics,
  cols: number,
  _screenWidth: number,
  maxCellWidth = Number.POSITIVE_INFINITY
): {
  cellWidth: number;
  groupWidth: number;
  topicImageSize: number;
  centerWidth: number;
  titleWidth: number;
  titleHeight: number;
  railWidth: number;
  artGap: number;
} {
  const usableRow = Math.max(0, innerWidth);
  const safeCols = Math.max(1, cols);
  // Cap by uniform scale (aspect lock). Never stretch wider than the design ratio allows.
  const cellWidth = Math.max(
    1,
    Math.min((usableRow - m.gridGap * (safeCols - 1)) / safeCols, maxCellWidth)
  );
  const cardContentWidth = Math.max(1, cellWidth - m.cardInset * 2 - 4);
  const railWidth = getBoardRailWidth(cardContentWidth);
  const artGap = cardContentWidth < 200 ? 5 : cardContentWidth < 320 ? 6 : 8;
  const horizontalChrome = railWidth * 2 + artGap * 2;
  const centerWidth = Math.max(48, Math.floor(cardContentWidth - horizontalChrome));
  const groupWidth = horizontalChrome + centerWidth;
  // Art uses the full center band so columns grow with the screen.
  const topicImageSize = Math.max(48, centerWidth);
  const titleWidth = centerWidth;
  const lineHeight = Math.round(m.topicTitleFont * 1.12);
  // Two-line budget - phone-like density; avoids a tall empty title slab under art.
  const titleHeight = Math.max(Math.round(lineHeight * 2.15), Math.round(m.topicTitleFont * 2.2));
  return { cellWidth, groupWidth, topicImageSize, centerWidth, titleWidth, titleHeight, railWidth, artGap };
}

function lifelineGlyph(id: LifelineId): keyof typeof Ionicons.glyphMap {
  switch (id) {
    case 'callAFriend':
      return 'call-outline';
    case 'discard':
      return 'shuffle-outline';
    case 'answerRewards':
      return 'bulb-outline';
    case 'rest':
      return 'moon-outline';
    default:
      return 'help-circle-outline';
  }
}

function lifelineSlotsForTeam(teamId: string, config: GameConfig): LifelineId[] {
  const bag = config.teamLifelines?.[teamId];
  if (!bag) {
    return ['callAFriend', 'discard', 'answerRewards'];
  }
  const out: LifelineId[] = [];
  const pushN = (id: LifelineId, n: number) => {
    for (let i = 0; i < n; i++) {
      if (out.length < 3) out.push(id);
    }
  };
  pushN('callAFriend', bag.callAFriend);
  pushN('discard', bag.discard);
  pushN('answerRewards', bag.answerRewards);
  pushN('rest', bag.rest ?? 0);
  const pad: LifelineId[] = ['callAFriend', 'discard', 'answerRewards'];
  let p = 0;
  while (out.length < 3) {
    out.push(pad[p % pad.length]);
    p++;
  }
  return out.slice(0, 3);
}

/** Blocky plastic shadow tier - solid charcoal-tinted depth. */
function neumorphicLift3D(
  _tier: 'card' | 'pill' | 'tile' | 'header' | 'score'
): any {
  return softSurfaceLift();
}



const PLASTIC_FACE = {
    ...SOFT_SURFACE_FACE,
};

type BoardMetrics = {
  gridGap: number;
  cellBorder: number;
  innerGap: number;
  tileFont: number;
  titleOnImage: number;
  scoreFont: number;
  lifelineIcon: number;
  lifelineIconBox: number;
  /** Square topic illustration - rails align to this height cluster (title sits below). */
  topicImageSize: number;
  /** Horizontal gap between point rail and central image. */
  topicArtGap: number;
  /** Vertical gap between stacked point pills. */
  pointRailGap: number;
  /** Bottom inset so brand raised-tile shadow (y=4) is not clipped by parent overflow. */
  pointRailClipBleed: number;
  topicTitleFont: number;
  cardInset: number;
};

function getBoardMetrics(screenHeight: number, screenWidth: number): BoardMetrics {
  const micro = screenHeight < 400 || screenWidth < 520;
  const compact = screenHeight < 560;
  const tight = screenHeight < 450;
  const roomy = screenHeight >= 680 && screenWidth >= 900;
  const tall = screenHeight >= 820 && screenWidth >= 1000;
  return {
    gridGap: tight ? 8 : micro ? 10 : compact ? 14 : tall ? 30 : roomy ? 26 : 20,
    cellBorder: micro ? 1 : 2,
    innerGap: tight ? 2 : micro ? 2 : compact ? 6 : 10,
    tileFont: tight ? 11 : micro ? 12 : compact ? 14 : roomy ? 18 : 16,
    titleOnImage: tight ? 6 : micro ? 8 : compact ? 9 : 11,
    scoreFont: tight ? 13 : micro ? 14 : compact ? 16 : roomy ? 20 : 18,
    lifelineIcon: tight ? 9 : micro ? 10 : compact ? 12 : 14,
    lifelineIconBox: tight ? 16 : micro ? 18 : compact ? 20 : 24,
    topicImageSize: tight ? 86 : micro ? 96 : compact ? 118 : tall ? 184 : roomy ? 166 : 148,
    topicArtGap: tight ? 5 : micro ? 6 : compact ? 10 : roomy ? 16 : 14,
    pointRailGap: tight ? 5 : micro ? 6 : compact ? 10 : roomy ? 14 : 12,
    pointRailClipBleed: 0,
    topicTitleFont: tight ? 11 : micro ? 11 : compact ? 13 : roomy ? 16 : 14,
    cardInset: tight ? 5 : micro ? 6 : compact ? 7 : 9,
  };
}

type BoardRandomPick = {
  mode: RandomPickMode;
  question: QuestionCard;
  phase: 'flashing' | 'locked';
  flashingId: string | null;
};

export default function PlayBoardScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const darkModeFlatTop = useDarkModeFlatTop();
  const { getTextStyle, t } = useI18n();
  const session = usePlayStore((state) => state.session);
  const selectQuestion = usePlayStore((state) => state.selectQuestion);
  const reviewBoardQuestion = usePlayStore((state) => state.reviewBoardQuestion);
  const confirmRandomWagerQuestion = usePlayStore((state) => state.confirmRandomWagerQuestion);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [randomPick, setRandomPick] = useState<BoardRandomPick | null>(null);
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [wagerInfoOpen, setWagerInfoOpen] = useState(false);
  const [hotSeatInfoOpen, setHotSeatInfoOpen] = useState(false);
  const [gridViewport, setGridViewport] = useState({ width: 0, height: 0 });

  // Notch detection retained for layout; blank side currently unused after board simplification.
  useEffect(() => {
    if (session?.step === 'question') {
      router.replace('/play/question');
    } else if (session?.step === 'end') {
      router.replace('/play/end');
    }
  }, [router, session]);

  const showWagerSelector = Boolean(session?.wager && !session.wager.question);
  const remainingQuestions = useMemo(
    () => session?.board.filter((question) => !session.usedQuestionIds.has(question.id) && !question.used) ?? [],
    [session]
  );
  const remainingQuestionCount = remainingQuestions.length;
  const showRandomSelector = session?.mode === 'random' && !showWagerSelector && remainingQuestionCount > 0;
  const usedQuestionKey = useMemo(
    () => (session ? Array.from(session.usedQuestionIds).sort().join('|') : ''),
    [session]
  );

  const openLockedRandomPick = useCallback(() => {
    if (!randomPick || randomPick.phase !== 'locked') return;
    if (randomPick.mode === 'wager') {
      confirmRandomWagerQuestion(randomPick.question);
    } else {
      selectQuestion(randomPick.question);
    }
    router.replace('/play/question');
  }, [confirmRandomWagerQuestion, randomPick, router, selectQuestion]);

  // Random mode + wager: pre-draw a remaining question, flash available tiles, then lock the winner.
  useEffect(() => {
    if (!session || session.step !== 'board') {
      setRandomPick(null);
      return;
    }

    const mode: RandomPickMode | null = showWagerSelector
      ? 'wager'
      : showRandomSelector
        ? 'random'
        : null;
    if (!mode) {
      setRandomPick(null);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const question = getRandomRemainingQuestion(session.board, session.usedQuestionIds, {
      teamId: session.mode === 'random' ? session.currentTeamId : undefined,
    });
    if (!question) {
      setRandomPick(null);
      if (mode === 'wager') {
        confirmRandomWagerQuestion();
      }
      return;
    }

    const remainingIds = session.board
      .filter((entry) => !session.usedQuestionIds.has(entry.id) && !entry.used)
      .map((entry) => entry.id);

    setRandomPick({ mode, question, phase: 'flashing', flashingId: null });

    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) {
          setRandomPick({ mode, question, phase: 'locked', flashingId: null });
          hapticSuccess();
          return;
        }

        const sequence = buildRandomFlashSequence(remainingIds, question.id);
        let step = 0;

        const finish = () => {
          if (cancelled) return;
          setRandomPick({ mode, question, phase: 'locked', flashingId: null });
          hapticSuccess();
        };

        const flashNext = () => {
          if (cancelled) return;
          if (step >= sequence.length) {
            finish();
            return;
          }
          const flashId = sequence[step]!;
          const isLast = step === sequence.length - 1;
          step += 1;
          setRandomPick({ mode, question, phase: 'flashing', flashingId: flashId });
          hapticTick();
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              if (isLast) {
                finish();
                return;
              }
              setRandomPick({ mode, question, phase: 'flashing', flashingId: null });
              timers.push(setTimeout(flashNext, RANDOM_FLASH_OFF_MS));
            }, RANDOM_FLASH_ON_MS)
          );
        };

        flashNext();
      });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [
    confirmRandomWagerQuestion,
    session,
    showRandomSelector,
    showWagerSelector,
    usedQuestionKey,
  ]);

  const grouped = useMemo(() => (session ? groupBoardTrivia(session) : []), [session]);
  const responsiveFontSizes = useResponsivePlayFontSizes();
  const playTextScale = usePlayTextScale();
  const isWebBoard = Platform.OS === 'web' && width >= BREAKPOINTS.wide;
  const metrics = useMemo(() => {
    const baseMetrics = getBoardMetrics(height, width);
    // Wide web: denser gaps so larger cards still fit edge-to-edge.
    const webDense = isWebBoard
      ? {
          gridGap: Math.min(baseMetrics.gridGap, 16),
          topicArtGap: Math.min(baseMetrics.topicArtGap, 12),
          pointRailGap: Math.min(baseMetrics.pointRailGap, 12),
          pointRailClipBleed: Math.min(baseMetrics.pointRailClipBleed, 6),
        }
      : null;
    const topicTitleFont = Math.round((isWebBoard
      ? scaleFont(18, 15, 28, width, height)
      : scaleFont(20, 18, 28, width, height)) * playTextScale);
    return {
      ...baseMetrics,
      ...webDense,
      // Cap high enough that tile-side * 0.42 is the real limit on large screens.
      tileFont: Math.round(scaleFont(16, 13, 40, width, height) * playTextScale),
      topicTitleFont,
      scoreFont: responsiveFontSizes.scoreValue,
    };
  }, [height, isWebBoard, playTextScale, responsiveFontSizes.scoreValue, width]);
  const topicArtHeightRatio = useMemo(() => getTopicArtHeightRatio(height), [height]);
  // Near full-bleed board width so aspect-locked cards can scale up with the viewport.
  // Topic-select padding is intentionally not reused here (it caps ~5x320 and leaves dead cream).
  const bodyPadLeft = Math.max(insets.left, LAYOUT.screenGutter);
  const bodyPadRight = Math.max(insets.right, LAYOUT.screenGutter);
  const padX = bodyPadLeft + bodyPadRight;
  const innerWidth = Math.max(0, width - padX);
  const centeredContentMaxWidth = getBoardContentMaxWidth({
    platform: Platform.OS,
    windowWidth: width,
    innerWidth,
    wideBreakpoint: BREAKPOINTS.wide,
    playMaxWidth: LAYOUT.playMaxWidth,
    playWideMaxWidth: LAYOUT.playWideMaxWidth,
  });
  const boardLayoutWidth = Math.max(0, Math.min(innerWidth, centeredContentMaxWidth));
  const preferredGridCols = useMemo(
    () => getGridColumnCount(session?.mode ?? 'classic', grouped.length),
    [session?.mode, grouped.length]
  );
  const gridColumnCount = useMemo(() => {
    if (grouped.length === 0) return preferredGridCols;
    if (isWebBoard && grouped.length >= 6) {
      return Math.min(3, grouped.length);
    }
    return clampGridColumns(preferredGridCols, boardLayoutWidth, metrics.gridGap, grouped.length);
  }, [preferredGridCols, boardLayoutWidth, isWebBoard, metrics.gridGap, grouped.length]);
  const gridRows = useMemo(() => chunkColumns(grouped, gridColumnCount), [grouped, gridColumnCount]);
  // Equal cream above first topic row and below last row (header chrome uses the same value).
  // SafeAreaView already clears the home indicator. Do not re-add bottomInset here.
  const gridEdgePadding = SPACING.md;
  const gridTopPadding = gridEdgePadding;
  const gridBottomPadding = gridEdgePadding;
  /**
   * Fixed body height under the match header. Prefer window math over onLayout:
   * the edge-to-edge scaffold often measures content height only, which zeros out
   * free-space centering and leaves 3-topic boards stuck under the header.
   * Reserve must match real chrome: equal edge pad + score pill row (not question-screen ~108).
   */
  const matchHeaderReserve = gridEdgePadding + (height < 420 ? 52 : 64);
  const boardBodyHeight = getBoardBodyHeight({
    windowHeight: height,
    bottomInset: Math.max(insets.bottom, 0),
    headerReserve: matchHeaderReserve,
  });
  /** Use the scaffold's actual body height when it is smaller than the window estimate. */
  const layoutViewportHeight = gridViewport.height || boardBodyHeight;
  const gridRowCount = Math.max(1, gridRows.length);
  // Uniform scale-to-fit: largest card at fixed aspect that still fits the grid.
  // Width and height move together so the design never stretches.
  const topicRowGap = metrics.gridGap;
  const availableGridWidth = Math.max(0, boardLayoutWidth);
  const availableGridHeight = Math.max(
    1,
    layoutViewportHeight - gridTopPadding - gridBottomPadding
  );
  const maxCellWidthByRow =
    (availableGridWidth - metrics.gridGap * Math.max(0, gridColumnCount - 1)) /
    Math.max(1, gridColumnCount);
  const maxCellHeightByColumn =
    (availableGridHeight - topicRowGap * Math.max(0, gridRowCount - 1)) / gridRowCount;
  const scaledCellWidth = Math.max(
    1,
    Math.min(maxCellWidthByRow, maxCellHeightByColumn * CATEGORY_CARD_ASPECT_RATIO)
  );
  const fittedBoardRowHeight = scaledCellWidth / CATEGORY_CARD_ASPECT_RATIO;
  const topicFit = useMemo(
    () => computeTopicFit(boardLayoutWidth, metrics, gridColumnCount, width, scaledCellWidth),
    [boardLayoutWidth, gridColumnCount, metrics, scaledCellWidth, width]
  );
  // Card padding/border stay inside each cell.
  const cardVerticalChrome = metrics.cardInset * 2 + 8;
  const gridVerticalPadding =
    gridTopPadding + gridBottomPadding + cardVerticalChrome * gridRowCount;
  const maxQuestionRows = Math.max(1, ...grouped.map((column) => column.rows.length));
  /** Matches topicCenterBlock gap so pill rail targets image + title stack. */
  const topicCenterBlockGap = 2;
  // Lock inner content to the same aspect box so art/rails scale with the card, not stretch past it.
  const maxRowContentHeight = Math.max(1, fittedBoardRowHeight - cardVerticalChrome);
  const verticalLayout = useMemo(
    () =>
      computeBoardVerticalLayout({
        viewportHeight: layoutViewportHeight,
        gridVerticalPadding,
        gridRowCount,
        maxQuestionRows,
        baseGridGap: metrics.gridGap,
        pointRailGap: metrics.pointRailGap,
        pointRailClipBleed: metrics.pointRailClipBleed,
        topicImageSize: topicFit.topicImageSize,
        topicArtHeightRatio,
        titleHeightBudget: topicFit.titleHeight,
        centerBlockGap: topicCenterBlockGap,
        maxRowContentHeight,
      }),
    [
      layoutViewportHeight,
      gridVerticalPadding,
      maxRowContentHeight,
      gridRowCount,
      maxQuestionRows,
      metrics.gridGap,
      metrics.pointRailClipBleed,
      metrics.pointRailGap,
      topicArtHeightRatio,
      topicCenterBlockGap,
      topicFit.titleHeight,
      topicFit.topicImageSize,
    ]
  );
  // Always Y-center leftover cream after uniform scale-to-fit (avoids a dead bottom band).
  const topicGridAlignment = {
    ...getBoardTopicGridAlignment({ gridRowCount: gridRows.length }),
    contentJustifyContent: 'center' as const,
  };
  const topicCellBox = getBoardTopicCellBox(topicFit.cellWidth, fittedBoardRowHeight);
  /** 100/200/300 control box. Full rail width, height from vertical fill. */
  const pointTileBox = getBoardPointTileBox({
    pillHeight: verticalLayout.pointPillHeight,
    railWidth: topicFit.railWidth,
    squareTiles: false,
  });
  const pointTileWidth = pointTileBox.width;
  const pointTileHeight = pointTileBox.height;
  const pointRailWidth = pointTileBox.railWidth;
  /** Art fills the cell center so columns scale with the window. */
  const topicArtWidth = Math.max(48, topicFit.centerWidth);
  const topicGroupWidth = 2 * (pointRailWidth + topicFit.artGap) + topicArtWidth;
  const topicTitleWidth = Math.min(topicFit.titleWidth, Math.max(topicArtWidth, 120));
  /** Squircle corners (~14pt), never height/2 (that makes a pill). */
  const pointTileRadius = Math.min(
    14,
    Math.max(8, Math.round(Math.min(pointTileWidth, pointTileHeight) * 0.18))
  );
  const handleGridLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setGridViewport((current) =>
      current.width === nextWidth && current.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight }
    );
  };

  const refundEntryMutation = useMutation(api.wallet.refundEntry);

  // Completed match being reviewed from the end screen: back returns to the
  // winner screen instead of the abandon-match flow.
  const matchComplete = remainingQuestionCount === 0;

  const leaveMatch = () => {
    if (matchComplete) {
      usePlayStore.getState().returnToEndScreen();
      router.replace('/play/end');
      return;
    }
    const performLeave = async () => {
      await abandonGameEntry(refundEntryMutation, {
        reservationId: usePlayStore.getState().entryReservationId,
        reason: 'user_abandoned',
        resetSession: () => usePlayStore.getState().resetSession(),
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

  const openMatchMenu = () => setMatchMenuOpen(true);
  const closeMatchMenu = () => setMatchMenuOpen(false);
  const openSettingsFromMenu = () => {
    setMatchMenuOpen(false);
    router.push('/(app)/settings');
  };
  const exitGameFromMenu = () => {
    setMatchMenuOpen(false);
    leaveMatch();
  };

  if (!session) {
    return <PlayScaffold title={t('common.loading')}><Text>{t('common.loading')}</Text></PlayScaffold>;
  }

  const activeTeam =
    activeTeamId == null ? undefined : session.teams.find((team) => team.id === activeTeamId);

  const wager = session.wager;
  const surfaceColors = getPlaySurfaceColors();

  const renderTile = (column: CategoryColumn, question: QuestionCard) => {
    const used = session.usedQuestionIds.has(question.id) || question.used;
    const isFlashing = randomPick?.phase === 'flashing' && randomPick.flashingId === question.id;
    const isLocked = randomPick?.phase === 'locked' && randomPick.question.id === question.id;
    const isGreenHighlight = isFlashing || isLocked;
    const randomPickActive = Boolean(randomPick);
    return (
      <Pressable
        testID={isLocked ? 'board-random-pick-locked' : isFlashing ? 'board-random-pick-flashing' : undefined}
        style={({ pressed }) => [
          styles.topicPointTile,
          {
            backgroundColor: isGreenHighlight
              ? RANDOM_FLASH_GREEN
              : used
                ? surfaceColors.boardSpentBackground
                : surfaceColors.boardTileBackground,
            borderColor: surfaceColors.boardTileBorder,
            borderWidth: used ? 0 : 1,
            width: pointTileWidth,
            height: pointTileHeight,
            minHeight: 0,
            minWidth: 0,
            borderRadius: pointTileRadius,
            paddingVertical: 0,
            paddingHorizontal: 0,
            opacity: pressed && !randomPickActive ? 0.9 : 1,
            transform: pressed && !randomPickActive ? [{ scale: 0.97 }] : [{ scale: 1 }],
          },
          isLocked && styles.topicPointTileLocked,
        ]}
        onPress={() => {
          if (used) {
            if (randomPickActive) return;
            reviewBoardQuestion(question);
            router.replace('/play/question');
            return;
          }
          if (randomPick) {
            if (randomPick.phase === 'locked' && randomPick.question.id === question.id) {
              openLockedRandomPick();
            }
            return;
          }
          selectQuestion(question);
          router.replace('/play/question');
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: randomPickActive && !isLocked, selected: isLocked }}
        accessibilityLabel={
          isLocked
            ? `Selected ${question.pointValue} point question`
            : used
              ? `Review ${question.pointValue} point question`
              : `${question.pointValue} points`
        }
      >
        <Text
          style={[
            styles.topicPointTileText,
            {
              fontSize: Math.min(
                metrics.tileFont,
                Math.max(6, Math.min(pointTileWidth, pointTileHeight) * 0.42)
              ),
              lineHeight: Math.round(
                Math.min(
                  metrics.tileFont,
                  Math.max(6, Math.min(pointTileWidth, pointTileHeight) * 0.42)
                ) * 1.1
              ),
              color: isGreenHighlight
                ? RANDOM_FLASH_GREEN_TEXT
                : used
                  ? surfaceColors.boardSpentText
                  : surfaceColors.boardTileText,
              opacity: used && !isGreenHighlight ? 0.4 : 1,
            },
            Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          ellipsizeMode="clip"
        >
          {question.pointValue}
        </Text>
      </Pressable>
    );
  };

  const categoryCell = (column: (typeof grouped)[0]) => {
    const picture = getCategoryPictureSource(column.categoryId);
    const surfaceColors = getPlaySurfaceColors();
    const textPrimary = surfaceColors.textPrimary;
    // Same image/title heights the pill rail is sized against.
    const titleHeight = verticalLayout.topicTitleHeight;
    const imgH = Math.max(1, Math.round(verticalLayout.topicImageHeight));
    const imgW = Math.max(1, topicArtWidth);
    const artSide = Math.min(imgW, imgH);
    // Native shrinks within two lines. React Native Web does not reliably honor
    // adjustsFontSizeToFit, so web gets a conservative one-line size estimate.
    const maximumTitleFontSize = Math.min(
      metrics.topicTitleFont,
      Math.max(11, Math.floor(titleHeight / 2.35))
    );
    const titleFontSize =
      Platform.OS === 'web'
        ? getWebCategoryTitleFontSize(column.categoryName, topicTitleWidth, maximumTitleFontSize)
        : maximumTitleFontSize;

    const railHeight = imgH + topicCenterBlockGap + titleHeight;

    return (
      <View key={column.categoryId} style={[styles.categoryGridCell, topicCellBox]}>
        <StudioReveal delay={70 * Math.max(0, grouped.indexOf(column))} duration={420} rise={12} from={0.96}>
        <View
          testID={`board-category-card-${column.categoryId}`}
          style={[
            styles.categoryBlock,
            {
              width: topicFit.cellWidth,
              height: fittedBoardRowHeight,
              padding: metrics.cardInset,
              backgroundColor: surfaceColors.boardCardBackground,
              borderColor: surfaceColors.boardFrameBorder,
              shadowOpacity: surfaceColors.isDark ? 0.4 : 0.06,
              shadowRadius: surfaceColors.isDark ? 40 : 35,
              elevation: surfaceColors.isDark ? 8 : 4,
            },
          ]}
        >
          <View style={[styles.topicArtRow, { width: topicGroupWidth, columnGap: topicFit.artGap }]}>
          <View
            style={[
              styles.topicPointRail,
              {
                width: pointRailWidth,
                gap: metrics.pointRailGap,
                paddingBottom: metrics.pointRailClipBleed,
                // Rail height = image + gap + title so 3 tiles fill that stack.
                height: railHeight,
              },
            ]}
          >
            {column.rows.map((row) => (
              <View key={`L-${row.pointValue}`}>{renderTile(column, row.left)}</View>
            ))}
          </View>

          <View
            style={[
              styles.topicCenterBlock,
              {
                width: topicArtWidth,
                gap: topicCenterBlockGap,
                backgroundColor: surfaceColors.boardInnerFrame,
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.topicImageFrame,
                height < 420 && styles.topicImageFrameTight,
                {
                  width: imgW,
                  height: imgH,
                  backgroundColor: surfaceColors.boardInnerFrame,
                  opacity: pressed ? 0.96 : 1,
                  transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
                },
              ]}
              onPress={() => {
                if (randomPick) {
                  if (randomPick.phase !== 'locked') return;
                  const hasLocked = column.rows.some(
                    (row) =>
                      row.left.id === randomPick.question.id || row.right.id === randomPick.question.id
                  );
                  if (hasLocked) {
                    openLockedRandomPick();
                  }
                  return;
                }
                const next = column.rows
                  .flatMap((row) => [row.left, row.right])
                  .find((candidate) => !session.usedQuestionIds.has(candidate.id) && !candidate.used);
                if (!next) {
                  const usedQuestion = column.rows
                    .flatMap((row) => [row.left, row.right])
                    .find((candidate) => session.usedQuestionIds.has(candidate.id) || candidate.used);
                  if (usedQuestion) {
                    reviewBoardQuestion(usedQuestion);
                    router.replace('/play/question');
                  }
                  return;
                }
                selectQuestion(next);
                router.replace('/play/question');
              }}
              accessibilityRole="button"
              accessibilityLabel={column.categoryName}
            >
              <View
                style={[
                  styles.topicImageInner,
                  { paddingHorizontal: 0, paddingVertical: 0 },
                ]}
              >
                {picture ? (
                  <Image
                    source={picture}
                    style={{ width: artSide, height: artSide }}
                    contentFit={surfaceColors.topicImageContentFit}
                    cachePolicy="memory-disk"
                    loading="lazy"
                    transition={120}
                  />
                ) : (
                  <View style={styles.pictureFallbackFill}>
                    <Text
                      style={[
                        styles.missingPictureLabel,
                        { color: surfaceColors.missingPictureLabelColor },
                      ]}
                      accessibilityLabel={MISSING_CATEGORY_PICTURE_LABEL}
                    >
                      {MISSING_CATEGORY_PICTURE_LABEL}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View
              style={[
                styles.topicTitleRow,
                { width: topicTitleWidth, height: titleHeight },
              ]}
            >
              <Text
                style={[
                  styles.topicTitleText,
                  {
                    color: textPrimary,
                    fontSize: titleFontSize,
                    // Omit fixed lineHeight so adjustsFontSizeToFit can scale cleanly.
                  },
                  Platform.OS === 'web'
                    ? ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as any)
                    : null,
                ]}
                numberOfLines={Platform.OS === 'web' ? 1 : 2}
                adjustsFontSizeToFit
                minimumFontScale={0.35}
                ellipsizeMode="clip"
              >
                {column.categoryName.toUpperCase()}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.topicPointRail,
              {
                width: pointRailWidth,
                gap: metrics.pointRailGap,
                paddingBottom: metrics.pointRailClipBleed,
                height: railHeight,
              },
            ]}
          >
            {column.rows.map((row) => (
              <View key={`R-${row.pointValue}`}>{renderTile(column, row.right)}</View>
            ))}
          </View>
          </View>
        </View>
        </StudioReveal>
      </View>
    );
  };

  const boardHeader = (
    <View style={[styles.headerCenterWrap, { width: boardLayoutWidth, maxWidth: centeredContentMaxWidth }]}>
      <PlayMatchTopBar
        session={session}
        onLogoPress={openMatchMenu}
        onWagerInfoPress={session.config.wagerEnabled ? () => setWagerInfoOpen(true) : undefined}
        onHotSeatInfoPress={SHOW_HOT_SEAT_UI ? () => setHotSeatInfoOpen(true) : undefined}
        showTeamScores={false}
        scorePillsNextToLogo
      />
    </View>
  );

  return (
    <View style={[styles.rootContainer, { backgroundColor: surfaceColors.boardCanvas }]}>
      {/* Immersive match board: hide system status bar (time / battery / icons) to free vertical space. */}
      <StatusBar hidden />
      <PlayScaffold
        title={t('play.questionBoardTitle')}
        backgroundColor={surfaceColors.boardCanvas}
        customHeader={boardHeader}
        onBack={leaveMatch}
        showHud={false}
        session={session}
        footer={null}
        footerBare
        footerDense
        footerAboveBody
        bodyScrollEnabled={false}
        bodyFrame={false}
        bodyEdgeToEdge
        contentSafeAreaHorizontal={false}
        /** Top edge skipped while status bar is hidden; keep bottom for home-indicator clearance. */
        safeAreaEdges={['bottom']}
        chromeColumnStyle={{
          // Match grid edge pad. Do not use question-screen chromeTopPad (~24 web).
          paddingTop: gridEdgePadding,
          paddingBottom: 0,
        }}
      >
        {wager && !showWagerSelector ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: `${colors.secondary}15`,
                borderColor: `${colors.secondary}40`,
                paddingVertical: SPACING.sm,
                paddingLeft: bodyPadLeft + SPACING.md,
                paddingRight: bodyPadRight + SPACING.md,
                borderWidth: 1,
              },
            ]}
          >
            <Text style={[styles.bannerTitle, { color: colors.text }, getTextStyle(undefined, 'bodyBold', 'start')]}>
              {t('play.wagerModeTitle')}
            </Text>
            <Text style={[styles.bannerCopy, { color: colors.textSecondary }, getTextStyle()]} numberOfLines={2}>
              {t('play.wagerModeBody', {
                wageringTeam:
                  session.teams.find((team) => team.id === wager.wageringTeamId)?.name ?? t('common.teamOne'),
                targetTeam:
                  session.teams.find((team) => team.id === wager.targetTeamId)?.name ?? t('common.teamTwo'),
              })}
            </Text>
          </View>
        ) : null}

        <View
          testID="board-topic-grid"
          onLayout={handleGridLayout}
          style={[
            styles.gridScroll,
            {
              backgroundColor: surfaceColors.boardCanvas,
              // Give Android a definite body height so the topic block can center reliably.
              flexGrow: 0,
              flexShrink: 1,
              height: boardBodyHeight,
              paddingLeft: bodyPadLeft,
              paddingRight: bodyPadRight,
              paddingTop: gridTopPadding,
              paddingBottom: gridBottomPadding,
              justifyContent: topicGridAlignment.contentJustifyContent,
            },
          ]}
        >
          <View
            style={[
              styles.boardCenterContainer,
              {
                width: boardLayoutWidth,
                maxWidth: centeredContentMaxWidth,
                gap: topicRowGap,
              },
            ]}
          >
            {gridRows.map((row, ri) => (
              <View
                key={`row-${ri}`}
                style={[
                  styles.gridRow,
                  {
                    gap: metrics.gridGap,
                    height: fittedBoardRowHeight,
                    justifyContent: topicGridAlignment.rowJustifyContent,
                  },
                ]}
              >
                {row.map((col) => categoryCell(col))}
              </View>
            ))}
          </View>
        </View>
      </PlayScaffold>

      <PlayMatchMenuModal
        visible={matchMenuOpen}
        onClose={closeMatchMenu}
        onSettings={openSettingsFromMenu}
        onExitGame={exitGameFromMenu}
      />

      {activeTeam ? (
        <View
          style={[
            styles.teamModalRoot,
            {
              backgroundColor: surfaceColors.isDark
                ? 'rgba(7, 17, 31, 0.55)'
                : 'rgba(240, 235, 227, 0.45)',
            },
          ]}
          accessibilityViewIsModal
        >
          <Pressable
            style={styles.teamModalBackdrop}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => setActiveTeamId(null)}
          />
          <View
            style={[
              styles.teamModalCard,
              PLASTIC_FACE,
              darkModeFlatTop,
              neumorphicLift3D('tile'),
              { backgroundColor: surfaceColors.controlBackground },
            ]}
          >
            <Text
              style={[styles.teamModalTitle, { color: surfaceColors.textPrimary }]}
              numberOfLines={1}
            >
              {activeTeam.name.toUpperCase()}
            </Text>
            <Text style={[styles.teamModalScore, { color: surfaceColors.textPrimary }]}>
              {t('common.points', { count: activeTeam.score })}
            </Text>
            <View style={styles.teamModalButtonsRow}>
              {lifelineSlotsForTeam(activeTeam.id, session.config).map((id, idx) => (
                <Pressable
                  key={`${activeTeam.id}-modal-${id}-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={id}
                  style={({ pressed }) => [
                    styles.teamModalLifelineButton,
                    {
                      backgroundColor: surfaceColors.subtleFill,
                      borderColor: surfaceColors.hairlineBorder,
                      opacity: pressed ? 0.82 : 1,
                      transform: pressed ? [{ scale: 0.96 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Ionicons name={lifelineGlyph(id)} size={22} color={surfaceColors.textPrimary} />
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setActiveTeamId(null)}
              style={({ pressed }) => [
                styles.teamModalCloseBtn,
                {
                  backgroundColor: surfaceColors.subtleFillStrong,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text style={[styles.teamModalCloseText, { color: surfaceColors.textPrimary }]}>
                {t('common.close')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <WagerInfoModal visible={wagerInfoOpen} onClose={() => setWagerInfoOpen(false)} />

      {SHOW_HOT_SEAT_UI && hotSeatInfoOpen ? (
        <View accessibilityViewIsModal style={styles.hotSeatInfoOverlay} testID="board-hot-seat-info-overlay">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setHotSeatInfoOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={[styles.hotSeatInfoCard, PLASTIC_FACE, darkModeFlatTop, neumorphicLift3D('card')]}>
            <Text
              style={[styles.modalTitle, { color: T.colors.textPrimary }, getTextStyle(undefined, 'display', 'center')]}
            >
              {t('play.hotSeatInfoTitle')}
            </Text>
            <Text style={[styles.modalBody, { color: T.colors.textMuted }, getTextStyle()]}>
              {t('play.hotSeatInfoBody')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BORDER_RADIUS.lg,
    flexShrink: 0,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  bannerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerCopy: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
  },
  headerSideBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(240, 235, 227, 0.65)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideBarLogoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideBarTokenContainer: {
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  boardHeader: {
    width: '100%',
    flexShrink: 0,
  },
  hubTopBar: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    minHeight: 40,
  },
  footerStripOuter: {
    width: '100%',
    paddingHorizontal: SPACING.md,
    marginTop: -SPACING.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  topBarTitleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubTopBarTitle: {
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    maxWidth: '42%',
  },
  hubHeaderSide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubHeaderSideStart: {
    alignItems: 'flex-start',
  },
  hubHeaderSideEnd: {
    alignItems: 'flex-end',
  },
  headerSquircleInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCard: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    paddingHorizontal: SPACING.sm,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  turnIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  scoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  scoreIdentity: {
    flex: 1,
    gap: 2,
  },
  scoreTeamName: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    letterSpacing: 1,
    opacity: 0.6,
  },
  scoreValue: {
    fontFamily: FONTS.displayBold,
  },
  lifelineStack: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  scoreLifelineIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  teamModalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  teamModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  teamModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  teamModalTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: FONT_SIZES.lg,
    letterSpacing: 0.8,
  },
  teamModalScore: {
    fontFamily: FONTS.uiSemibold,
    fontSize: FONT_SIZES.md,
  },
  teamModalButtonsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  teamModalLifelineButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  teamModalCloseBtn: {
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  teamModalCloseText: {
    fontFamily: FONTS.uiBold,
    fontSize: FONT_SIZES.sm,
    letterSpacing: 0.6,
  },
  gridScroll: {
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
    minHeight: 0,
    // Column so top/bottom flex spacers share leftover height equally.
    flexDirection: 'column',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    /** Horizontal justify applied inline (centers incomplete last rows). */
    width: '100%',
  },
  categoryGridCell: {
    /** Width/height from getBoardTopicCellBox - fixed so incomplete rows center mid-row. */
    minWidth: 0,
    alignItems: 'center',
    /** Center art+rails inside the fixed row box. */
    justifyContent: 'center',
  },
  boardCenterContainer: {
    width: '100%',
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  headerCenterWrap: {
    width: '100%',
    alignSelf: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  categoryBlock: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '100%',
    borderTopWidth: 6,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 35,
  },
  /** Illustration + category title - stacked between side rails. */
  topicCenterBlock: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    minWidth: 0,
    minHeight: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  /** Rails + illustration - side rails fixed width; center flexes horizontally. */
  topicArtRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  topicPointRail: {
    flexShrink: 0,
    /** 100/200/300 rounded squares fill image+title height (gaps via style.gap). */
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: 1,
  },
  /** Point value control - squircle; square on native, may be tall on web fill. */
  topicPointTile: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 0,
    minWidth: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  topicPointTileLocked: {
    borderColor: RANDOM_FLASH_GREEN,
    borderWidth: 2,
  },
  topicPointTileText: {
    fontFamily: FONTS.displayBold,
    textAlign: 'center',
    letterSpacing: -0.25,
    width: '100%',
    flexShrink: 0,
  },
  topicImageFrame: {
    flexShrink: 0,
    borderRadius: 0,
    overflow: 'hidden',
    alignSelf: 'center',
    flexGrow: 0,
  },
  topicImageFrameTight: {
    borderRadius: 0,
  },
  topicImageInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pictureFallbackFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  missingPictureLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  topicTitleRow: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    alignSelf: 'center',
    maxWidth: '100%',
    // Allow adjustsFontSizeToFit to use the full band; avoid clipping mid-scale.
    overflow: 'visible',
  },
  topicTitleText: {
    fontFamily: FONTS.displayBold,
    textAlign: 'center',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    width: '100%',
    height: '100%',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  rootContainer: {
    flex: 1,
  },
  hotSeatInfoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 55,
    elevation: 55,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  hotSeatInfoCard: {
    borderRadius: 42,
    backgroundColor: T.colors.surface,
    padding: SPACING.xl,
    maxWidth: 340,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: 22,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: FONTS.ui,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});

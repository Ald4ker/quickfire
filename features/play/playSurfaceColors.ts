import { HOME_SOFT_UI, getCurrentStudioDirection } from '@/themes';
import { relativeLuminance } from '@/constants/theme';

const T = HOME_SOFT_UI.colors;

/** Shared play-surface tokens - respects dark palette via HOME_SOFT_UI proxy. */
export function getPlaySurfaceColors() {
  const isDark = relativeLuminance(T.canvas) < 0.3;
  // Neutral gray matte so letterboxed topic art still reads as a card.
  const topicMatte = '#777777';
  const activeTurnAccent = isDark ? '#06B6D4' : '#FF6B00';
  return {
    canvas: T.canvas,
    surface: T.surface,
    textPrimary: T.textPrimary,
    textMuted: T.textMuted,
    tileBackground: T.surface,
    boardCanvas: isDark ? '#0F172A' : '#F5F5F0',
    boardCardBackground: isDark ? '#1E293B' : '#FFFFFF',
    boardInnerFrame: isDark ? '#0B1120' : '#FFF7F0',
    boardAccent: activeTurnAccent,
    /** Category card outline on the board (the turn colour on shipped palettes). */
    boardFrameBorder: activeTurnAccent,
    boardTileBackground: isDark ? '#334155' : '#F9FAFB',
    boardTileBorder: isDark ? '#475569' : '#D1D5DB',
    boardTileText: isDark ? '#F8FAFC' : '#111827',
    boardSpentBackground: isDark ? '#475569' : '#E5E7EB',
    boardSpentText: isDark ? '#F8FAFC' : '#111827',
    imageFrameBackground: isDark ? 'rgba(255, 255, 255, 0.08)' : topicMatte,
    imagePadding: isDark ? 2 : 6,
    isDark,
    topicImageContentFit: 'contain' as const,
    /** Topic illustration matte - always visible behind contain-fit art. */
    topicImageMatte: topicMatte,
    /** Label on empty topic frames - contrast against topicImageMatte. */
    missingPictureLabelColor: 'rgba(255, 255, 255, 0.72)',

    /**
     * Title strip under topic art (categories grid).
     * Light: white bar + charcoal type. Dark: elevated surface + light type.
     */
    topicLabelBackground: isDark ? T.surface : '#FFFFFF',
    topicLabelText: isDark ? T.textPrimary : '#111111',
    topicLabelBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(51, 51, 51, 0.08)',

    /** Raised chrome (header chips, selected pills, score cards). */
    controlBackground: T.surface,
    hairlineBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)',
    subtleFill: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
    subtleFillStrong: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(51, 51, 51, 0.08)',
    selectedBorder: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(51, 51, 51, 0.2)',
    iconChipBackground: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.95)',
    iconChipBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',

    /** Soft danger / incorrect control face. */
    dangerSoftBackground: isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2',
    /** Web hover on raised option cards. */
    hoverSurface: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FDFCFA',
    /** Full-screen boot / letterbox scrim. */
    bootScrim: isDark ? 'rgba(7, 17, 31, 0.92)' : 'rgba(240, 235, 227, 0.92)',
    /** Opaque accent-tinted score pill face for the active team. */
    activeTurnFace: isDark ? '#163749' : '#FFF3EC',
    /** Theme-matched active-turn accent and foreground. */
    activeTurnAccent,
    activeTurnOnFace: activeTurnAccent,
    /** Nested ± / badge faces match the active card. */
    activeTurnNestedFill: isDark ? '#163749' : '#FFF3EC',
    /** Award-tile “neither” dashed outline. */
    dashedBorder: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(51, 51, 51, 0.22)',
    ...studioPlaySurfaceOverrides(),
  };
}

/** Studio direction tokens layered over the play surface (TASK-040 preview). */
function studioPlaySurfaceOverrides() {
  const studio = getCurrentStudioDirection();
  if (!studio) return {};
  const c = studio.colors;
  return {
    // Transparent so the StudioBackdrop stage light shows through the board.
    boardCanvas: 'transparent',
    boardCardBackground: c.boardFrame,
    boardInnerFrame: c.boardPanel,
    boardAccent: c.turn,
    boardFrameBorder: c.hairline,
    boardTileBackground: c.tile,
    boardTileBorder: c.tileBorder,
    boardTileText: c.tileText,
    boardSpentBackground: c.tileSpent,
    boardSpentText: c.tileSpentText,
    topicLabelBackground: c.surface,
    topicLabelText: c.text,
    topicLabelBorder: c.hairline,
    hairlineBorder: c.hairline,
    selectedBorder: c.turn,
    activeTurnFace: c.turnFace,
    activeTurnAccent: c.turn,
    activeTurnOnFace: c.turn,
    activeTurnNestedFill: c.turnFace,
    hoverSurface: c.surfaceAlt,
  };
}

export type PlaySurfaceColors = ReturnType<typeof getPlaySurfaceColors>;

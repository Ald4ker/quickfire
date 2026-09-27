/**
 * Studio directions (TASK-040, preview): three premium looks selectable as theme
 * palettes. The default palette never reads anything from this file, so the
 * shipped look is unchanged unless a player picks a studio direction.
 *
 * - atelier:    light, brand-true Soft UI finished to a luxury standard.
 * - primetime:  prime-time TV studio; indigo stage, Electric Blue light, white numerals.
 * - highroller: private card room; bottle-green felt, ivory chips, gold leaf.
 */
import type { ViewStyle } from 'react-native';

export const STUDIO_DIRECTION_IDS = ['atelier', 'primetime', 'highroller'] as const;
export type StudioDirectionId = (typeof STUDIO_DIRECTION_IDS)[number];

export type StudioDirection = {
  id: StudioDirectionId;
  isDark: boolean;
  colors: {
    /** Canvas gradient: top light, mid (flat fallback), bottom falloff. */
    canvasTop: string;
    canvas: string;
    canvasBottom: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    hairline: string;
    /** Primary call to action (one per screen). */
    cta: string;
    ctaText: string;
    /** Secondary action face. */
    ctaSecondary: string;
    ctaSecondaryText: string;
    /** Active team / current turn. */
    turn: string;
    turnFace: string;
    /** Board point tiles. */
    tile: string;
    tileBorder: string;
    tileText: string;
    tileSpent: string;
    tileSpentText: string;
    /** Board category frame and inner panel. */
    boardFrame: string;
    boardPanel: string;
    /** Revealed answer panel. */
    reveal: string;
    revealText: string;
    winner: string;
    winnerText: string;
    loser: string;
    loserText: string;
  };
  depth: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffsetY: number;
    elevation: number;
    /** Top rim light on raised faces (0 width disables). */
    rimColor: string;
    rimWidth: number;
  };
  type: {
    /** Tracking for all-caps labels and CTAs. */
    capsTracking: number;
    /** Tracking for large display lines (questions, titles). */
    displayTracking: number;
  };
  motion: {
    /** Native stack transition between play screens. */
    stackAnimation: 'fade' | 'fade_from_bottom' | 'slide_from_right';
  };
};

const ATELIER: StudioDirection = {
  id: 'atelier',
  isDark: false,
  colors: {
    canvasTop: '#F7F3ED',
    canvas: '#F0EBE3',
    canvasBottom: '#E6DFD3',
    surface: '#FFFFFF',
    surfaceAlt: '#FAF7F2',
    text: '#333333',
    textMuted: 'rgba(51, 51, 51, 0.62)',
    hairline: 'rgba(51, 51, 51, 0.10)',
    cta: '#2A2927',
    ctaText: '#F7F3ED',
    ctaSecondary: '#FFFFFF',
    ctaSecondaryText: '#333333',
    turn: '#FF8C00',
    turnFace: '#FFF4E6',
    tile: '#FFFFFF',
    tileBorder: 'rgba(51, 51, 51, 0.10)',
    tileText: '#333333',
    tileSpent: '#ECE6DC',
    tileSpentText: 'rgba(51, 51, 51, 0.28)',
    boardFrame: '#FFFFFF',
    boardPanel: '#F7F3ED',
    reveal: '#2A2927',
    revealText: '#F7F3ED',
    winner: '#2A2927',
    winnerText: '#F7F3ED',
    loser: '#FFFFFF',
    loserText: '#333333',
  },
  depth: {
    shadowColor: 'rgba(74, 56, 32, 0.16)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffsetY: 8,
    elevation: 6,
    rimColor: 'rgba(255, 255, 255, 0.9)',
    rimWidth: 1,
  },
  type: { capsTracking: 1.6, displayTracking: -0.4 },
  motion: { stackAnimation: 'fade_from_bottom' },
};

const PRIMETIME: StudioDirection = {
  id: 'primetime',
  isDark: true,
  colors: {
    canvasTop: '#233A8F',
    canvas: '#111A45',
    canvasBottom: '#080D26',
    surface: '#18235A',
    surfaceAlt: '#1F2C6B',
    text: '#F4F6FF',
    textMuted: 'rgba(214, 222, 255, 0.68)',
    hairline: 'rgba(140, 170, 255, 0.22)',
    cta: '#1F7BFF',
    ctaText: '#FFFFFF',
    ctaSecondary: 'rgba(255, 255, 255, 0.08)',
    ctaSecondaryText: '#F4F6FF',
    turn: '#FF8C00',
    turnFace: '#2A3274',
    tile: '#1E2B6E',
    tileBorder: 'rgba(120, 160, 255, 0.35)',
    tileText: '#FFFFFF',
    tileSpent: '#10173F',
    tileSpentText: 'rgba(244, 246, 255, 0.22)',
    boardFrame: '#16205A',
    boardPanel: '#0F1843',
    reveal: '#1F7BFF',
    revealText: '#FFFFFF',
    winner: '#1F7BFF',
    winnerText: '#FFFFFF',
    loser: 'rgba(255, 255, 255, 0.06)',
    loserText: 'rgba(244, 246, 255, 0.78)',
  },
  depth: {
    shadowColor: 'rgba(2, 4, 20, 0.6)',
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffsetY: 10,
    elevation: 10,
    rimColor: 'rgba(150, 180, 255, 0.28)',
    rimWidth: 1,
  },
  type: { capsTracking: 2, displayTracking: -0.3 },
  motion: { stackAnimation: 'fade' },
};

const HIGHROLLER: StudioDirection = {
  id: 'highroller',
  isDark: true,
  colors: {
    canvasTop: '#1B5E47',
    canvas: '#0F3D30',
    canvasBottom: '#08251C',
    surface: '#144A3A',
    surfaceAlt: '#1A5745',
    text: '#F6F0DD',
    textMuted: 'rgba(246, 240, 221, 0.66)',
    hairline: 'rgba(217, 180, 90, 0.34)',
    cta: '#D9B45A',
    ctaText: '#1C1606',
    ctaSecondary: 'rgba(246, 240, 221, 0.08)',
    ctaSecondaryText: '#F6F0DD',
    turn: '#E6C36A',
    turnFace: '#1F5A47',
    tile: '#F6F0DD',
    tileBorder: 'rgba(122, 31, 43, 0.28)',
    tileText: '#7A1F2B',
    tileSpent: '#0C3228',
    tileSpentText: 'rgba(246, 240, 221, 0.2)',
    boardFrame: '#12463A',
    boardPanel: '#0D372B',
    reveal: '#F6F0DD',
    revealText: '#1E2A24',
    winner: '#D9B45A',
    winnerText: '#1C1606',
    loser: 'rgba(246, 240, 221, 0.06)',
    loserText: 'rgba(246, 240, 221, 0.78)',
  },
  depth: {
    shadowColor: 'rgba(0, 12, 6, 0.55)',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffsetY: 10,
    elevation: 10,
    rimColor: 'rgba(217, 180, 90, 0.45)',
    rimWidth: 1,
  },
  type: { capsTracking: 2.4, displayTracking: 0 },
  motion: { stackAnimation: 'fade' },
};

export const STUDIO_DIRECTIONS: Record<StudioDirectionId, StudioDirection> = {
  atelier: ATELIER,
  primetime: PRIMETIME,
  highroller: HIGHROLLER,
};

export function isStudioDirectionId(id: unknown): id is StudioDirectionId {
  return typeof id === 'string' && (STUDIO_DIRECTION_IDS as readonly string[]).includes(id);
}

export function getStudioDirection(id: unknown): StudioDirection | null {
  return isStudioDirectionId(id) ? STUDIO_DIRECTIONS[id] : null;
}

/** True for every dark scheme: the dark palette and the dark studio directions. */
export function isDarkPaletteId(id: string): boolean {
  return id === 'dark' || Boolean(getStudioDirection(id)?.isDark);
}

/** Soft layered lift for raised faces in a studio direction. */
export function studioLift(direction: StudioDirection): ViewStyle {
  const d = direction.depth;
  return {
    shadowColor: d.shadowColor,
    shadowOffset: { width: 0, height: d.shadowOffsetY },
    shadowOpacity: d.shadowOpacity,
    shadowRadius: d.shadowRadius,
    elevation: d.elevation,
  };
}

/** Rim light (top edge) for raised faces. */
export function studioRim(direction: StudioDirection): ViewStyle {
  return direction.depth.rimWidth > 0
    ? { borderTopWidth: direction.depth.rimWidth, borderTopColor: direction.depth.rimColor }
    : {};
}

/**
 * Active direction, mirrored from the theme store (store/theme.ts) so plain
 * functions such as softSurfaceLift() can read it without an import cycle.
 */
let activeDirection: StudioDirection | null = null;

export function setActiveStudioDirection(id: unknown): void {
  activeDirection = getStudioDirection(id);
}

export function getActiveStudioDirection(): StudioDirection | null {
  return activeDirection;
}

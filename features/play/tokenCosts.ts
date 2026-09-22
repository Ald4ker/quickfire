import type { GameMode } from '@/features/shared';

export const DEFAULT_GAME_TOKEN_COST = 10;

export const QUICK_PLAY_TOKEN_COST_BY_TOPIC_COUNT = {
  1: 2,
  2: 4,
  3: 5,
  4: 7,
  5: 8,
} as const;

/** Random mode: same curve as Quick Play for 1–5, full board (6) matches classic at 10. */
export const RANDOM_TOKEN_COST_BY_TOPIC_COUNT = {
  1: 2,
  2: 4,
  3: 5,
  4: 7,
  5: 8,
  6: 10,
} as const;

export type QuickPlayTopicCount = keyof typeof QUICK_PLAY_TOKEN_COST_BY_TOPIC_COUNT;
export type RandomTopicCount = keyof typeof RANDOM_TOKEN_COST_BY_TOPIC_COUNT;

/** Topic-count choices in ascending order (1 → 5 left to right). */
export const QUICK_PLAY_TOPIC_OPTIONS: {
  topicCount: QuickPlayTopicCount;
  tokenCost: number;
}[] = (
  [1, 2, 3, 4, 5] as const satisfies readonly QuickPlayTopicCount[]
).map((topicCount) => ({
  topicCount,
  tokenCost: QUICK_PLAY_TOKEN_COST_BY_TOPIC_COUNT[topicCount],
}));

export const QUICK_PLAY_TOKEN_COST_RANGE_LABEL = '2-8';
export const RANDOM_TOKEN_COST_RANGE_LABEL = '2-10';

export function normalizeQuickPlayTopicCount(count: number | undefined): QuickPlayTopicCount {
  if (count === 1 || count === 2 || count === 4 || count === 5) return count;
  return 3;
}

export function normalizeRandomTopicCount(count: number | undefined): RandomTopicCount {
  if (
    count === 1 ||
    count === 2 ||
    count === 3 ||
    count === 4 ||
    count === 5 ||
    count === 6
  ) {
    return count;
  }
  return 6;
}

export function getGameTokenCost(
  mode: GameMode,
  topicCount?: number
): number {
  if (mode === 'quickPlay') {
    return QUICK_PLAY_TOKEN_COST_BY_TOPIC_COUNT[normalizeQuickPlayTopicCount(topicCount)];
  }
  if (mode === 'random') {
    return RANDOM_TOKEN_COST_BY_TOPIC_COUNT[normalizeRandomTopicCount(topicCount)];
  }
  return DEFAULT_GAME_TOKEN_COST;
}

export function getHomeModeTokenCostLabel(mode: GameMode): string {
  if (mode === 'quickPlay') return QUICK_PLAY_TOKEN_COST_RANGE_LABEL;
  if (mode === 'random') return RANDOM_TOKEN_COST_RANGE_LABEL;
  return String(DEFAULT_GAME_TOKEN_COST);
}

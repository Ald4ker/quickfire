import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_GAME_TOKEN_COST,
  getGameTokenCost,
  getHomeModeTokenCostLabel,
  RANDOM_TOKEN_COST_BY_TOPIC_COUNT,
} from '@/features/play/tokenCosts';

describe('tokenCosts', () => {
  it('scales random token cost by topic count (1–6)', () => {
    expect(getGameTokenCost('random', 1)).toBe(2);
    expect(getGameTokenCost('random', 3)).toBe(5);
    expect(getGameTokenCost('random', 6)).toBe(10);
    expect(getGameTokenCost('random')).toBe(RANDOM_TOKEN_COST_BY_TOPIC_COUNT[6]);
    expect(getGameTokenCost('classic')).toBe(DEFAULT_GAME_TOKEN_COST);
  });

  it('labels home random mode with the 2–10 range', () => {
    expect(getHomeModeTokenCostLabel('random')).toBe('2-10');
    expect(getHomeModeTokenCostLabel('quickPlay')).toBe('2-8');
    expect(getHomeModeTokenCostLabel('classic')).toBe('10');
  });
});

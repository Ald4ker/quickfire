import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GameConfig, GameSessionState, QuestionCard } from '@/features/shared';
import { serializeGameSession } from '@/store/gameSessionPersistence';
import { __setAuthDisabled, __resetAuthModeDouble } from '../doubles/authMode';
import {
  __asyncStorageMemory,
  __resetAsyncStorageDouble,
} from '../doubles/asyncStorage';
import { __setFeatureFlags } from '../doubles/featureFlags';
import { usePlayStore } from '@/store/play';

const mockStorage = __asyncStorageMemory();


const STORAGE_KEY = 'backfire-play-store-v1';

function createQuestion(overrides: Partial<QuestionCard> & Pick<QuestionCard, 'id' | 'canonicalKey'>): QuestionCard {
  return {
    id: overrides.id,
    canonicalKey: overrides.canonicalKey,
    categoryId: overrides.categoryId ?? 'cat_science',
    categoryName: overrides.categoryName ?? 'Science',
    prompt: overrides.prompt ?? 'What is the answer?',
    answer: overrides.answer ?? '42',
    pointValue: overrides.pointValue ?? 200,
    locale: overrides.locale ?? 'en',
    resolvedFromFallback: overrides.resolvedFromFallback ?? false,
    used: overrides.used ?? false,
    boardSide: overrides.boardSide,
    rumbleFirstTeamId: overrides.rumbleFirstTeamId,
    rumbleSecondTeamId: overrides.rumbleSecondTeamId,
    assignedTeamId: overrides.assignedTeamId,
  };
}

function createSession(overrides: Partial<GameSessionState> = {}): GameSessionState {
  const board = overrides.board ?? [createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' })];
  const teams =
    overrides.teams ??
    [
      { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 300, wagersUsed: 1 },
      { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 500, wagersUsed: 0 },
    ];

  const config: GameConfig =
    overrides.config ??
    {
      mode: 'classic',
      teams: teams.map(({ id, name, playerNames }) => ({ id, name, playerNames })),
      categories: ['science'],
      contentLocaleChain: ['en'],
      quickPlayTopicCount: 3,
      hotSeatEnabled: false,
      wagerEnabled: true,
      wagersPerTeam: 3,
    };

  return {
    id: 'session-1',
    mode: 'classic',
    config,
    contentLocaleChain: ['en'],
    step: 'board',
    phase: 'wagerDecision',
    availableCategories: [
      {
        id: 'cat_science',
        slug: 'science',
        title: 'Science',
        questionCount: 8,
        resolvedLocale: 'en',
        fellBackToEnglish: false,
      },
    ],
    selectedCategoryIds: ['science'],
    currentTeamId: 'team_1',
    currentQuestion: board[0],
    board,
    teams,
    scores: {
      team_1: 300,
      team_2: 500,
    },
    usedQuestionIds: new Set(['q-board-1']),
    seed: 'seed-123',
    wagersPerTeam: 3,
    wager: {
      wageringTeamId: 'team_2',
      targetTeamId: 'team_1',
      multiplier: 1.5,
      question: board[0],
    },
    bonus: {
      active: false,
      played: true,
      multiplier: 2,
      question: createQuestion({ id: 'q-bonus-1', canonicalKey: 'science:bonus:0', pointValue: 400 }),
    },
    lastAwardedTeamId: 'team_1',
    timerStartedAt: 123456789,
    overtime: {
      topics: ['science', 'history'],
      leadingTeamBanned: 'science',
      trailingTeamSelected: 'history',
    },
    scoreEvents: [],
    ...overrides,
  };
}

function seedPlayStorage(tokens: number, session: GameSessionState | null) {
  mockStorage.set(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        tokens,
        session: serializeGameSession(session),
        rapidFire: null,
      },
      version: 1,
    })
  );
}

beforeEach(async () => {
  __resetAuthModeDouble();
  __setAuthDisabled(true);
  __resetAsyncStorageDouble();
  jest.clearAllMocks();
  usePlayStore.setState({ session: null, tokens: 5, rapidFire: null });
  await usePlayStore.getState().hydrate();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePlayStore', () => {
  it('creates classic setup with zero hot seat rounds and one wager per team', () => {
    usePlayStore.getState().setMode('classic');

    const session = usePlayStore.getState().session;

    expect(session?.config.hotSeatEnabled).toBe(false);
    expect(session?.config.hotSeatRounds).toBe(0);
    expect(session?.config.wagersPerTeam).toBe(1);
    expect(session?.wagersPerTeam).toBe(1);
  });

  it('branches quick play through topic length before team setup', () => {
    usePlayStore.getState().setMode('quickPlay');
    expect(usePlayStore.getState().session?.step).toBe('quick-play-length');

    usePlayStore.getState().setQuickPlayTopicCount(5);
    expect(usePlayStore.getState().session?.step).toBe('team-setup');
    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(5);
  });

  it('loads a debug winner session for end-screen QA', () => {
    usePlayStore.getState().loadDebugWinnerSession();

    const session = usePlayStore.getState().session;
    expect(session?.step).toBe('end');
    expect(session?.phase).toBe('completed');
    expect(session?.mode).toBe('quickPlay');
    expect(session?.teams.map((team) => team.name)).toEqual(['Team 1', 'Team 2']);
    expect(session?.teams[0]?.score).toBeGreaterThan(session?.teams[1]?.score ?? 0);
    expect(session?.lastResolvedTurn?.question.prompt).toBeTruthy();
  });

  it('starts a fresh setup when changing quick play topic count after a match is in progress', () => {
    usePlayStore.setState({
      tokens: 20,
      rapidFire: null,
      session: createSession({
        id: 'old-match',
        mode: 'quickPlay',
        step: 'board',
        phase: 'wagerDecision',
        selectedCategoryIds: ['science', 'history', 'sports'],
        usedQuestionIds: new Set(['q-board-1']),
        currentQuestion: createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' }),
        scores: { team_1: 300, team_2: 500 },
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 300, wagersUsed: 1 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 500, wagersUsed: 0 },
        ],
        config: {
          mode: 'quickPlay',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['science', 'history', 'sports'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: true,
          wagersPerTeam: 1,
          entryTokenCharge: 0,
        },
      }),
    });

    usePlayStore.getState().setQuickPlayTopicCount(4);

    const session = usePlayStore.getState().session;
    expect(session?.mode).toBe('quickPlay');
    expect(session?.step).toBe('team-setup');
    expect(session?.phase).toBe('lobby');
    expect(session?.config.quickPlayTopicCount).toBe(4);
    expect(session?.id).not.toBe('old-match');
    expect(session?.selectedCategoryIds).toEqual([]);
    expect(session?.board).toEqual([]);
    expect(session?.currentQuestion).toBeUndefined();
    expect(Array.from(session?.usedQuestionIds ?? ['keep'])).toEqual([]);
    expect(session?.scores).toEqual({ team_1: 0, team_2: 0 });
    expect(session?.teams.map((team) => team.score)).toEqual([0, 0]);
    expect(session?.teams.map((team) => team.name)).toEqual(['Alpha', 'Beta']);
  });

  it('starts a brand-new match identity when replacing an in-progress session via startModeSession', () => {
    usePlayStore.setState({
      tokens: 20,
      rapidFire: null,
      session: createSession({
        id: 'old-match',
        mode: 'quickPlay',
        step: 'board',
        phase: 'wagerDecision',
        selectedCategoryIds: ['science', 'history', 'sports'],
        usedQuestionIds: new Set(['q-board-1']),
        currentQuestion: createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' }),
        scores: { team_1: 300, team_2: 500 },
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 300, wagersUsed: 1 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 500, wagersUsed: 0 },
        ],
      }),
    });

    const result = usePlayStore.getState().startModeSession('quickPlay');

    expect(result).toEqual({ ok: true });
    const session = usePlayStore.getState().session;
    expect(session?.id).not.toBe('old-match');
    expect(session?.step).toBe('quick-play-length');
    expect(session?.phase).toBe('lobby');
    expect(session?.selectedCategoryIds).toEqual([]);
    expect(session?.board).toEqual([]);
    expect(session?.currentQuestion).toBeUndefined();
    expect(Array.from(session?.usedQuestionIds ?? ['keep'])).toEqual([]);
    expect(session?.scores).toEqual({ team_1: 0, team_2: 0 });
    expect(session?.teams.map((team) => team.score)).toEqual([0, 0]);
  });

  it('clears previously selected topics when starting a new mode session', () => {
    usePlayStore.setState({
      tokens: 20,
      rapidFire: null,
      session: createSession({
        selectedCategoryIds: ['science', 'history'],
        config: {
          mode: 'classic',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['science', 'history'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: true,
          wagersPerTeam: 1,
        },
      }),
    });

    const result = usePlayStore.getState().startModeSession('quickPlay');

    expect(result).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.selectedCategoryIds).toEqual([]);
    expect(usePlayStore.getState().session?.config.categories).toEqual([]);
  });

  it('clears previously selected topics when choosing a mode', () => {
    usePlayStore.setState({
      rapidFire: null,
      session: createSession({
        selectedCategoryIds: ['science', 'history'],
        config: {
          mode: 'classic',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['science', 'history'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: true,
          wagersPerTeam: 1,
        },
      }),
    });

    usePlayStore.getState().setMode('classic');

    expect(usePlayStore.getState().session?.selectedCategoryIds).toEqual([]);
    expect(usePlayStore.getState().session?.config.categories).toEqual([]);
  });

  it('sends rumble into team setup like classic', () => {
    usePlayStore.getState().setMode('rumble');
    expect(usePlayStore.getState().session?.step).toBe('team-setup');
    expect(usePlayStore.getState().session?.mode).toBe('rumble');
  });

  it('lets rumble use only two, three, four, or six teams while keeping wagers and hot seat off', () => {
    usePlayStore.getState().setMode('rumble');

    let session = usePlayStore.getState().session;
    expect(session?.teams).toHaveLength(2);

    for (const count of [3, 4, 6]) {
      usePlayStore.getState().setTeamCount(count);
      session = usePlayStore.getState().session;
      expect(session?.teams).toHaveLength(count);
      expect(session?.config.teams).toHaveLength(count);
      expect(session?.config.wagerEnabled).toBe(false);
      expect(session?.config.hotSeatEnabled).toBe(false);
      expect(session?.config.hotSeatRounds).toBe(0);
    }

    usePlayStore.getState().setTeamCount(5);
    session = usePlayStore.getState().session;
    expect(session?.teams).toHaveLength(6);

    usePlayStore.getState().setTeamCount(1);
    session = usePlayStore.getState().session;
    expect(session?.teams).toHaveLength(6);
  });

  it('defaults rumble and random to six topics', () => {
    usePlayStore.getState().setMode('rumble');
    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(6);

    usePlayStore.getState().setMode('random');
    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(6);
    expect(usePlayStore.getState().session?.step).toBe('team-setup');
  });

  it('lets random mode pick any topic count from 1 to 6', () => {
    usePlayStore.getState().setMode('random');

    for (const count of [1, 2, 3, 4, 5, 6] as const) {
      usePlayStore.getState().setTopicCount(count);
      expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(count);
    }

    usePlayStore.getState().setTopicCount(9);
    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(6);
  });

  it('snaps rumble teams when the topic count makes the current count invalid', () => {
    usePlayStore.getState().setMode('rumble');
    usePlayStore.getState().setTeamCount(3);
    usePlayStore.getState().setTopicCount(4);

    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(4);
    expect(usePlayStore.getState().session?.teams).toHaveLength(4);

    usePlayStore.getState().setTeamCount(3);
    expect(usePlayStore.getState().session?.teams).toHaveLength(4);

    usePlayStore.getState().setTopicCount(3);
    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(3);
    expect(usePlayStore.getState().session?.teams).toHaveLength(3);
  });

  it('assigns rumble questions evenly by team, answer order, and difficulty', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('rumble');
    usePlayStore.getState().setTeamCount(6);
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }

    const result = usePlayStore.getState().startBoard();

    expect(result).toMatchObject({ ok: true });
    const session = usePlayStore.getState().session!;
    const byPointValue = session.board.reduce<Record<number, typeof session.board>>(
      (groups, question) => {
        groups[question.pointValue] = groups[question.pointValue] ?? [];
        groups[question.pointValue].push(question);
        return groups;
      },
      {}
    );

    for (const questions of Object.values(byPointValue)) {
      expect(questions).toHaveLength(12);
      const firstCounts = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.rumbleFirstTeamId!] = (counts[question.rumbleFirstTeamId!] ?? 0) + 1;
        return counts;
      }, {});
      const secondCounts = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.rumbleSecondTeamId!] = (counts[question.rumbleSecondTeamId!] ?? 0) + 1;
        return counts;
      }, {});

      expect(firstCounts).toEqual({
        team_1: 2,
        team_2: 2,
        team_3: 2,
        team_4: 2,
        team_5: 2,
        team_6: 2,
      });
      expect(secondCounts).toEqual({
        team_1: 2,
        team_2: 2,
        team_3: 2,
        team_4: 2,
        team_5: 2,
        team_6: 2,
      });
      for (const question of questions) {
        expect(question.rumbleSecondTeamId).not.toBe(question.rumbleFirstTeamId);
      }
    }
  });

  it('assigns random-mode questions evenly across 100, 200, and 300 value buckets', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('random');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }

    const result = usePlayStore.getState().startBoard();

    expect(result).toMatchObject({ ok: true });
    const session = usePlayStore.getState().session!;
    expect(session.teams).toHaveLength(2);

    const byBucket = session.board.reduce<Record<number, typeof session.board>>((groups, question) => {
      groups[question.pointValue] = groups[question.pointValue] ?? [];
      groups[question.pointValue].push(question);
      return groups;
    }, {});

    expect(Object.keys(byBucket).sort()).toEqual(['100', '200', '300']);

    for (const questions of Object.values(byBucket)) {
      expect(questions).toHaveLength(12);
      const ownerCounts = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.assignedTeamId!] = (counts[question.assignedTeamId!] ?? 0) + 1;
        return counts;
      }, {});
      expect(ownerCounts).toEqual({ team_1: 6, team_2: 6 });
    }
  });

  it('starts randomizer quick play with the chosen topic count', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    usePlayStore.getState().setMode('random');
    usePlayStore.getState().setTopicCount(3);

    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 3) ?? [];
    usePlayStore.getState().setCategories(categories.map((category) => category.slug));

    const result = usePlayStore.getState().startBoard();
    expect(result).toMatchObject({ ok: true });
    expect(usePlayStore.getState().session?.selectedCategoryIds).toHaveLength(3);
    expect(usePlayStore.getState().session?.board).toHaveLength(18);
  });

  it('assigns rumble questions evenly across 100, 200, and 300 value buckets', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('rumble');
    usePlayStore.getState().setTeamCount(6);
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }

    const result = usePlayStore.getState().startBoard();

    expect(result).toMatchObject({ ok: true });
    const session = usePlayStore.getState().session!;
    const bucketFor = (pointValue: number) => pointValue;
    const byBucket = session.board.reduce<Record<number, typeof session.board>>(
      (groups, question) => {
        const bucket = bucketFor(question.pointValue);
        groups[bucket] = groups[bucket] ?? [];
        groups[bucket].push(question);
        return groups;
      },
      {}
    );

    expect(Object.keys(byBucket).sort()).toEqual(['100', '200', '300']);

    for (const questions of Object.values(byBucket)) {
      const firstCounts = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.rumbleFirstTeamId!] = (counts[question.rumbleFirstTeamId!] ?? 0) + 1;
        return counts;
      }, {});
      const secondCounts = questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.rumbleSecondTeamId!] = (counts[question.rumbleSecondTeamId!] ?? 0) + 1;
        return counts;
      }, {});

      expect(firstCounts).toEqual({
        team_1: 2,
        team_2: 2,
        team_3: 2,
        team_4: 2,
        team_5: 2,
        team_6: 2,
      });
      expect(secondCounts).toEqual(firstCounts);
    }
  });

  it('does not spend a rumble question when leaving before the answer can reveal', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_030_000);
    const question = createQuestion({
      id: 'q-rumble-cancel',
      canonicalKey: 'science:200:rumble-cancel',
      rumbleFirstTeamId: 'team_1',
      rumbleSecondTeamId: 'team_2',
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'rumble',
        currentQuestion: question,
        board: [question],
        usedQuestionIds: new Set([question.id]),
        step: 'question',
        phase: 'questionReveal',
        timerStartedAt: 1_000_000,
      }),
    });

    usePlayStore.getState().cancelCurrentQuestion();

    expect(usePlayStore.getState().session?.usedQuestionIds.has(question.id)).toBe(false);
    expect(usePlayStore.getState().session?.step).toBe('board');
  });

  it('rejects rumble answer reveal before the second team appears and allows reveal after the round ends', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const question = createQuestion({
      id: 'q-rumble',
      canonicalKey: 'science:200:rumble',
      rumbleFirstTeamId: 'team_1',
      rumbleSecondTeamId: 'team_2',
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'rumble',
        config: {
          mode: 'rumble',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['science'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: false,
          wagersPerTeam: 0,
        },
        currentQuestion: question,
        board: [question],
        step: 'question',
        phase: 'questionReveal',
        timerStartedAt: 1_000_000,
      }),
    });

    expect(usePlayStore.getState().revealAnswer()).toEqual({
      ok: false,
      error: 'The second Rumble team has not been revealed yet.',
    });
    expect(usePlayStore.getState().session?.step).toBe('question');

    jest.spyOn(Date, 'now').mockReturnValue(1_076_000);
    expect(usePlayStore.getState().revealAnswer()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.step).toBe('answer');

    usePlayStore.setState({
      session: {
        ...usePlayStore.getState().session!,
        step: 'question',
        phase: 'questionReveal',
        timerStartedAt: 1_000_000,
      },
    });
    jest.spyOn(Date, 'now').mockReturnValue(1_090_000);

    expect(usePlayStore.getState().revealAnswer()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.step).toBe('answer');
  });

  it('skips rumble wait to the next stage checkpoint until the round ends', () => {
    const question = createQuestion({
      id: 'q-rumble-skip',
      canonicalKey: 'science:200:rumble-skip',
      rumbleFirstTeamId: 'team_1',
      rumbleSecondTeamId: 'team_2',
    });

    // Keep wall clock fixed so each skip only advances the synthetic elapsed time.
    jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    usePlayStore.setState({
      session: createSession({
        mode: 'rumble',
        currentQuestion: question,
        board: [question],
        step: 'question',
        phase: 'questionReveal',
        timerStartedAt: 2_000_000,
      }),
    });

    // 0s → 31s (team 1)
    expect(usePlayStore.getState().skipRumbleWait()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.timerStartedAt).toBe(2_000_000 - 31_000);

    // 31s → 61s (lock team 1)
    expect(usePlayStore.getState().skipRumbleWait()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.timerStartedAt).toBe(2_000_000 - 61_000);

    // 61s → 76s (team 2)
    expect(usePlayStore.getState().skipRumbleWait()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.timerStartedAt).toBe(2_000_000 - 76_000);

    // 76s → 90s (lock team 2 / end)
    expect(usePlayStore.getState().skipRumbleWait()).toEqual({ ok: true });
    expect(usePlayStore.getState().session?.timerStartedAt).toBe(2_000_000 - 90_000);

    expect(usePlayStore.getState().skipRumbleWait()).toEqual({
      ok: false,
      error: 'No more Rumble checkpoints to skip.',
    });
  });

  it('rejects rumble board start when the team count is unsupported', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('rumble');
    const session = usePlayStore.getState().session!;
    const categories = session.availableCategories.slice(0, 6);

    usePlayStore.setState({
      session: {
        ...session,
        teams: session.teams.concat(
          { id: 'team_3', name: 'Team 3', playerNames: ['Player 1'], score: 0, wagersUsed: 0 },
          { id: 'team_4', name: 'Team 4', playerNames: ['Player 1'], score: 0, wagersUsed: 0 },
          { id: 'team_5', name: 'Team 5', playerNames: ['Player 1'], score: 0, wagersUsed: 0 }
        ),
        selectedCategoryIds: categories.map((category) => category.slug),
      },
    });

    const result = usePlayStore.getState().startBoard();

    expect(result).toEqual({
      ok: false,
      error: 'Rumble supports 2, 3, 4, or 6 teams.',
    });
  });

  it('starts rumble when a multi-group topic would otherwise unbalance value buckets', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('rumble');
    usePlayStore.getState().setTeamCount(4);

    const available = usePlayStore.getState().session?.availableCategories ?? [];
    const multiGroup = available.find((category) => category.slug === 'harry-potter');
    expect(multiGroup).toBeTruthy();

    const fillers = available
      .filter((category) => category.slug !== 'harry-potter')
      .slice(0, 5)
      .map((category) => category.slug);
    usePlayStore.getState().setCategories(['harry-potter', ...fillers]);

    const result = usePlayStore.getState().startBoard();
    expect(result).toMatchObject({ ok: true });

    const board = usePlayStore.getState().session?.board ?? [];
    const byPointValue = board.reduce<Record<number, number>>((counts, question) => {
      counts[question.pointValue] = (counts[question.pointValue] ?? 0) + 1;
      return counts;
    }, {});

    expect(board).toHaveLength(36);
    expect(byPointValue).toEqual({ 100: 12, 200: 12, 300: 12 });
  });

  it('starts rumble with four topics and two teams', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('rumble');
    usePlayStore.getState().setTopicCount(4);
    usePlayStore.getState().setTeamCount(2);

    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 4) ?? [];
    usePlayStore.getState().setCategories(categories.map((category) => category.slug));

    const result = usePlayStore.getState().startBoard();
    expect(result).toMatchObject({ ok: true });

    const board = usePlayStore.getState().session?.board ?? [];
    const byPointValue = board.reduce<Record<number, number>>((counts, question) => {
      counts[question.pointValue] = (counts[question.pointValue] ?? 0) + 1;
      return counts;
    }, {});

    expect(board).toHaveLength(24);
    expect(byPointValue).toEqual({ 100: 8, 200: 8, 300: 8 });
  });

  it('hydrates token balance from storage', async () => {
    seedPlayStorage(12, null);

    await usePlayStore.getState().hydrate();

    expect(usePlayStore.getState().tokens).toBe(12);
    expect(usePlayStore.getState().session).toBeNull();
  });

  it('hydrates draft setup from storage', async () => {
    const session = createSession({
      step: 'team-setup',
      phase: 'lobby',
      selectedCategoryIds: ['science', 'history'],
      teams: [
        { id: 'team_1', name: 'Gamma', playerNames: ['Gina', 'Gabe'], score: 0, wagersUsed: 0 },
        { id: 'team_2', name: 'Delta', playerNames: ['Drew'], score: 0, wagersUsed: 0 },
      ],
      config: {
        mode: 'quickPlay',
        teams: [
          { id: 'team_1', name: 'Gamma', playerNames: ['Gina', 'Gabe'] },
          { id: 'team_2', name: 'Delta', playerNames: ['Drew'] },
        ],
        categories: ['science', 'history'],
        contentLocaleChain: ['en'],
        quickPlayTopicCount: 2,
        hotSeatEnabled: false,
        wagerEnabled: true,
        wagersPerTeam: 4,
      },
      wagersPerTeam: 4,
      mode: 'quickPlay',
      board: [],
      currentQuestion: undefined,
      wager: null,
      bonus: { active: false, played: false, multiplier: 2 },
      scores: { team_1: 0, team_2: 0 },
      usedQuestionIds: new Set(),
    });

    seedPlayStorage(9, session);

    await usePlayStore.getState().hydrate();

    const hydrated = usePlayStore.getState().session;
    expect(usePlayStore.getState().tokens).toBe(9);
    expect(hydrated?.mode).toBe('quickPlay');
    expect(hydrated?.step).toBe('team-setup');
    // Stale removed topics are dropped; live catalog is re-read from questions.json.
    expect(hydrated?.selectedCategoryIds).toEqual(['science']);
    expect(hydrated?.availableCategories.some((category) => category.slug === 'science')).toBe(true);
    expect(hydrated?.availableCategories.some((category) => category.slug === 'history')).toBe(false);
    expect(hydrated?.availableCategories.length).toBeGreaterThan(1);
    expect(hydrated?.teams.map((team) => team.name)).toEqual(['Gamma', 'Delta']);
    expect(hydrated?.wagersPerTeam).toBe(4);
  });

  it('refreshes available categories on hydrate and drops removed topic selections outside active matches', async () => {
    const session = createSession({
      step: 'categories',
      phase: 'lobby',
      selectedCategoryIds: ['science', 'arab-history', 'south-asian-history'],
      availableCategories: [
        {
          id: 'h6',
          slug: 'arab-history',
          title: 'Arab History',
          questionCount: 1,
          resolvedLocale: 'en',
          fellBackToEnglish: false,
        },
        {
          id: 'h9',
          slug: 'south-asian-history',
          title: 'South Asian History',
          questionCount: 1,
          resolvedLocale: 'en',
          fellBackToEnglish: false,
        },
      ],
      board: [],
      currentQuestion: undefined,
      wager: null,
      usedQuestionIds: new Set(),
      scores: { team_1: 0, team_2: 0 },
      teams: [
        { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 0, wagersUsed: 0 },
        { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
      ],
    });

    seedPlayStorage(4, session);
    await usePlayStore.getState().hydrate();

    const hydrated = usePlayStore.getState().session;
    expect(hydrated?.availableCategories.some((category) => category.slug === 'arab-history')).toBe(
      false
    );
    expect(
      hydrated?.availableCategories.some((category) => category.slug === 'south-asian-history')
    ).toBe(false);
    expect(hydrated?.availableCategories.some((category) => category.slug === 'science')).toBe(true);
    expect(hydrated?.selectedCategoryIds).toEqual(['science']);
  });

  it('hydrates a started board from storage with a real set of used questions', async () => {
    const session = createSession({
      step: 'board',
      phase: 'wagerDecision',
      currentTeamId: 'team_2',
      board: [
        createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' }),
        createQuestion({ id: 'q-board-2', canonicalKey: 'science:400:1', pointValue: 400 }),
      ],
      currentQuestion: createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' }),
      usedQuestionIds: new Set(['q-board-1']),
      wager: {
        wageringTeamId: 'team_1',
        targetTeamId: 'team_2',
        multiplier: 2,
        question: createQuestion({ id: 'q-board-1', canonicalKey: 'science:200:0' }),
      },
      bonus: { active: true, played: true, multiplier: 2 },
      scores: { team_1: 200, team_2: 400 },
      teams: [
        { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 200, wagersUsed: 1 },
        { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 400, wagersUsed: 0 },
      ],
    });

    seedPlayStorage(4, session);

    await usePlayStore.getState().hydrate();

    const hydrated = usePlayStore.getState().session;
    expect(hydrated?.step).toBe('board');
    expect(hydrated?.board.length).toBe(2);
    expect(hydrated?.scores.team_1).toBe(200);
    expect(hydrated?.currentTeamId).toBe('team_2');
    expect(hydrated?.usedQuestionIds).toBeInstanceOf(Set);
    expect(Array.from(hydrated?.usedQuestionIds ?? [])).toEqual(['q-board-1']);
  });

  it('requires the correct topic count and charges tokens when the entry is committed', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }

    let result: { ok: boolean; error?: string } | undefined;
    result = usePlayStore.getState().startBoard();

    expect(result).toMatchObject({ ok: true });
    expect(usePlayStore.getState().tokens).toBe(20);
    expect(usePlayStore.getState().session?.step).toBe('board');
    expect(usePlayStore.getState().session?.board.length).toBeGreaterThan(0);

    usePlayStore.getState().commitEntryCharge();

    expect(usePlayStore.getState().tokens).toBe(10);
  });

  it('charges quick play based on the selected topic count', () => {
    for (const [topicCount, expectedTokens] of [
      [1, 18],
      [2, 16],
      [3, 15],
      [4, 13],
      [5, 12],
    ] as const) {
      usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
      usePlayStore.getState().setMode('quickPlay');
      usePlayStore.getState().setQuickPlayTopicCount(topicCount);
      const categories = usePlayStore.getState().session?.availableCategories.slice(0, topicCount) ?? [];

      for (const category of categories) {
        usePlayStore.getState().toggleCategory(category.slug);
      }

      const result = usePlayStore.getState().startBoard();

      expect(result).toMatchObject({ ok: true });
      expect(usePlayStore.getState().tokens).toBe(20);
      usePlayStore.getState().commitEntryCharge();
      expect(usePlayStore.getState().tokens).toBe(expectedTokens);
      expect(usePlayStore.getState().session?.selectedCategoryIds).toHaveLength(topicCount);
    }
  });

  it('only enables hot seat in classic and quick play', () => {
    __setFeatureFlags({ SHOW_HOT_SEAT_UI: true });
    for (const mode of ['classic', 'quickPlay'] as const) {
      usePlayStore.setState({ session: null, tokens: 5, rapidFire: null });
      usePlayStore.getState().setMode(mode);
      usePlayStore.getState().setHotSeatRounds(1);
      expect(usePlayStore.getState().session?.config.hotSeatEnabled).toBe(true);
      expect(usePlayStore.getState().session?.config.hotSeatRounds).toBe(1);
    }

    for (const mode of ['random', 'rumble', 'rapidFire'] as const) {
      usePlayStore.setState({ session: null, tokens: 5, rapidFire: null });
      usePlayStore.getState().setMode(mode);
      usePlayStore.getState().setHotSeatRounds(1);
      expect(usePlayStore.getState().session?.config.hotSeatEnabled).toBe(false);
      expect(usePlayStore.getState().session?.config.hotSeatRounds).toBe(0);
    }
  });

  it('starts hot seat challenges with two named players after scheduled question counts', () => {
    const board = Array.from({ length: 12 }, (_, index) =>
      createQuestion({
        id: `q-board-${index + 1}`,
        canonicalKey: `science:${index + 1}`,
        pointValue: 200,
      })
    );
    const session = createSession({
      step: 'board',
      phase: 'scoring',
      board,
      currentQuestion: board[3],
      usedQuestionIds: new Set(board.slice(0, 4).map((question) => question.id)),
      teams: [
        {
          id: 'team_1',
          name: 'Alpha',
          playerNames: ['Ava', 'Amir'],
          score: 0,
          wagersUsed: 0,
        },
        {
          id: 'team_2',
          name: 'Beta',
          playerNames: ['Bianca', 'Ben'],
          score: 0,
          wagersUsed: 0,
        },
      ],
      scores: { team_1: 0, team_2: 0 },
      config: {
        mode: 'classic',
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava', 'Amir'] },
          { id: 'team_2', name: 'Beta', playerNames: ['Bianca', 'Ben'] },
        ],
        categories: ['science'],
        contentLocaleChain: ['en'],
        quickPlayTopicCount: 3,
        hotSeatEnabled: true,
        hotSeatRounds: 1,
        wagerEnabled: true,
        wagersPerTeam: 3,
      },
      wager: null,
      hotSeat: {
        completedQuestionCount: 3,
        challenges: [
          {
            id: 'hot-seat-team-1-round-1',
            triggerAfterQuestion: 4,
            answeringTeamId: 'team_1',
            participants: [
              { teamId: 'team_1', playerName: 'Ava' },
              { teamId: 'team_2', playerName: 'Bianca' },
            ],
            completed: false,
          },
          {
            id: 'hot-seat-team-2-round-1',
            triggerAfterQuestion: 9,
            answeringTeamId: 'team_2',
            participants: [
              { teamId: 'team_2', playerName: 'Ben' },
              { teamId: 'team_1', playerName: 'Amir' },
            ],
            completed: false,
          },
        ],
      },
    });
    usePlayStore.setState({ session, tokens: 5, rapidFire: null });

    usePlayStore.getState().continueAfterStandardQuestion();

    const hotSeat = usePlayStore.getState().session?.hotSeat;
    expect(usePlayStore.getState().session?.step).toBe('question');
    expect(usePlayStore.getState().session?.currentTeamId).toBe('team_1');
    expect(hotSeat?.activeChallenge?.participants.map((participant) => participant.playerName)).toEqual([
      'Ava',
      'Bianca',
    ]);
    expect(usePlayStore.getState().session?.currentQuestion?.id).toBeDefined();
  });

  it('persists a cleared session while keeping the token balance', async () => {
    seedPlayStorage(7, createSession());

    await usePlayStore.getState().hydrate();

    usePlayStore.getState().resetSession();

    // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
    const stored = JSON.parse(mockStorage.get(STORAGE_KEY) ?? '{}') as {
      state?: { tokens?: number; session?: unknown };
    };

    expect(stored.state?.tokens).toBe(7);
    expect(stored.state?.session).toBeNull();
    expect(usePlayStore.getState().session).toBeNull();
  });

  it('progresses a standard turn from board to answer and rotates to the next team', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }
    usePlayStore.getState().startBoard();

    const session = usePlayStore.getState().session!;
    const question = session.board[0];

    usePlayStore.getState().selectQuestion(question);
    usePlayStore.getState().revealAnswer();
    usePlayStore.getState().awardStandardQuestion('team_1');
    usePlayStore.getState().continueAfterStandardQuestion();

    expect(usePlayStore.getState().session?.step).toBe('board');
    expect(usePlayStore.getState().session?.currentTeamId).toBe('team_2');
    expect(usePlayStore.getState().session?.scores.team_1).toBeGreaterThan(0);
  });

  it('lets the user switch standard-question points between teams without stacking', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }
    usePlayStore.getState().startBoard();

    const question = usePlayStore.getState().session!.board[0];
    usePlayStore.getState().selectQuestion(question);
    usePlayStore.getState().revealAnswer();

    const baseline = usePlayStore.getState().session!;
    const points = baseline.currentQuestion!.pointValue;

    usePlayStore.getState().awardStandardQuestion('team_1');
    expect(usePlayStore.getState().session?.scores.team_1).toBe(baseline.scores.team_1 + points);
    expect(usePlayStore.getState().session?.scores.team_2).toBe(baseline.scores.team_2);

    usePlayStore.getState().awardStandardQuestion('team_2');
    expect(usePlayStore.getState().session?.scores.team_1).toBe(baseline.scores.team_1);
    expect(usePlayStore.getState().session?.scores.team_2).toBe(baseline.scores.team_2 + points);

    usePlayStore.getState().awardStandardQuestion(null);
    expect(usePlayStore.getState().session?.scores.team_1).toBe(baseline.scores.team_1);
    expect(usePlayStore.getState().session?.scores.team_2).toBe(baseline.scores.team_2);
    expect(usePlayStore.getState().session?.lastAwardedTeamId).toBeNull();
  });

  it('logs manual score adjustments and allows scores to go negative', () => {
    const session = createSession({
      teams: [
        { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 25, wagersUsed: 0 },
        { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
      ],
      scores: { team_1: 25, team_2: 0 },
      step: 'board',
      phase: 'wagerDecision',
      currentQuestion: undefined,
      wager: null,
    });

    usePlayStore.setState({ session, tokens: 5, rapidFire: null });

    // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
    const store = usePlayStore.getState() as typeof usePlayStore extends { getState: () => infer T } ? T : never;
    // SAFETY: Controlled test fixture boundary cast.
    (store as any).adjustScoreByPoints('team_1', -50, 'host correction');

    const adjusted = usePlayStore.getState().session;

    expect(adjusted?.scores.team_1).toBe(-25);
    expect(adjusted?.teams.find((team) => team.id === 'team_1')?.score).toBe(-25);
    expect(adjusted?.scoreEvents.at(-1)).toMatchObject({
      teamId: 'team_1',
      points: -50,
      reason: 'manualAdjustment',
      metadata: { note: 'host correction' },
    });
  });

  it('stores the last resolved answer and can reopen it after leaving the answer screen', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }
    usePlayStore.getState().startBoard();

    const question = usePlayStore.getState().session!.board[0];
    usePlayStore.getState().selectQuestion(question);
    usePlayStore.getState().revealAnswer();
    usePlayStore.getState().awardStandardQuestion('team_1');
    usePlayStore.getState().continueAfterStandardQuestion();

    const resolved = usePlayStore.getState().session?.lastResolvedTurn;
    expect(resolved).toMatchObject({
      question: expect.objectContaining({ id: question.id }),
      awardedTeamId: 'team_1',
    });

    // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
    (usePlayStore.getState() as any).reopenLastResolvedTurn();

    expect(usePlayStore.getState().session?.step).toBe('answer');
    expect(usePlayStore.getState().session?.currentQuestion?.id).toBe(question.id);
  });

  it('rejects wagers in randomiser and rumble modes', () => {
    for (const mode of ['random', 'rumble', 'rapidFire'] as const) {
      usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
      usePlayStore.getState().ensureDraft();
      usePlayStore.getState().setMode(mode);
      expect(usePlayStore.getState().session?.config.wagerEnabled).toBe(false);

      const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];
      for (const category of categories) {
        usePlayStore.getState().toggleCategory(category.slug);
      }
      usePlayStore.getState().startBoard();

      const firstQuestion = usePlayStore.getState().session!.board[0];
      usePlayStore.getState().selectQuestion(firstQuestion);
      usePlayStore.getState().revealAnswer();
      usePlayStore.getState().awardStandardQuestion('team_1');

      let result: { ok: boolean; error?: string } | undefined;
      result = usePlayStore.getState().initiateWager();
      expect(result).toMatchObject({ ok: false });
    }
  });

  it('supports the wager loop on the next team and restores turn control after resolution', () => {
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    const store = usePlayStore.getState();
    store.setMode('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }
    usePlayStore.getState().startBoard();

    const firstQuestion = usePlayStore.getState().session!.board[0];

    usePlayStore.getState().selectQuestion(firstQuestion);
    usePlayStore.getState().revealAnswer();
    usePlayStore.getState().awardStandardQuestion('team_1');

    let result: { ok: boolean; error?: string } | undefined;
    result = usePlayStore.getState().initiateWager();

    expect(result).toMatchObject({ ok: true });
    expect(usePlayStore.getState().session?.currentTeamId).toBe('team_2');
    expect(usePlayStore.getState().session?.wager?.wageringTeamId).toBe('team_1');

    usePlayStore.getState().confirmRandomWagerQuestion();
    usePlayStore.getState().resolveWager(false);

    expect(usePlayStore.getState().session?.wager).toBeNull();
    expect(usePlayStore.getState().session?.currentTeamId).toBe('team_1');
  });

  it('applies a wager penalty on timeout, reveals the answer, and returns control after continue', () => {
    const question = createQuestion({ id: 'q-timeout-wager', canonicalKey: 'science:200:timeout-wager' });
    const nextQuestion = createQuestion({ id: 'q-after-timeout', canonicalKey: 'science:200:after-timeout' });
    usePlayStore.setState({
      session: createSession({
        step: 'question',
        phase: 'questionReveal',
        currentTeamId: 'team_1',
        currentQuestion: question,
        board: [question, nextQuestion],
        usedQuestionIds: new Set([question.id]),
        wager: {
          wageringTeamId: 'team_2',
          targetTeamId: 'team_1',
          multiplier: 1.5,
          question,
        },
      }),
    });

    usePlayStore.getState().expireCurrentQuestionForTimeout();

    expect(usePlayStore.getState().session).toMatchObject({
      step: 'answer',
      phase: 'scoring',
      wager: null,
      lastAwardedTeamId: null,
      timedOutQuestionId: question.id,
      currentTeamId: 'team_1',
      scores: { team_1: 100, team_2: 500 },
    });
    expect(usePlayStore.getState().session?.scoreEvents[0]).toMatchObject({
      teamId: 'team_1',
      points: -200,
      reason: 'wager',
      questionId: question.id,
      metadata: { timeout: true },
    });

    usePlayStore.getState().continueAfterStandardQuestion();

    expect(usePlayStore.getState().session?.currentTeamId).toBe('team_2');
  });

  it('ignores corrupt storage and falls back to defaults', async () => {
    mockStorage.set(STORAGE_KEY, '{not valid json');

    await usePlayStore.getState().hydrate();

    expect(usePlayStore.getState().tokens).toBe(5);
    expect(usePlayStore.getState().session).toBeNull();
  });

  it('does not deduct local tokens when auth is enabled (server owns balance)', () => {
    __setAuthDisabled(false);
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    usePlayStore.getState().startModeSession('classic');
    const categories = usePlayStore.getState().session?.availableCategories.slice(0, 6) ?? [];

    for (const category of categories) {
      usePlayStore.getState().toggleCategory(category.slug);
    }

    expect(usePlayStore.getState().tokens).toBe(20);
    expect(usePlayStore.getState().session?.config.entryTokenCharge).toBe(0);

    const boardResult = usePlayStore.getState().startBoard();
    expect(boardResult).toMatchObject({ ok: true });
    expect(usePlayStore.getState().tokens).toBe(20);
    expect(usePlayStore.getState().session?.config.entryTokenCharge).toBe(10);
  });
});

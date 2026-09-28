import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  assignRandomQuestionOwners,
  buildBoard,
  defaultTopicCountForMode,
  getBonusQuestion,
  getModeCategoryCount,
  getPlayableCategories,
  getRandomRemainingQuestion,
} from '@/features/play/data';
import {
  getGameTokenCost,
  normalizeQuickPlayTopicCount,
} from '@/features/play/tokenCosts';
import {
  RUMBLE_SECOND_TEAM_REVEAL_SECONDS,
  canRevealRumbleAnswer,
  getNextRumbleCheckpointSeconds,
  getRumbleElapsedSeconds,
  groupRumbleQuestionsByValueBucket,
  isRumbleTeamCountAllowed,
  rumbleQuestionsPerDifficulty,
  snapRumbleTeamCount,
} from '@/features/play/rumble';
import type {
  AnswerReviewState,
  BonusChallengeState,
  GameConfig,
  GameMode,
  GameSessionState,
  HotSeatChallenge,
  HotSeatState,
  QuestionCard,
  RapidFireState,
  ScoreEvent,
  TeamConfig,
  TeamState,
  WagerState,
} from '@/features/shared';
import { getResolvedContentLocaleChain, type ContentLocale } from '@/lib/i18n/config';
import {
  deserializeGameSession,
  deserializeRapidFire,
  type PersistedPlayState,
  serializeGameSession,
  serializeRapidFire,
} from '@/store/gameSessionPersistence';
import { SHOW_HOT_SEAT_UI } from '@/constants/featureFlags';
import { isActiveMatchStep } from '@/features/play/sessionRouting';
import { useLocaleStore } from '@/store/locale';
import { isAuthDisabled } from '@/lib/authMode';

const DEFAULT_TEAMS: TeamState[] = [
  { id: 'team_1', name: 'Team 1', playerNames: ['Player 1'], score: 0, wagersUsed: 0 },
  { id: 'team_2', name: 'Team 2', playerNames: ['Player 1'], score: 0, wagersUsed: 0 },
];

const DEFAULT_WAGERS_PER_TEAM = 1;
const DEFAULT_BONUS: BonusChallengeState = {
  active: false,
  played: false,
  multiplier: 2,
};

const MAX_HOT_SEAT_ROUNDS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createDefaultTeam(index: number): TeamState {
  return {
    id: `team_${index + 1}`,
    name: `Team ${index + 1}`,
    playerNames: ['Player 1'],
    score: 0,
    wagersUsed: 0,
  };
}

function cloneTeam(team: TeamState, index: number): TeamState {
  return {
    id: team.id || `team_${index + 1}`,
    name: team.name || `Team ${index + 1}`,
    playerNames: team.playerNames?.length ? [...team.playerNames] : ['Player 1'],
    score: team.score ?? 0,
    wagersUsed: team.wagersUsed ?? 0,
  };
}

function normalizeTeamsForMode(
  mode: GameMode,
  teams: TeamState[],
  topicCount?: number
): TeamState[] {
  const desiredCount =
    mode === 'rumble' ? snapRumbleTeamCount(topicCount, teams.length) : 2;
  const normalized = (teams.length ? teams : DEFAULT_TEAMS)
    .slice(0, desiredCount)
    .map(cloneTeam);

  while (normalized.length < desiredCount) {
    normalized.push(createDefaultTeam(normalized.length));
  }

  return normalized;
}

function isWagerAvailable(mode: GameMode): boolean {
  return mode !== 'random' && mode !== 'rumble' && mode !== 'rapidFire';
}

function isHotSeatAvailable(mode: GameMode): boolean {
  if (!SHOW_HOT_SEAT_UI) return false;
  return mode === 'classic' || mode === 'quickPlay';
}

function buildScores(teams: TeamState[]): Record<string, number> {
  return teams.reduce<Record<string, number>>((scores, team) => {
    scores[team.id] = team.score;
    return scores;
  }, {});
}

function getDefaultConfig(
  mode: GameMode = 'classic',
  teams: TeamState[] = DEFAULT_TEAMS,
  contentLocaleChain: ContentLocale[] = ['en']
): GameConfig {
  const topicCount = defaultTopicCountForMode(mode);
  const normalizedTeams = normalizeTeamsForMode(mode, teams, topicCount);
  const teamConfigs: TeamConfig[] = normalizedTeams.map(({ id, name, playerNames }) => ({
    id,
    name,
    playerNames,
  }));

  return {
    mode,
    teams: teamConfigs,
    categories: [],
    contentLocaleChain,
    quickPlayTopicCount: defaultTopicCountForMode(mode),
    hotSeatEnabled: false,
    hotSeatRounds: 0,
    wagerEnabled: isWagerAvailable(mode),
    wagersPerTeam: DEFAULT_WAGERS_PER_TEAM,
    entryTokenCharge: 0,
  };
}

function createDraftSession(): GameSessionState {
  const contentLocaleChain = getResolvedContentLocaleChain(
    useLocaleStore.getState().contentLocales
  );
  const teams = DEFAULT_TEAMS.map((team) => ({
    ...team,
    playerNames: [...(team.playerNames ?? [])],
  }));

  return {
    id: `play_${Date.now()}`,
    mode: 'classic',
    config: getDefaultConfig('classic', teams, contentLocaleChain),
    contentLocaleChain,
    step: 'hub',
    phase: 'lobby',
    availableCategories: getPlayableCategories(contentLocaleChain),
    selectedCategoryIds: [],
    board: [],
    teams,
    scores: buildScores(teams),
    usedQuestionIds: new Set(),
    seed: `seed_${Date.now()}`,
    wagersPerTeam: DEFAULT_WAGERS_PER_TEAM,
    wager: null,
    bonus: { ...DEFAULT_BONUS },
    scoreEvents: [],
    lastResolvedTurn: undefined,
  };
}

/** Completed Quick Play session for local winner-screen debugging. */
function createDebugWinnerSession(): GameSessionState {
  const contentLocaleChain = getResolvedContentLocaleChain(
    useLocaleStore.getState().contentLocales
  );
  const teams: TeamState[] = [
    {
      id: 'team_1',
      name: 'Team 1',
      playerNames: ['Player 1'],
      score: 3100,
      wagersUsed: 0,
    },
    {
      id: 'team_2',
      name: 'Team 2',
      playerNames: ['Player 1'],
      score: 300,
      wagersUsed: 0,
    },
  ];
  const reviewQuestion: QuestionCard = {
    id: 'debug_end_q1',
    canonicalKey: 'debug:100:0',
    categoryId: 'debug_topic',
    categoryName: 'Debug Topic',
    prompt: 'Debug review prompt — what is 2 + 2?',
    answer: '4',
    pointValue: 100,
    locale: contentLocaleChain[0] ?? 'en',
    resolvedFromFallback: false,
    used: true,
  };

  return {
    id: `debug_end_${Date.now()}`,
    mode: 'quickPlay',
    config: {
      ...getDefaultConfig('quickPlay', teams, contentLocaleChain),
      categories: ['debug_topic'],
      quickPlayTopicCount: 3,
      entryTokenCharge: 0,
    },
    contentLocaleChain,
    step: 'end',
    phase: 'completed',
    availableCategories: getPlayableCategories(contentLocaleChain),
    selectedCategoryIds: ['debug_topic'],
    board: [reviewQuestion],
    teams,
    scores: buildScores(teams),
    usedQuestionIds: new Set([reviewQuestion.id]),
    seed: `debug_seed_${Date.now()}`,
    wagersPerTeam: DEFAULT_WAGERS_PER_TEAM,
    wager: null,
    bonus: { ...DEFAULT_BONUS, played: true },
    scoreEvents: [],
    lastResolvedTurn: buildLastResolvedTurn(reviewQuestion, 'team_1', 100),
    lastAwardedTeamId: 'team_1',
  };
}

function getOtherTeamId(teams: TeamState[], teamId?: string): string | undefined {
  return teams.find((team) => team.id !== teamId)?.id;
}

function syncConfig(session: GameSessionState): GameConfig {
  const cfg = session.config;
  const hotSeatRoundsRaw =
    cfg.hotSeatRounds !== undefined ? cfg.hotSeatRounds : cfg.hotSeatEnabled ? 1 : 0;
  const hotSeatRounds = isHotSeatAvailable(session.mode)
    ? clamp(hotSeatRoundsRaw, 0, MAX_HOT_SEAT_ROUNDS)
    : 0;

  return {
    ...cfg,
    mode: session.mode,
    teams: session.teams.map(({ id, name, playerNames }) => ({ id, name, playerNames })),
    categories: session.selectedCategoryIds,
    contentLocaleChain: session.contentLocaleChain,
    quickPlayTopicCount: getModeCategoryCount(session.mode, session.config.quickPlayTopicCount),
    wagerEnabled: isWagerAvailable(session.mode),
    wagersPerTeam: session.wagersPerTeam,
    entryTokenCharge: cfg.entryTokenCharge ?? 0,
    hotSeatRounds,
    hotSeatEnabled: hotSeatRounds > 0,
  };
}

/** Clears Hot Seat from persisted sessions when the product surface is disabled. */
function stripHotSeatSurfaceWhenDisabled(session: GameSessionState): GameSessionState {
  if (SHOW_HOT_SEAT_UI) return session;
  return {
    ...session,
    hotSeat: undefined,
    config: syncConfig({
      ...session,
      config: { ...session.config, hotSeatRounds: 0, hotSeatEnabled: false },
    }),
  };
}

/**
 * Always re-read topics from the current questions bundle on hydrate.
 * Persisted availableCategories go stale when topics/images ship in a new deploy.
 */
function withFreshAvailableCategories(session: GameSessionState): GameSessionState {
  const availableCategories = getPlayableCategories(session.contentLocaleChain);
  if (isActiveMatchStep(session.step)) {
    return { ...session, availableCategories };
  }

  const availableSlugs = new Set(availableCategories.map((category) => category.slug));
  const selectedCategoryIds = (session.selectedCategoryIds ?? []).filter((slug) =>
    availableSlugs.has(slug)
  );

  return {
    ...session,
    availableCategories,
    selectedCategoryIds,
    config: {
      ...session.config,
      categories: selectedCategoryIds,
    },
  };
}

function withScores(teams: TeamState[]): { teams: TeamState[]; scores: Record<string, number> } {
  return {
    teams,
    scores: buildScores(teams),
  };
}

/** Zero scores and strip in-match fields so a new setup cannot continue a prior board. */
function freshSetupMatchFields(teams: TeamState[]): Pick<
  GameSessionState,
  | 'teams'
  | 'scores'
  | 'board'
  | 'usedQuestionIds'
  | 'currentQuestion'
  | 'currentTeamId'
  | 'lastAwardedTeamId'
  | 'timedOutQuestionId'
  | 'timerStartedAt'
  | 'scoreEvents'
  | 'wager'
  | 'hotSeat'
  | 'bonus'
  | 'lastResolvedTurn'
  | 'seed'
  | 'overtime'
  | 'reviewingUsedQuestion'
  | 'lifelineRuntime'
> {
  const zeroedTeams = teams.map((team) => ({
    ...team,
    score: 0,
    wagersUsed: 0,
  }));
  return {
    ...withScores(zeroedTeams),
    board: [],
    usedQuestionIds: new Set(),
    currentQuestion: undefined,
    currentTeamId: undefined,
    lastAwardedTeamId: undefined,
    timedOutQuestionId: undefined,
    timerStartedAt: undefined,
    scoreEvents: [],
    wager: null,
    hotSeat: undefined,
    bonus: { ...DEFAULT_BONUS },
    lastResolvedTurn: undefined,
    seed: `seed_${Date.now()}`,
    overtime: undefined,
    reviewingUsedQuestion: undefined,
    lifelineRuntime: undefined,
  };
}

function shuffleItems<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function buildBalancedTeamSequence(teamIds: string[], repeats: number): string[] {
  const sequence: string[] = [];

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    sequence.push(...shuffleItems(teamIds));
  }

  return shuffleItems(sequence);
}

function getRumbleValidationError(
  board: QuestionCard[],
  teamCount: number,
  topicCount: number
): string | null {
  if (!isRumbleTeamCountAllowed(topicCount, teamCount)) {
    return 'Rumble supports 2, 3, 4, or 6 teams.';
  }

  const expectedPerBucket = rumbleQuestionsPerDifficulty(topicCount);
  const byValueBucket = groupRumbleQuestionsByValueBucket(board);
  if (!byValueBucket) {
    return `Rumble requires exactly ${expectedPerBucket} questions in each 100, 200, and 300 value bucket.`;
  }

  for (const questions of byValueBucket.values()) {
    if (questions.length !== expectedPerBucket || questions.length % teamCount !== 0) {
      return 'Rumble questions cannot be balanced for this team count.';
    }
  }

  return null;
}

function assignRumbleQuestionParties(
  board: QuestionCard[],
  teams: TeamState[],
  topicCount: number
): { ok: true; board: QuestionCard[] } | { ok: false; error: string } {
  const validationError = getRumbleValidationError(board, teams.length, topicCount);
  if (validationError) return { ok: false, error: validationError };

  const teamIds = teams.map((team) => team.id);
  const byValueBucket = groupRumbleQuestionsByValueBucket(board);
  if (!byValueBucket) {
    return {
      ok: false,
      error: `Rumble requires exactly ${rumbleQuestionsPerDifficulty(topicCount)} questions in each 100, 200, and 300 value bucket.`,
    };
  }

  const assignments = new Map<string, Pick<QuestionCard, 'rumbleFirstTeamId' | 'rumbleSecondTeamId'>>();

  for (const questions of byValueBucket.values()) {
    const shuffledQuestions = shuffleItems(questions);
    const repeatsPerTeam = questions.length / teamIds.length;
    const firstTeams = buildBalancedTeamSequence(teamIds, repeatsPerTeam);
    const secondTeamOrder = shuffleItems(teamIds);
    const secondOffset = 1 + Math.floor(Math.random() * (teamIds.length - 1));

    shuffledQuestions.forEach((question, index) => {
      const firstTeamId = firstTeams[index]!;
      const firstIndex = secondTeamOrder.indexOf(firstTeamId);
      const secondTeamId = secondTeamOrder[(firstIndex + secondOffset) % secondTeamOrder.length]!;

      assignments.set(question.id, {
        rumbleFirstTeamId: firstTeamId,
        rumbleSecondTeamId: secondTeamId,
      });
    });
  }

  return {
    ok: true,
    board: board.map((question) => ({
      ...question,
      ...assignments.get(question.id),
    })),
  };
}

function getHotSeatPlayerName(team: TeamState, index: number): string {
  const players = team.playerNames?.filter((name) => name.trim().length > 0) ?? [];
  return players[index % Math.max(players.length, 1)] ?? team.name;
}

function buildHotSeatState(teams: TeamState[], rounds: number): HotSeatState | undefined {
  const hotSeatRounds = clamp(rounds, 0, MAX_HOT_SEAT_ROUNDS);
  if (hotSeatRounds <= 0 || teams.length < 2) return undefined;

  const challenges: HotSeatChallenge[] = [];

  for (let round = 0; round < hotSeatRounds; round += 1) {
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
      const answeringTeam = teams[teamIndex]!;
      const opposingTeam = teams[(teamIndex + 1) % teams.length]!;
      const playerIndex = round * teams.length + teamIndex;

      challenges.push({
        id: `hot-seat-${answeringTeam.id}-round-${round + 1}`,
        triggerAfterQuestion: 4 + challenges.length * 5,
        answeringTeamId: answeringTeam.id,
        participants: [
          {
            teamId: answeringTeam.id,
            playerName: getHotSeatPlayerName(answeringTeam, playerIndex),
          },
          {
            teamId: opposingTeam.id,
            playerName: getHotSeatPlayerName(opposingTeam, playerIndex),
          },
        ],
        completed: false,
      });
    }
  }

  return {
    completedQuestionCount: 0,
    challenges,
  };
}

function completeActiveHotSeat(hotSeat: HotSeatState | undefined): HotSeatState | undefined {
  if (!hotSeat?.activeChallenge) return hotSeat;

  const activeChallenge = hotSeat.activeChallenge;
  return {
    ...hotSeat,
    activeChallenge: undefined,
    challenges: hotSeat.challenges.map((challenge) =>
      challenge.id === activeChallenge.id
        ? {
            ...challenge,
            question: activeChallenge.question,
            completed: true,
          }
        : challenge
    ),
  };
}

function createScoreEvent(
  session: GameSessionState,
  event: Omit<ScoreEvent, 'turnIndex' | 'createdAt'>
): ScoreEvent {
  return {
    ...event,
    turnIndex: session.scoreEvents.length,
    createdAt: Date.now(),
  };
}

function withUpdatedTeamScore(teams: TeamState[], teamId: string, delta: number): TeamState[] {
  return teams.map((team) =>
    team.id === teamId ? { ...team, score: team.score + delta } : team
  );
}

function buildLastResolvedTurn(
  question: QuestionCard,
  awardedTeamId: string | null | undefined,
  pointsAwarded: number
): AnswerReviewState {
  return {
    question,
    awardedTeamId,
    pointsAwarded,
    revealedAt: Date.now(),
  };
}

function getWagerScoreDelta(basePoints: number, multiplier: WagerState['multiplier'], correct: boolean): number {
  const delta =
    multiplier === 0.5
      ? correct
        ? basePoints * 0.5
        : -basePoints * 0.5
      : multiplier === 1.5
        ? correct
          ? basePoints * 1.5
          : -basePoints
        : correct
          ? basePoints * 2
          : -basePoints * 1.5;

  return Math.round(delta);
}

interface PlayStore {
  tokens: number;
  session: GameSessionState | null;
  rapidFire: RapidFireState | null;
  askedCanonicalKeys: string[];
  hydrate: () => Promise<void>;
  ensureDraft: () => void;
  resetSession: () => void;
  commitEntryCharge: () => void;
  grantTokens: (amount: number) => void;
  setTokenBalance: (amount: number) => void;
  entryReservationId: string | null;
  setEntryReservationId: (id: string | null) => void;
  startModeSession: (mode: GameMode) => { ok: boolean; error?: string };
  setMode: (mode: GameMode) => void;
  setTeamCount: (count: number) => void;
  setQuickPlayTopicCount: (count: number) => void;
  setTopicCount: (count: number) => void;
  updateTeamName: (teamId: string, name: string) => void;
  addTeamMember: (teamId: string) => void;
  removeTeamMember: (teamId: string) => void;
  updateTeamMemberName: (teamId: string, index: number, name: string) => void;
  setWagersPerTeam: (count: number) => void;
  setHotSeatRounds: (count: number) => void;
  toggleCategory: (slug: string) => void;
  setCategories: (slugs: string[]) => void;
  startBoard: () => { ok: boolean; error?: string };
  selectQuestion: (question: QuestionCard) => void;
  reviewBoardQuestion: (question: QuestionCard) => void;
  cancelCurrentQuestion: () => void;
  /** Jump the Rumble timer to the next stage checkpoint (team reveal / lock-in). */
  skipRumbleWait: () => { ok: boolean; error?: string };
  revealAnswer: () => { ok: boolean; error?: string };
  expireCurrentQuestionForTimeout: () => void;
  awardStandardQuestion: (teamId: string | null) => void;
  continueAfterStandardQuestion: () => void;
  adjustScoreByPoints: (teamId: string, delta: number, note?: string) => void;
  reopenLastResolvedTurn: () => void;
  reviewCompletedBoard: () => void;
  returnToEndScreen: () => void;
  /** Dev-only helper: seed a completed match so `/play/end` can be opened instantly. */
  loadDebugWinnerSession: () => void;
  initiateWager: () => { ok: boolean; error?: string };
  confirmRandomWagerQuestion: (drawnQuestion?: QuestionCard) => void;
  resolveWager: (correct: boolean) => void;
}

function mergePersistedPlayState(
  persistedState: unknown,
  currentState: PlayStore
): PlayStore {
  if (!persistedState || typeof persistedState !== 'object') {
    return currentState;
  }

  const partialState = persistedState as Partial<PersistedPlayState>;
  const nextTokens =
    typeof partialState.tokens === 'number' && Number.isFinite(partialState.tokens)
      ? partialState.tokens
      : currentState.tokens;
  const nextAskedCanonicalKeys = Array.isArray(partialState.askedCanonicalKeys)
    ? [...new Set(partialState.askedCanonicalKeys.filter((key): key is string => typeof key === 'string'))]
    : currentState.askedCanonicalKeys;

  if (partialState.session === null) {
    return {
      ...currentState,
      tokens: nextTokens,
      session: null,
      askedCanonicalKeys: nextAskedCanonicalKeys,
    };
  }

  const nextSessionRaw =
    partialState.session === undefined
      ? currentState.session
      : deserializeGameSession(partialState.session) ?? currentState.session;

  const nextSession =
    nextSessionRaw === null || nextSessionRaw === undefined
      ? nextSessionRaw
      : withFreshAvailableCategories(stripHotSeatSurfaceWhenDisabled(nextSessionRaw));

  const nextRapidFire =
    partialState.rapidFire === undefined
      ? currentState.rapidFire
      : deserializeRapidFire(partialState.rapidFire);

  const nextEntryReservationId =
    'entryReservationId' in partialState &&
    typeof (partialState as Record<string, unknown>).entryReservationId === 'string'
      ? (partialState as Record<string, unknown>).entryReservationId as string
      : currentState.entryReservationId;

  return {
    ...currentState,
    tokens: nextTokens,
    session: nextSession,
    rapidFire: nextRapidFire,
    entryReservationId: nextEntryReservationId,
    askedCanonicalKeys: nextAskedCanonicalKeys,
  };
}

/** Keeps one store instance across Metro Fast Refresh so play state + navigation guards stay consistent. */
function createPlayStore() {
  return create<PlayStore>()(
  persist(
    (set, get) => ({
      // Signed-out / pre-auth default is 0. Signed-in balances come from Convex
      // via useWalletSync; auth-disabled local mode can still grant/set tokens.
      tokens: 0,
      session: null,
      rapidFire: null,
      askedCanonicalKeys: [],
      entryReservationId: null,
      hydrate: async () => {
        await usePlayStore.persist.rehydrate();
      },

      ensureDraft: () => {
        // Avoid persisting default tokens/session before rehydrate - child screens use
        // useLayoutEffect and can run before AppHydration's hydrate() effect, which would
        // overwrite AsyncStorage with the initial token balance (see zustand persist setState → setItem).
        if (!usePlayStore.persist.hasHydrated()) {
          return;
        }
        if (!get().session) {
          set({ session: createDraftSession() });
        }
      },

      resetSession: () => set({ session: null, rapidFire: null, entryReservationId: null }),
      commitEntryCharge: () =>
        set((state) => {
          if (!isAuthDisabled() || !state.session) return state;
          const charge = state.session.config.entryTokenCharge ?? 0;
          if (charge <= 0) return state;
          return {
            tokens: Math.max(0, state.tokens - charge),
            session: {
              ...state.session,
              config: { ...state.session.config, entryTokenCharge: 0 },
            },
          };
        }),

      grantTokens: (amount) =>
        set((state) => ({ tokens: Math.max(0, state.tokens + amount) })),
      setTokenBalance: (amount) =>
        set({ tokens: Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0)) }),
      setEntryReservationId: (id) => set({ entryReservationId: id }),

      startModeSession: (mode) => {
        const state = get();
        const tokenCost = getGameTokenCost(mode, mode === 'quickPlay' ? 3 : undefined);
        if (state.tokens < tokenCost) {
          return { ok: false, error: 'You need more tokens to start a new game.' };
        }
        set((current) => {
          const session = withFreshAvailableCategories(current.session ?? createDraftSession());
          const topicCount = defaultTopicCountForMode(mode);
          const teams = normalizeTeamsForMode(mode, session.teams, topicCount);
          const nextStep = mode === 'quickPlay' ? 'quick-play-length' : 'team-setup';
          const nextSession: GameSessionState = {
            ...session,
            id: `play_${Date.now()}`,
            mode,
            contentLocaleChain: session.contentLocaleChain,
            step: nextStep,
            phase: 'lobby',
            selectedCategoryIds: [],
            ...freshSetupMatchFields(teams),
          };
          nextSession.config = syncConfig({
            ...nextSession,
            config: {
              ...nextSession.config,
              mode,
              wagerEnabled: isWagerAvailable(mode),
              // Charge only when the board starts (topics chosen).
              entryTokenCharge: 0,
              quickPlayTopicCount: topicCount,
            },
          });
          return { session: nextSession, entryReservationId: null };
        });
        return { ok: true };
      },

      setMode: (mode) =>
        set((state) => {
          const session = withFreshAvailableCategories(state.session ?? createDraftSession());
          const topicCount = defaultTopicCountForMode(mode);
          const teams = normalizeTeamsForMode(mode, session.teams, topicCount);
          const nextStep = mode === 'quickPlay' ? 'quick-play-length' : 'team-setup';
          const nextSession: GameSessionState = {
            ...session,
            id: `play_${Date.now()}`,
            mode,
            contentLocaleChain: session.contentLocaleChain,
            step: nextStep,
            phase: 'lobby',
            selectedCategoryIds: [],
            ...freshSetupMatchFields(teams),
          };
          nextSession.config = syncConfig({
            ...nextSession,
            config: {
              ...nextSession.config,
              mode,
              wagerEnabled: isWagerAvailable(mode),
              entryTokenCharge: 0,
              quickPlayTopicCount: topicCount,
            },
          });
          return { session: nextSession };
        }),

      setTeamCount: (count) =>
        set((state) => {
          if (!state.session) return state;

          if (state.session.mode === 'rumble') {
            const topicCount = getModeCategoryCount(
              'rumble',
              state.session.config.quickPlayTopicCount
            );
            if (!isRumbleTeamCountAllowed(topicCount, count)) return state;
          }

          const desiredCount = state.session.mode === 'rumble' ? count : 2;
          const teams = state.session.teams.slice(0, desiredCount).map(cloneTeam);

          while (teams.length < desiredCount) {
            teams.push(createDefaultTeam(teams.length));
          }

          const session = {
            ...state.session,
            ...withScores(teams),
            hotSeat: undefined,
          };
          session.config = syncConfig(session);
          return { session };
        }),

      setQuickPlayTopicCount: (count) =>
        set((state) => {
          const base = withFreshAvailableCategories(state.session ?? createDraftSession());
          const quickPlayTopicCount = normalizeQuickPlayTopicCount(count);
          const teams = normalizeTeamsForMode('quickPlay', base.teams, quickPlayTopicCount);
          const session: GameSessionState = {
            ...base,
            id: `play_${Date.now()}`,
            mode: 'quickPlay',
            step: 'team-setup',
            phase: 'lobby',
            selectedCategoryIds: [],
            ...freshSetupMatchFields(teams),
            config: {
              ...base.config,
              mode: 'quickPlay',
              quickPlayTopicCount,
            },
          };
          session.config = syncConfig(session);
          return { session };
        }),

      setTopicCount: (count) =>
        set((state) => {
          const session = state.session;
          if (!session || (session.mode !== 'random' && session.mode !== 'rumble')) {
            return state;
          }
          const topicCount = getModeCategoryCount(session.mode, count);
          const teams = normalizeTeamsForMode(session.mode, session.teams, topicCount);
          const nextSession: GameSessionState = {
            ...session,
            selectedCategoryIds: [],
            ...withScores(teams),
            hotSeat: undefined,
            config: {
              ...session.config,
              quickPlayTopicCount: topicCount,
            },
          };
          nextSession.config = syncConfig(nextSession);
          return { session: nextSession };
        }),

      updateTeamName: (teamId, name) =>
        set((state) => {
          if (!state.session) return state;
          const teams = state.session.teams.map((team) =>
            team.id === teamId ? { ...team, name } : team
          );
          const session = {
            ...state.session,
            ...withScores(teams),
          };
          session.config = syncConfig(session);
          return { session };
        }),

      addTeamMember: (teamId) =>
        set((state) => {
          if (!state.session) return state;
          const teams = state.session.teams.map((team) =>
            team.id === teamId
              ? {
                  ...team,
                  playerNames: [
                    ...(team.playerNames ?? []),
                    `Player ${(team.playerNames?.length ?? 0) + 1}`,
                  ],
                }
              : team
          );
          const session = { ...state.session, ...withScores(teams) };
          session.config = syncConfig(session);
          return { session };
        }),

      removeTeamMember: (teamId) =>
        set((state) => {
          if (!state.session) return state;
          const teams = state.session.teams.map((team) =>
            team.id === teamId
              ? {
                  ...team,
                  playerNames:
                    (team.playerNames?.length ?? 0) > 1
                      ? team.playerNames?.slice(0, -1)
                      : team.playerNames,
                }
              : team
          );
          const session = { ...state.session, ...withScores(teams) };
          session.config = syncConfig(session);
          return { session };
        }),

      updateTeamMemberName: (teamId, index, name) =>
        set((state) => {
          if (!state.session) return state;
          const teams = state.session.teams.map((team) => {
            if (team.id !== teamId) return team;
            const nextPlayers = [...(team.playerNames ?? [])];
            nextPlayers[index] = name;
            return { ...team, playerNames: nextPlayers };
          });
          const session = { ...state.session, ...withScores(teams) };
          session.config = syncConfig(session);
          return { session };
        }),

      setWagersPerTeam: (count) =>
        set((state) => {
          if (!state.session) return state;
          const session = {
            ...state.session,
            wagersPerTeam: Math.max(0, Math.min(9, count)),
          };
          session.config = syncConfig(session);
          return { session };
        }),

      setHotSeatRounds: (count) =>
        set((state) => {
          if (!state.session) return state;
          const hotSeatRounds = isHotSeatAvailable(state.session.mode)
            ? clamp(count, 0, MAX_HOT_SEAT_ROUNDS)
            : 0;
          const session: GameSessionState = {
            ...state.session,
            config: {
              ...state.session.config,
              hotSeatRounds,
              hotSeatEnabled: hotSeatRounds > 0,
            },
          };
          session.config = syncConfig(session);
          return { session };
        }),

      toggleCategory: (slug) =>
        set((state) => {
          if (!state.session) return state;
          const max = getModeCategoryCount(
            state.session.mode,
            state.session.config.quickPlayTopicCount
          );
          const isSelected = state.session.selectedCategoryIds.includes(slug);
          const selectedCategoryIds = isSelected
            ? state.session.selectedCategoryIds.filter((item) => item !== slug)
            : state.session.selectedCategoryIds.length < max
              ? [...state.session.selectedCategoryIds, slug]
              : state.session.selectedCategoryIds;
          const session = {
            ...state.session,
            step: 'categories' as const,
            selectedCategoryIds,
          };
          session.config = syncConfig(session);
          return { session };
        }),

      setCategories: (slugs) =>
        set((state) => {
          if (!state.session) return state;
          const session = {
            ...state.session,
            step: 'categories' as const,
            selectedCategoryIds: slugs,
          };
          session.config = syncConfig(session);
          return { session };
        }),

      startBoard: () => {
        const state = get();
        const session = state.session;
        if (!session) return { ok: false, error: 'No session found.' };
        const topicCount = getModeCategoryCount(session.mode, session.config.quickPlayTopicCount);
        if (session.selectedCategoryIds.length !== topicCount) {
          return { ok: false, error: `Select ${topicCount} topics to continue.` };
        }
        const tokenCost = getGameTokenCost(session.mode, session.config.quickPlayTopicCount);
        const entryTokenCharge = session.config.entryTokenCharge ?? 0;
        const remainingTokenCost = Math.max(0, tokenCost - entryTokenCharge);
        const requiredBalance = isAuthDisabled() ? tokenCost : remainingTokenCost;
        if (state.tokens < requiredBalance) {
          return { ok: false, error: 'You need more tokens to start a new game.' };
        }
        if (session.mode === 'rumble' && !isRumbleTeamCountAllowed(topicCount, session.teams.length)) {
          return { ok: false, error: 'Rumble supports 2, 3, 4, or 6 teams.' };
        }
        const teams = normalizeTeamsForMode(session.mode, session.teams, topicCount).map((team) => ({
          ...team,
          score: 0,
          wagersUsed: 0,
        }));
        const rawBoard = buildBoard(
          session.selectedCategoryIds,
          session.contentLocaleChain,
          new Set(state.askedCanonicalKeys)
        );
        const rumbleAssignment =
          session.mode === 'rumble'
            ? assignRumbleQuestionParties(rawBoard, teams, topicCount)
            : null;
        if (rumbleAssignment && !rumbleAssignment.ok) {
          return { ok: false, error: rumbleAssignment.error };
        }
        const board = rumbleAssignment
          ? rumbleAssignment.board
          : session.mode === 'random'
            ? assignRandomQuestionOwners(
                rawBoard,
                teams.map((team) => team.id)
              )
            : rawBoard;
        const hotSeat = isHotSeatAvailable(session.mode)
          ? buildHotSeatState(teams, session.config.hotSeatRounds ?? 0)
          : undefined;
        const nextSession: GameSessionState = {
          ...session,
          step: 'board',
          phase: 'wagerDecision',
          board,
          ...withScores(teams),
          usedQuestionIds: new Set(),
          currentQuestion: undefined,
          currentTeamId: teams[0]?.id,
          wager: null,
          bonus: { ...DEFAULT_BONUS },
          hotSeat,
          lastAwardedTeamId: undefined,
          timedOutQuestionId: undefined,
          lastResolvedTurn: undefined,
          seed: `seed_${Date.now()}`,
        };
        nextSession.config = syncConfig({
          ...nextSession,
          config: {
            ...nextSession.config,
            entryTokenCharge: tokenCost,
          },
        });
        set({ session: nextSession });
        return { ok: true };
      },

      selectQuestion: (question) =>
        set((state) => {
          if (!state.session) return state;
          const usedQuestionIds = new Set(state.session.usedQuestionIds);
          usedQuestionIds.add(question.id);
          return {
            askedCanonicalKeys: state.askedCanonicalKeys.includes(question.canonicalKey)
              ? state.askedCanonicalKeys
              : [...state.askedCanonicalKeys, question.canonicalKey],
            session: {
              ...state.session,
              currentQuestion: question,
              currentTeamId:
                state.session.mode === 'rumble'
                  ? question.rumbleFirstTeamId ?? state.session.currentTeamId
                  : state.session.currentTeamId,
              usedQuestionIds,
              step: 'question',
              phase: 'questionReveal',
              timerStartedAt: Date.now(),
              timedOutQuestionId: undefined,
              reviewingUsedQuestion: false,
            },
          };
        }),

      reviewBoardQuestion: (question) =>
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              currentQuestion: question,
              step: 'answer',
              phase: 'answerLock',
              reviewingUsedQuestion: true,
              timerStartedAt: undefined,
              timedOutQuestionId: undefined,
              lastAwardedTeamId: undefined,
            },
          };
        }),

      cancelCurrentQuestion: () =>
        set((state) => {
          const session = state.session;
          const currentQuestion = session?.currentQuestion;
          if (!session || !currentQuestion) return state;

          const usedQuestionIds = new Set(session.usedQuestionIds);
          if (
            session.mode === 'rumble' &&
            session.step === 'question' &&
            getRumbleElapsedSeconds(session.timerStartedAt) < RUMBLE_SECOND_TEAM_REVEAL_SECONDS
          ) {
            usedQuestionIds.delete(currentQuestion.id);
          }

          return {
            session: {
              ...session,
              currentQuestion: undefined,
              usedQuestionIds,
              step: 'board',
              phase: 'wagerDecision',
              timerStartedAt: undefined,
              timedOutQuestionId: undefined,
            },
          };
        }),

      skipRumbleWait: () => {
        const session = get().session;
        if (!session) return { ok: false, error: 'No session found.' };
        if (session.mode !== 'rumble') {
          return { ok: false, error: 'Skip wait is only available in Rumble.' };
        }
        if (session.step !== 'question' || !session.currentQuestion) {
          return { ok: false, error: 'No active Rumble question.' };
        }
        if (session.timerStartedAt === undefined) {
          return { ok: false, error: 'Rumble timer has not started.' };
        }

        const now = Date.now();
        const elapsedSeconds = getRumbleElapsedSeconds(session.timerStartedAt, now);
        const nextCheckpoint = getNextRumbleCheckpointSeconds(elapsedSeconds);
        if (nextCheckpoint === null) {
          return { ok: false, error: 'No more Rumble checkpoints to skip.' };
        }

        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              timerStartedAt: now - nextCheckpoint * 1000,
            },
          };
        });
        return { ok: true };
      },

      revealAnswer: () => {
        const session = get().session;
        if (!session) return { ok: false, error: 'No session found.' };

        const rumbleReveal = canRevealRumbleAnswer(session);
        if (!rumbleReveal.ok) return rumbleReveal;

        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              step: 'answer',
              phase: 'answerLock',
              reviewingUsedQuestion: false,
            },
          };
        });
        return { ok: true };
      },

      expireCurrentQuestionForTimeout: () =>
        set((state) => {
          const session = state.session;
          const currentQuestion = session?.currentQuestion;
          if (!session || !currentQuestion || session.step !== 'question') return state;

          if (session.wager?.question) {
            const delta = getWagerScoreDelta(
              session.wager.question.pointValue,
              session.wager.multiplier,
              false
            );
            const nextTeams = withUpdatedTeamScore(session.teams, session.wager.targetTeamId, delta);

            return {
              session: {
                ...session,
                ...withScores(nextTeams),
                currentTeamId: session.wager.targetTeamId,
                wager: null,
                step: 'answer',
                phase: 'scoring',
                lastAwardedTeamId: null,
                timedOutQuestionId: currentQuestion.id,
                scoreEvents: [
                  ...session.scoreEvents,
                  createScoreEvent(session, {
                    teamId: session.wager.targetTeamId,
                    points: delta,
                    reason: 'wager',
                    questionId: currentQuestion.id,
                    metadata: { timeout: true },
                  }),
                ],
                lastResolvedTurn: buildLastResolvedTurn(currentQuestion, null, 0),
              },
            };
          }

          return {
            session: {
              ...session,
              step: 'answer',
              phase: 'scoring',
              lastAwardedTeamId: null,
              timedOutQuestionId: currentQuestion.id,
              lastResolvedTurn: buildLastResolvedTurn(currentQuestion, null, 0),
            },
          };
        }),

      awardStandardQuestion: (teamId) =>
        set((state) => {
          if (!state.session) return state;
          const currentQuestion = state.session.currentQuestion;
          if (!currentQuestion) return state;
          const session = state.session;
          const multiplier = session.bonus.active ? session.bonus.multiplier : 1;
          const points = currentQuestion.pointValue * multiplier;
          const rumbleAssignedTeamIds = [
            currentQuestion.rumbleFirstTeamId,
            currentQuestion.rumbleSecondTeamId,
          ];

          if (
            session.mode === 'rumble' &&
            teamId !== null &&
            !rumbleAssignedTeamIds.includes(teamId)
          ) {
            return state;
          }

          let teams = session.teams.map((t) => ({ ...t }));

          /** User may change who gets points before tapping Next - revert the prior pick first. */
          const switchingAward =
            session.phase === 'scoring' && session.lastAwardedTeamId !== undefined;

          if (switchingAward) {
            const prevId = session.lastAwardedTeamId;
            if (prevId !== null) {
              teams = teams.map((team) =>
                team.id === prevId ? { ...team, score: Math.max(0, team.score - points) } : team
              );
            }
          }

          if (teamId !== null) {
            teams = teams.map((team) =>
              team.id === teamId ? { ...team, score: team.score + points } : team
            );
          }

          return {
            session: {
              ...session,
              ...withScores(teams),
              phase: 'scoring',
              lastAwardedTeamId: teamId,
            },
          };
        }),

      continueAfterStandardQuestion: () =>
        set((state) => {
          const session = state.session;
          if (!session) return state;
          const currentQuestion = session.currentQuestion;
          const wasHotSeatQuestion = Boolean(session.hotSeat?.activeChallenge);
          const completedHotSeat = completeActiveHotSeat(session.hotSeat);
          const completedQuestionCount =
            completedHotSeat && !wasHotSeatQuestion
              ? completedHotSeat.completedQuestionCount + 1
              : completedHotSeat?.completedQuestionCount;
          const hotSeat = completedHotSeat
            ? {
                ...completedHotSeat,
                completedQuestionCount: completedQuestionCount ?? completedHotSeat.completedQuestionCount,
              }
            : undefined;
          const awardedTeamId = session.lastAwardedTeamId;
          const pointsAwarded =
            awardedTeamId !== undefined && awardedTeamId !== null && currentQuestion
              ? currentQuestion.pointValue * (session.bonus.active ? session.bonus.multiplier : 1)
              : 0;
          const scoreEvents =
            currentQuestion && awardedTeamId !== undefined && awardedTeamId !== null
              ? [
                  ...session.scoreEvents,
                  createScoreEvent(session, {
                    teamId: awardedTeamId,
                    points: pointsAwarded,
                    reason: wasHotSeatQuestion ? 'hotSeat' : 'standard',
                    questionId: currentQuestion.id,
                  }),
                ]
              : session.scoreEvents;
          const lastResolvedTurn =
            currentQuestion && session.phase === 'scoring'
              ? buildLastResolvedTurn(currentQuestion, awardedTeamId, pointsAwarded)
              : session.lastResolvedTurn;
          const remaining = session.board.filter(
            (question) => !session.usedQuestionIds.has(question.id)
          );

          if (!remaining.length) {
            const scores = Object.values(session.scores);
            const scoreGap = scores.length >= 2 ? Math.abs(scores[0] - scores[1]) : 0;
            if (!session.bonus.played && scoreGap <= 400) {
              const bonusQuestion = getBonusQuestion(
                session.selectedCategoryIds,
                session.usedQuestionIds,
                session.contentLocaleChain,
                new Set(state.askedCanonicalKeys)
              );
              if (bonusQuestion) {
                const usedQuestionIds = new Set(session.usedQuestionIds);
                usedQuestionIds.add(bonusQuestion.id);
                return {
                  askedCanonicalKeys: state.askedCanonicalKeys.includes(bonusQuestion.canonicalKey)
                    ? state.askedCanonicalKeys
                    : [...state.askedCanonicalKeys, bonusQuestion.canonicalKey],
                  session: {
                    ...session,
                    currentQuestion: bonusQuestion,
                    usedQuestionIds,
                    hotSeat,
                    bonus: {
                      active: true,
                      played: true,
                      multiplier: 2,
                      question: bonusQuestion,
                    },
                    step: 'question',
                    phase: 'questionReveal',
                    timerStartedAt: Date.now(),
                    lastAwardedTeamId: undefined,
                    timedOutQuestionId: undefined,
                    scoreEvents,
                    lastResolvedTurn,
                  },
                };
              }
            }

            return {
              session: {
                ...session,
                currentQuestion: undefined,
                wager: null,
                hotSeat,
                bonus: { ...session.bonus, active: false },
                step: 'end',
                phase: 'completed',
                scoreEvents,
                lastResolvedTurn,
              },
            };
          }

          if (hotSeat && !wasHotSeatQuestion) {
            const activeChallenge = hotSeat.challenges.find(
              (challenge) =>
                !challenge.completed &&
                challenge.triggerAfterQuestion === hotSeat.completedQuestionCount
            );
            if (activeChallenge) {
              const hotSeatQuestion = getRandomRemainingQuestion(
                session.board,
                session.usedQuestionIds
              );

              if (hotSeatQuestion) {
                const usedQuestionIds = new Set(session.usedQuestionIds);
                usedQuestionIds.add(hotSeatQuestion.id);
                const challengeWithQuestion = {
                  ...activeChallenge,
                  question: hotSeatQuestion,
                };

                return {
                  askedCanonicalKeys: state.askedCanonicalKeys.includes(hotSeatQuestion.canonicalKey)
                    ? state.askedCanonicalKeys
                    : [...state.askedCanonicalKeys, hotSeatQuestion.canonicalKey],
                  session: {
                    ...session,
                    hotSeat: {
                      ...hotSeat,
                      activeChallenge: challengeWithQuestion,
                    },
                    currentQuestion: hotSeatQuestion,
                    currentTeamId: activeChallenge.answeringTeamId,
                    usedQuestionIds,
                    step: 'question',
                    phase: 'questionReveal',
                    timerStartedAt: Date.now(),
                    wager: null,
                    bonus: { ...session.bonus, active: false },
                    lastAwardedTeamId: undefined,
                    timedOutQuestionId: undefined,
                    scoreEvents,
                    lastResolvedTurn,
                  },
                };
              }
            }
          }

          const currentIndex = session.teams.findIndex((team) => team.id === session.currentTeamId);
          const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % session.teams.length : 0;
          return {
            session: {
              ...session,
              step: 'board',
              phase: 'wagerDecision',
              currentQuestion: undefined,
              currentTeamId: session.teams[nextIndex]?.id,
              wager: null,
              hotSeat,
              bonus: { ...session.bonus, active: false },
              lastAwardedTeamId: undefined,
              timedOutQuestionId: undefined,
              scoreEvents,
              lastResolvedTurn,
            },
          };
        }),

      adjustScoreByPoints: (teamId, delta, note) =>
        set((state) => {
          const session = state.session;
          if (!session) return state;
          const teams = withUpdatedTeamScore(session.teams, teamId, delta);
          return {
            session: {
              ...session,
              ...withScores(teams),
              scoreEvents: [
                ...session.scoreEvents,
                createScoreEvent(session, {
                  teamId,
                  points: delta,
                  reason: 'manualAdjustment',
                  metadata: note ? { note } : undefined,
                }),
              ],
            },
          };
        }),

      reviewCompletedBoard: () =>
        set((state) => {
          const session = state.session;
          if (!session || session.step !== 'end') return state;
          return { session: { ...session, step: 'board' } };
        }),

      returnToEndScreen: () =>
        set((state) => {
          const session = state.session;
          if (!session) return state;
          const remaining = session.board.filter(
            (question) => !session.usedQuestionIds.has(question.id) && !question.used
          );
          if (remaining.length > 0) return state;
          return { session: { ...session, step: 'end', phase: 'completed' } };
        }),

      loadDebugWinnerSession: () =>
        set(() => ({
          session: createDebugWinnerSession(),
          rapidFire: null,
          entryReservationId: null,
        })),

      reopenLastResolvedTurn: () =>
        set((state) => {
          const session = state.session;
          if (!session?.lastResolvedTurn) return state;
          return {
            session: {
              ...session,
              currentQuestion: session.lastResolvedTurn.question,
              lastAwardedTeamId: session.lastResolvedTurn.awardedTeamId,
              step: 'answer',
              phase: 'scoring',
            },
          };
        }),

      initiateWager: () => {
        const state = get();
        const session = state.session;
        if (!session?.config.wagerEnabled) {
          return { ok: false, error: 'Wagers are not used in this mode.' };
        }
        if (!session?.currentTeamId) return { ok: false, error: 'No active team available.' };
        const wageringTeam = session.teams.find((team) => team.id === session.currentTeamId);
        const targetTeamId = getOtherTeamId(session.teams, session.currentTeamId);
        if (!wageringTeam || !targetTeamId) return { ok: false, error: 'Wagers require two teams.' };
        if (wageringTeam.wagersUsed >= session.wagersPerTeam) {
          return { ok: false, error: `${wageringTeam.name} has used all wagers.` };
        }

        const multipliers: WagerState['multiplier'][] = [0.5, 1.5, 2];
        const multiplier = multipliers[Math.floor(Math.random() * multipliers.length)];
        const teams = session.teams.map((team) =>
          team.id === wageringTeam.id ? { ...team, wagersUsed: team.wagersUsed + 1 } : team
        );
        set({
          session: {
            ...session,
            ...withScores(teams),
            step: 'board',
            phase: 'wagerDecision',
            currentQuestion: undefined,
            currentTeamId: targetTeamId,
            wager: {
              wageringTeamId: wageringTeam.id,
              targetTeamId,
              multiplier,
            },
            lastAwardedTeamId: undefined,
            timedOutQuestionId: undefined,
          },
        });
        return { ok: true };
      },

      confirmRandomWagerQuestion: (drawnQuestion) =>
        set((state) => {
          const session = state.session;
          if (!session?.wager || session.wager.question) return state;
          const question =
            drawnQuestion && !session.usedQuestionIds.has(drawnQuestion.id)
              ? drawnQuestion
              : getRandomRemainingQuestion(session.board, session.usedQuestionIds, {
                  teamId: session.mode === 'random' ? session.currentTeamId : undefined,
                });
          if (!question) {
            return {
              session: {
                ...session,
                step: 'end',
                phase: 'completed',
              },
            };
          }
          const usedQuestionIds = new Set(session.usedQuestionIds);
          usedQuestionIds.add(question.id);
          return {
            askedCanonicalKeys: state.askedCanonicalKeys.includes(question.canonicalKey)
              ? state.askedCanonicalKeys
              : [...state.askedCanonicalKeys, question.canonicalKey],
            session: {
              ...session,
              currentQuestion: question,
              usedQuestionIds,
              step: 'question',
              phase: 'questionReveal',
              timerStartedAt: Date.now(),
              timedOutQuestionId: undefined,
              wager: {
                ...session.wager,
                question,
              },
            },
          };
        }),

      resolveWager: (correct) =>
        set((state) => {
          const session = state.session;
          if (!session?.wager?.question) return state;
          const { wager, teams } = session;
          const basePoints = wager.question!.pointValue;
          const delta = getWagerScoreDelta(basePoints, wager.multiplier, correct);

          const nextTeams = teams.map((team) =>
            team.id === wager.targetTeamId ? { ...team, score: team.score + delta } : team
          );
          const remaining = session.board.filter(
            (question) => !session.usedQuestionIds.has(question.id)
          );

          return {
            session: {
              ...session,
              ...withScores(nextTeams),
              currentQuestion: undefined,
              wager: null,
              bonus: { ...session.bonus, active: false },
              currentTeamId: wager.wageringTeamId,
              step: remaining.length ? 'board' : 'end',
              phase: remaining.length ? 'wagerDecision' : 'completed',
              lastAwardedTeamId: wager.targetTeamId,
              timedOutQuestionId: undefined,
            },
          };
        }),
    }),
    {
      name: 'backfire-play-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      skipHydration: true,
      partialize: (state): PersistedPlayState => ({
        tokens: state.tokens,
        session: serializeGameSession(state.session),
        rapidFire: serializeRapidFire(state.rapidFire),
        askedCanonicalKeys: state.askedCanonicalKeys,
        entryReservationId: state.entryReservationId,
      }),
      merge: (persistedState, currentState) =>
        mergePersistedPlayState(persistedState, currentState as PlayStore),
    }
  )
  );
}

type PlayStoreApi = ReturnType<typeof createPlayStore>;

const playStoreSingletonHolder = globalThis as typeof globalThis & {
  __DOUBLEPLAY_USE_PLAY_STORE__?: PlayStoreApi;
};

const existingPlayStore = playStoreSingletonHolder.__DOUBLEPLAY_USE_PLAY_STORE__;

export const usePlayStore =
  // Check the newest store method so a stale cached instance from before a code
  // update is discarded instead of reused across Fast Refresh.
  existingPlayStore && Array.isArray(existingPlayStore.getState().askedCanonicalKeys)
    ? existingPlayStore
    : (playStoreSingletonHolder.__DOUBLEPLAY_USE_PLAY_STORE__ = createPlayStore());

export function usePlayHydration() {
  const hydrate = usePlayStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate().then(() => {
      usePlayStore.getState().ensureDraft();
    });
  }, [hydrate]);
}

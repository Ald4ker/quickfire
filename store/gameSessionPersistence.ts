import { z } from 'zod';
import type {
  AnswerReviewState,
  BonusChallengeState,
  CategoryOption,
  GameConfig,
  GameMode,
  GameSessionState,
  HotSeatState,
  LifelineRuntimeState,
  OvertimeState,
  PlayRouteStep,
  QuestionCard,
  RapidFireState,
  ScoreEvent,
  TeamState,
  TurnPhase,
  WagerState,
} from '@/features/shared';
import { CONTENT_LOCALES, type ContentLocale } from '@/lib/i18n/config';

/** English plus the 17 content locales; a superset of the old UI-derived list, so saved sessions still parse. */
const contentLocaleSchema = z.enum(['en', ...CONTENT_LOCALES]);

const gameModeSchema = z.enum(['classic', 'quickPlay', 'random', 'rumble', 'rapidFire']);

const scoreEventReasonSchema = z.enum([
  'standard',
  'steal',
  'wager',
  'lifeline',
  'hotSeat',
  'overtimeSurge',
  'manualAdjustment',
]);

const scoreEventSchema = z.object({
  teamId: z.string().min(1),
  points: z.number(),
  reason: scoreEventReasonSchema,
  questionId: z.string().optional(),
  turnIndex: z.number(),
  createdAt: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

const lifelineIdSchema = z.enum(['callAFriend', 'discard', 'answerRewards', 'rest']);

const teamLifelineRuntimeSchema = z.object({
  callAFriend: z.number(),
  discard: z.number(),
  answerRewards: z.number(),
  rest: z.number().optional(),
  activeLifelineId: lifelineIdSchema.nullable().optional(),
  answerRewardsPointMultiplier: z.number().optional(),
});

const lifelineRuntimeStateSchema = z.object({
  perTeam: z.record(teamLifelineRuntimeSchema),
});

const overtimeSurgeStatusSchema = z.enum([
  'inactive',
  'armed',
  'challengePending',
  'completed',
]);
const playRouteStepSchema = z.enum([
  'hub',
  'mode',
  'quick-play-length',
  'team-setup',
  'categories',
  'board',
  'question',
  'answer',
  'end',
]);
const turnPhaseSchema = z.enum([
  'lobby',
  'categorySelection',
  'wagerDecision',
  'questionReveal',
  'deliberation',
  'answerLock',
  'stealWindow',
  'scoring',
  'overtimeCheck',
  'completed',
]);

const questionCardSchema = z.object({
  id: z.string().min(1),
  canonicalKey: z.string().min(1),
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
  prompt: z.string(),
  answer: z.string(),
  promptImageUrl: z.string().optional(),
  promptImageKey: z.string().optional(),
  answerImageUrl: z.string().optional(),
  pointValue: z.number(),
  locale: contentLocaleSchema,
  resolvedFromFallback: z.boolean(),
  used: z.boolean(),
  boardSide: z.enum(['left', 'right']).optional(),
  rumbleFirstTeamId: z.string().optional(),
  rumbleSecondTeamId: z.string().optional(),
  assignedTeamId: z.string().optional(),
});

const categoryOptionSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  questionCount: z.number(),
  resolvedLocale: contentLocaleSchema,
  fellBackToEnglish: z.boolean(),
});

const teamConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  playerNames: z.array(z.string()).optional(),
});

const teamStateSchema = teamConfigSchema.extend({
  score: z.number(),
  wagersUsed: z.number(),
});

const lifelineConfigSchema = z.object({
  callAFriend: z.number(),
  discard: z.number(),
  answerRewards: z.number(),
  rest: z.number().optional(),
});

const gameConfigSchema = z.object({
  mode: gameModeSchema,
  teams: z.array(teamConfigSchema),
  categories: z.array(z.string()),
  contentLocaleChain: z.array(contentLocaleSchema),
  quickPlayTopicCount: z.number().optional(),
  wagersPerTeam: z.number().optional(),
  lifelines: lifelineConfigSchema.optional(),
  teamLifelines: z.record(lifelineConfigSchema).optional(),
  hotSeatEnabled: z.boolean(),
  hotSeatRounds: z.number().int().min(0).max(5).optional(),
  wagerEnabled: z.boolean(),
  overtimeThreshold: z.number().optional(),
  boardSize: z.number().optional(),
  /** Must persist so `startBoard` does not re-charge after rehydrate (resume / Continue Game). */
  entryTokenCharge: z.number().optional(),
});

const wagerStateSchema = z.object({
  wageringTeamId: z.string().min(1),
  targetTeamId: z.string().min(1),
  multiplier: z.union([z.literal(0.5), z.literal(1.5), z.literal(2)]),
  question: questionCardSchema.optional(),
});

const bonusChallengeSchema = z.object({
  active: z.boolean(),
  played: z.boolean(),
  multiplier: z.number(),
  question: questionCardSchema.optional(),
});

const hotSeatParticipantSchema = z.object({
  teamId: z.string().min(1),
  playerName: z.string().min(1),
});

const hotSeatChallengeSchema = z.object({
  id: z.string().min(1),
  triggerAfterQuestion: z.number().int().min(1),
  answeringTeamId: z.string().min(1),
  participants: z.array(hotSeatParticipantSchema).min(1),
  question: questionCardSchema.optional(),
  completed: z.boolean(),
});

const hotSeatStateSchema = z.object({
  completedQuestionCount: z.number().int().min(0),
  challenges: z.array(hotSeatChallengeSchema),
  activeChallenge: hotSeatChallengeSchema.optional(),
});

const overtimeStateSchema = z.object({
  topics: z.array(z.string()),
  leadingTeamBanned: z.string().optional(),
  trailingTeamSelected: z.string().optional(),
  surgeQuestionId: z.string().optional(),
  triggeringTeamId: z.string().optional(),
  challengedTeamId: z.string().optional(),
  challengeTopicIds: z.array(z.string()).optional(),
  surgeStatus: overtimeSurgeStatusSchema.optional(),
});

const rapidFireStateSchema = z.object({
  phase: z.enum(['topicSelect', 'run', 'results']),
  selectedTopicIds: z.array(z.string()),
  questionIds: z.array(z.string()),
  currentIndex: z.number(),
  seed: z.string().min(1),
  runStartedAt: z.number(),
  correctCount: z.number().optional(),
});

const answerReviewStateSchema = z.object({
  question: questionCardSchema,
  awardedTeamId: z.string().nullable().optional(),
  pointsAwarded: z.number().optional(),
  revealedAt: z.number(),
});

const persistedGameSessionSchema = z.object({
  id: z.string().min(1),
  mode: gameModeSchema,
  config: gameConfigSchema,
  contentLocaleChain: z.array(contentLocaleSchema),
  step: playRouteStepSchema,
  phase: turnPhaseSchema,
  availableCategories: z.array(categoryOptionSchema),
  selectedCategoryIds: z.array(z.string()),
  currentTeamId: z.string().optional(),
  currentQuestion: questionCardSchema.optional(),
  board: z.array(questionCardSchema),
  teams: z.array(teamStateSchema),
  scores: z.record(z.number()),
  usedQuestionIds: z.array(z.string()),
  seed: z.string().min(1),
  wagersPerTeam: z.number(),
  wager: wagerStateSchema.nullable().optional(),
  bonus: bonusChallengeSchema,
  lastAwardedTeamId: z.string().nullable().optional(),
  timerStartedAt: z.number().optional(),
  timedOutQuestionId: z.string().optional(),
  overtime: overtimeStateSchema.optional(),
  scoreEvents: z.array(scoreEventSchema).default([]),
  lifelineRuntime: lifelineRuntimeStateSchema.optional(),
  hotSeat: hotSeatStateSchema.optional(),
  lastResolvedTurn: answerReviewStateSchema.optional(),
});

export interface PersistedGameSessionState {
  id: string;
  mode: GameMode;
  config: GameConfig;
  contentLocaleChain: ContentLocale[];
  step: PlayRouteStep;
  phase: TurnPhase;
  availableCategories: CategoryOption[];
  selectedCategoryIds: string[];
  currentTeamId?: string;
  currentQuestion?: QuestionCard;
  board: QuestionCard[];
  teams: TeamState[];
  scores: Record<string, number>;
  usedQuestionIds: string[];
  seed: string;
  wagersPerTeam: number;
  wager?: WagerState | null;
  bonus: BonusChallengeState;
  lastAwardedTeamId?: string | null;
  timerStartedAt?: number;
  timedOutQuestionId?: string;
  overtime?: OvertimeState;
  scoreEvents: ScoreEvent[];
  lifelineRuntime?: LifelineRuntimeState;
  hotSeat?: HotSeatState;
  lastResolvedTurn?: AnswerReviewState;
}

export interface PersistedPlayState {
  tokens: number;
  session: PersistedGameSessionState | null;
  rapidFire: RapidFireState | null;
  askedCanonicalKeys?: string[];
  /** Convex reservation ID for the current game entry, if any. Persisted so it
   *  can be consumed or refunded after an app restart. */
  entryReservationId?: string | null;
}

export interface PersistedLegacyGameState {
  session: PersistedGameSessionState | null;
}

export function serializeUsedQuestionIds(usedQuestionIds: Set<string>): string[] {
  return Array.from(usedQuestionIds);
}

export function deserializeUsedQuestionIds(ids: unknown): Set<string> {
  if (!Array.isArray(ids)) {
    return new Set();
  }

  return new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0));
}

function serializeQuestionCard(question: QuestionCard): QuestionCard {
  return { ...question };
}

function serializeTeamState(team: TeamState): TeamState {
  return { ...team, playerNames: team.playerNames ? [...team.playerNames] : team.playerNames };
}

function serializeCategoryOption(category: CategoryOption): CategoryOption {
  return { ...category };
}

function serializeGameConfig(config: GameConfig): GameConfig {
  return {
    ...config,
    teams: config.teams.map((team) => ({ ...team, playerNames: team.playerNames ? [...team.playerNames] : team.playerNames })),
    categories: [...config.categories],
    contentLocaleChain: [...config.contentLocaleChain],
    teamLifelines: config.teamLifelines
      ? Object.fromEntries(
          Object.entries(config.teamLifelines).map(([teamId, lifelineConfig]) => [
            teamId,
            { ...lifelineConfig },
          ])
        )
      : config.teamLifelines,
    lifelines: config.lifelines ? { ...config.lifelines } : config.lifelines,
  };
}

export function serializeGameSession(
  session: GameSessionState | null
): PersistedGameSessionState | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    config: serializeGameConfig(session.config),
    contentLocaleChain: [...session.contentLocaleChain],
    availableCategories: session.availableCategories.map(serializeCategoryOption),
    selectedCategoryIds: [...session.selectedCategoryIds],
    currentQuestion: session.currentQuestion ? serializeQuestionCard(session.currentQuestion) : session.currentQuestion,
    board: session.board.map(serializeQuestionCard),
    teams: session.teams.map(serializeTeamState),
    scores: { ...session.scores },
    usedQuestionIds: serializeUsedQuestionIds(session.usedQuestionIds),
    wager: session.wager
      ? {
          ...session.wager,
          question: session.wager.question ? serializeQuestionCard(session.wager.question) : session.wager.question,
        }
      : session.wager,
    bonus: {
      ...session.bonus,
      question: session.bonus.question ? serializeQuestionCard(session.bonus.question) : session.bonus.question,
    },
    overtime: session.overtime
      ? {
          ...session.overtime,
          topics: [...session.overtime.topics],
          challengeTopicIds: session.overtime.challengeTopicIds
            ? [...session.overtime.challengeTopicIds]
            : session.overtime.challengeTopicIds,
        }
      : session.overtime,
    scoreEvents: session.scoreEvents.map((e) => ({
      ...e,
      metadata: e.metadata ? { ...e.metadata } : undefined,
    })),
    lifelineRuntime: session.lifelineRuntime
      ? {
          perTeam: Object.fromEntries(
            Object.entries(session.lifelineRuntime.perTeam).map(([teamId, rt]) => [
              teamId,
              { ...rt },
            ])
          ),
        }
      : session.lifelineRuntime,
    hotSeat: session.hotSeat
      ? {
          ...session.hotSeat,
          challenges: session.hotSeat.challenges.map((challenge) => ({
            ...challenge,
            participants: challenge.participants.map((participant) => ({ ...participant })),
            question: challenge.question ? serializeQuestionCard(challenge.question) : undefined,
          })),
          activeChallenge: session.hotSeat.activeChallenge
            ? {
                ...session.hotSeat.activeChallenge,
                participants: session.hotSeat.activeChallenge.participants.map((participant) => ({
                  ...participant,
                })),
                question: session.hotSeat.activeChallenge.question
                  ? serializeQuestionCard(session.hotSeat.activeChallenge.question)
                  : undefined,
              }
            : undefined,
        }
      : session.hotSeat,
    lastResolvedTurn: session.lastResolvedTurn
      ? {
          ...session.lastResolvedTurn,
          question: serializeQuestionCard(session.lastResolvedTurn.question),
        }
      : session.lastResolvedTurn,
  };
}

export function deserializeGameSession(
  value: unknown
): GameSessionState | null {
  const parsed = persistedGameSessionSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const session = parsed.data;

  return {
    ...session,
    contentLocaleChain: session.contentLocaleChain as ContentLocale[],
    availableCategories: session.availableCategories as CategoryOption[],
    currentQuestion: session.currentQuestion as QuestionCard | undefined,
    board: session.board as QuestionCard[],
    teams: session.teams as TeamState[],
    usedQuestionIds: deserializeUsedQuestionIds(session.usedQuestionIds),
    wager: session.wager as WagerState | null | undefined,
    bonus: session.bonus as BonusChallengeState,
    overtime: session.overtime as OvertimeState | undefined,
    scoreEvents: session.scoreEvents as ScoreEvent[],
    lifelineRuntime: session.lifelineRuntime as LifelineRuntimeState | undefined,
    hotSeat: session.hotSeat as HotSeatState | undefined,
    lastResolvedTurn: session.lastResolvedTurn as AnswerReviewState | undefined,
  };
}

export function serializeRapidFire(state: RapidFireState | null): RapidFireState | null {
  if (!state) return null;
  return {
    ...state,
    selectedTopicIds: [...state.selectedTopicIds],
    questionIds: [...state.questionIds],
  };
}

export function deserializeRapidFire(value: unknown): RapidFireState | null {
  if (value === null || value === undefined) return null;
  const parsed = rapidFireStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

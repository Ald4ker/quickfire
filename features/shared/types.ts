/**
 * Core domain types for Backfire.
 * Game engine, wallet, and content interfaces.
 */

import type { ContentLocale } from '@/lib/i18n/config';

export type GameMode =
  | 'classic'
  | 'quickPlay'
  | 'random'
  | 'rumble'
  | 'rapidFire';

export interface TeamConfig {
  id: string;
  name: string;
  playerNames?: string[];
}

export interface TeamState extends TeamConfig {
  score: number;
  wagersUsed: number;
}

export interface PlayerConfig {
  id: string;
  name: string;
  teamId: string;
}

export interface LifelineConfig {
  callAFriend: number;
  discard: number;
  answerRewards: number;
  rest?: number;
}

/** Per-team lifeline selection (e.g. 3 chosen from 4 options) */
export type LifelineId = 'callAFriend' | 'discard' | 'answerRewards' | 'rest';

export function lifelinesToConfig(ids: LifelineId[]): LifelineConfig {
  const config: LifelineConfig = { callAFriend: 0, discard: 0, answerRewards: 0 };
  for (const id of ids) {
    if (id === 'rest') {
      config.rest = (config.rest ?? 0) + 1;
      continue;
    }
    if (id === 'callAFriend') config.callAFriend += 1;
    else if (id === 'discard') config.discard += 1;
    else if (id === 'answerRewards') config.answerRewards += 1;
  }
  return config;
}

export interface GameConfig {
  mode: GameMode;
  teams: TeamConfig[];
  categories: string[];
  contentLocaleChain: ContentLocale[];
  quickPlayTopicCount?: number;
  wagersPerTeam?: number;
  /** Legacy: single lifeline config. Prefer teamLifelines for per-team. */
  lifelines?: LifelineConfig;
  /** Per-team lifeline config (teamId -> config) */
  teamLifelines?: Record<string, LifelineConfig>;
  hotSeatEnabled: boolean;
  /** Rounds of Hot Seat per match; 0 turns the feature off. Synced with `hotSeatEnabled`. */
  hotSeatRounds?: number;
  wagerEnabled: boolean;
  overtimeThreshold?: number;
  boardSize?: number;
  /** Tokens already committed for this session (set when the board starts). */
  entryTokenCharge?: number;
}

export interface QuestionCard {
  id: string;
  canonicalKey: string;
  categoryId: string;
  categoryName: string;
  prompt: string;
  answer: string;
  promptImageUrl?: string;
  /** Bundled asset key from constants/questionImages.ts (picture topics). */
  promptImageKey?: string;
  answerImageUrl?: string;
  pointValue: number;
  locale: ContentLocale;
  resolvedFromFallback: boolean;
  used: boolean;
  /** Jeopardy board column (TriviaApp q_ / w_ parity). */
  boardSide?: 'left' | 'right';
  /** Rumble party that gets the first timed answer window. */
  rumbleFirstTeamId?: string;
  /** Rumble party that gets the second timed answer window. */
  rumbleSecondTeamId?: string;
  /** Random mode: team that owns this tile for fair value-bucket draws. */
  assignedTeamId?: string;
}

export interface CategoryOption {
  id: string;
  slug: string;
  title: string;
  questionCount: number;
  resolvedLocale: ContentLocale;
  fellBackToEnglish: boolean;
}

export interface WagerState {
  wageringTeamId: string;
  targetTeamId: string;
  multiplier: 0.5 | 1.5 | 2;
  question?: QuestionCard;
}

export interface BonusChallengeState {
  active: boolean;
  played: boolean;
  multiplier: number;
  question?: QuestionCard;
}

export type PlayRouteStep =
  | 'hub'
  | 'mode'
  | 'quick-play-length'
  | 'team-setup'
  | 'categories'
  | 'board'
  | 'question'
  | 'answer'
  | 'end';

export interface QuestionAttempt {
  questionId: string;
  teamId: string;
  correct: boolean;
  points: number;
  usedLifeline?: string;
}

export interface WagerRoll {
  multiplier: number;
  questionId: string;
}

export interface HotSeatAssignment {
  teamId: string;
  playerId: string;
}

export interface HotSeatParticipant {
  teamId: string;
  playerName: string;
}

export interface HotSeatChallenge {
  id: string;
  triggerAfterQuestion: number;
  answeringTeamId: string;
  participants: HotSeatParticipant[];
  question?: QuestionCard;
  completed: boolean;
}

export interface HotSeatState {
  completedQuestionCount: number;
  challenges: HotSeatChallenge[];
  activeChallenge?: HotSeatChallenge;
}

export type TurnPhase =
  | 'lobby'
  | 'categorySelection'
  | 'wagerDecision'
  | 'questionReveal'
  | 'deliberation'
  | 'answerLock'
  | 'stealWindow'
  | 'scoring'
  | 'overtimeCheck'
  | 'completed';

export type ScoreEventReason =
  | 'standard'
  | 'steal'
  | 'wager'
  | 'lifeline'
  | 'hotSeat'
  | 'overtimeSurge'
  | 'manualAdjustment';

/** Opaque score-event extras persisted with the session ledger. */
export type ScoreEventMetadataValue = string | number | boolean | null;
export type ScoreEventMetadata = Record<string, ScoreEventMetadataValue>;

export interface ScoreEvent {
  teamId: string;
  points: number;
  reason: ScoreEventReason;
  questionId?: string;
  turnIndex: number;
  createdAt: number;
  metadata?: ScoreEventMetadata;
}

export type OvertimeSurgeStatus =
  | 'inactive'
  | 'armed'
  | 'challengePending'
  | 'completed';

export interface OvertimeState {
  topics: string[];
  leadingTeamBanned?: string;
  trailingTeamSelected?: string;
  surgeQuestionId?: string;
  triggeringTeamId?: string;
  challengedTeamId?: string;
  challengeTopicIds?: string[];
  surgeStatus?: OvertimeSurgeStatus;
}

/** Runtime lifeline counts and UI state during a session */
export interface TeamLifelineRuntime {
  callAFriend: number;
  discard: number;
  answerRewards: number;
  rest?: number;
  activeLifelineId?: LifelineId | null;
  /** Applied point multiplier after answerRewards reveal (e.g. 0.5 for 50%) */
  answerRewardsPointMultiplier?: number;
}

export interface LifelineRuntimeState {
  perTeam: Record<string, TeamLifelineRuntime>;
}

export interface RapidFireState {
  phase: 'topicSelect' | 'run' | 'results';
  selectedTopicIds: string[];
  questionIds: string[];
  currentIndex: number;
  seed: string;
  runStartedAt: number;
  correctCount?: number;
}

export interface ManualScoreAdjustment {
  teamId: string;
  delta: number;
  appliedAt: number;
  note?: string;
}

export interface AnswerReviewState {
  question: QuestionCard;
  awardedTeamId?: string | null;
  pointsAwarded?: number;
  revealedAt: number;
}

export interface DeviceInstallation {
  deviceId: string;
  purchaserAccountId?: string;
  userId?: string;
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface SessionSavePayload {
  clientSessionId: string;
  deviceId: string;
  session: GameSessionState;
  scoreEvents: ScoreEvent[];
}

export interface OfflineSessionQueueItem {
  id: string;
  payload: SessionSavePayload;
  createdAt: number;
  flushAttempts: number;
  lastError?: string;
}

export interface GameSessionState {
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
  usedQuestionIds: Set<string>;
  seed: string;
  wagersPerTeam: number;
  wager?: WagerState | null;
  bonus: BonusChallengeState;
  lastAwardedTeamId?: string | null;
  timerStartedAt?: number;
  /** Current question expired at the hard per-question time limit. */
  timedOutQuestionId?: string;
  overtime?: OvertimeState;
  scoreEvents: ScoreEvent[];
  lifelineRuntime?: LifelineRuntimeState;
  hotSeat?: HotSeatState;
  lastResolvedTurn?: AnswerReviewState;
  /** Read-only Q+A when reopening a used board tile (no re-scoring). */
  reviewingUsedQuestion?: boolean;
}

export interface WalletBalance {
  balance: number;
  purchaserAccountId: string | null;
}

/** Opaque wallet ledger metadata attached at grant/adjust boundaries. */
export type WalletTransactionMetadataValue = string | number | boolean | null;
export type WalletTransactionMetadata = Record<string, WalletTransactionMetadataValue>;

export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  createdAt: number;
  source?: string;
  productKey?: string;
  store?: string;
  storeTransactionId?: string;
  originalStoreTransactionId?: string;
  metadata?: WalletTransactionMetadata;
}

export interface PurchaserAccount {
  purchaserAccountId: string;
  linkedUserId?: string | null;
  canonicalPurchaserAccountId?: string | null;
}

export interface TokenProduct {
  productKey: string;
  tokensGranted: number;
  iosProductId: string;
  androidProductId: string;
  isActive: boolean;
  sortOrder: number;
}

export interface StorePurchase {
  id: string;
  purchaserAccountId: string;
  productKey: string;
  store: string;
  storeTransactionId: string;
  originalStoreTransactionId?: string;
  status: string;
  purchasedAt: number;
}

export interface PaymentWebhookEvent {
  eventId: string;
  type: string;
  appUserId?: string;
  originalAppUserId?: string;
  aliases?: string[];
  receivedAt: number;
  processedAt?: number;
  status: string;
  errorCode?: string;
}

export interface PromoRedemptionResult {
  success: boolean;
  tokensGranted?: number;
  error?: string;
}

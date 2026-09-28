import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ImageSource } from 'expo-image';
import type { GameMode, GameSessionState, QuestionCard, TeamState } from '@/features/shared';

/* ------------------------------------------------------------------ props */

export type R2Mode = {
  id: GameMode;
  title: string;
  copy: string;
  cost: string;
  icon: string;
};

export type R2HomeProps = {
  modes: R2Mode[];
  tokens: string;
  tokensLabel: string;
  onSelectMode: (mode: GameMode) => void;
  onOpenSettings: () => void;
  onOpenStore: () => void;
  resume: null | {
    title: string;
    body: string;
    continueLabel: string;
    newLabel: string;
    onContinue: () => void;
    onNewGame: () => void;
    onClose: () => void;
  };
};

export type R2LobbyProps = {
  session: GameSessionState;
  canContinue: boolean;
  wagerEnabled: boolean;
  onBack: () => void;
  onContinue: () => void;
  onWagerInfo: () => void;
  updateTeamName: (teamId: string, name: string) => void;
  addTeamMember: (teamId: string) => void;
  removeTeamMember: (teamId: string) => void;
  updateTeamMemberName: (teamId: string, index: number, name: string) => void;
  setWagersPerTeam: (count: number) => void;
};

export type R2BoardRow = { pointValue: number; left: QuestionCard; right: QuestionCard };
export type R2BoardColumn = { categoryId: string; categoryName: string; rows: R2BoardRow[] };

export type R2BoardProps = {
  session: GameSessionState;
  columns: R2BoardColumn[];
  isUsed: (question: QuestionCard) => boolean;
  onTilePress: (question: QuestionCard) => void;
  /** Random mode or wager draw: the tile currently lit, and the locked pick. */
  flashingId: string | null;
  lockedId: string | null;
  onMenu: () => void;
  onBack: () => void;
  art: (categoryId: string) => ImageSource | null;
};

export type R2QuestionProps = {
  session: GameSessionState;
  question: QuestionCard;
  isAnswerPhase: boolean;
  elapsedSeconds: number;
  maxSeconds: number;
  timeLabel: string;
  hasTimedOut: boolean;
  canShowAnswer: boolean;
  guide: string | null;
  promptImage: ImageSource | { uri: string } | null;
  onBack: () => void;
  onShowAnswer: () => void;
  onAward: (teamId: string | null) => void;
  onResolveWager: (correct: boolean) => void;
  onNext: () => void;
  onReport: () => void;
  canWager: boolean;
  onWager: () => void;
};

export type R2ResultsProps = {
  session: GameSessionState;
  onHome: () => void;
  onAnotherMatch: () => void;
  onReviewBoard: () => void;
};

/* ---------------------------------------------------------------- helpers */

export function rankTeams(teams: TeamState[]): TeamState[] {
  return [...teams].sort((a, b) => b.score - a.score);
}

export function isTie(teams: TeamState[]): boolean {
  const r = rankTeams(teams);
  return r.length > 1 && r[0]!.score === r[1]!.score;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

export type RecapItem = {
  question: QuestionCard;
  right: boolean;
  teamId: string | null;
};

/** Every played question with whether someone got it right (green) or not (red). */
export function buildRecap(session: GameSessionState): RecapItem[] {
  const awarded = new Map<string, string>();
  for (const event of session.scoreEvents) {
    if (event.questionId && event.points > 0) awarded.set(event.questionId, event.teamId);
  }
  const used = session.board.filter((q) => session.usedQuestionIds.has(q.id) || q.used);
  return used.map((question) => {
    const teamId = awarded.get(question.id) ?? null;
    return { question, right: teamId !== null, teamId };
  });
}

/** Teams that may take the points on this question (Rumble limits it to two). */
export function awardableTeams(session: GameSessionState, question: QuestionCard): TeamState[] {
  if (session.mode !== 'rumble') return session.teams;
  const ids = [question.rumbleFirstTeamId, question.rumbleSecondTeamId];
  return session.teams.filter((team) => ids.includes(team.id));
}

/* ----------------------------------------------------------------- motion */

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const NATIVE = Platform.OS !== 'web';

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduce(Boolean(value)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduce(Boolean(v)));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** 0 to 1 once on mount (or whenever `key` changes). */
export function useEntrance(delay = 0, duration = 420, key?: unknown): Animated.Value {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    });
    a.start();
    return () => a.stop();
  }, [reduce, delay, duration, key, v]);
  return v;
}

type EnterProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  /** Start offsets. */
  dx?: number;
  dy?: number;
  scale?: number;
  rotate?: number;
  style?: StyleProp<ViewStyle>;
  revealKey?: unknown;
};

/** Fade plus an offset, scale or rotation that settles with an exponential ease-out. */
export function Enter({
  children,
  delay = 0,
  duration = 420,
  dx = 0,
  dy = 12,
  scale = 1,
  rotate = 0,
  style,
  revealKey,
}: EnterProps) {
  const p = useEntrance(delay, duration, revealKey);
  // Keep any static transform (a card's resting tilt) and add the entrance on top.
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const base = (Array.isArray(flat.transform) ? flat.transform : []) as NonNullable<ViewStyle['transform']> & unknown[];
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p,
          transform: [
            ...(base as never[]),
            { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
            { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
            { scale: p.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) },
            {
              rotate: p.interpolate({ inputRange: [0, 1], outputRange: [`${rotate}deg`, '0deg'] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Counts a number up from `from` to `value` (JS thread; short). */
export function useCountUp(value: number, duration = 900, from = 0): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : from);
  const v = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const id = v.addListener(({ value: n }) => setShown(Math.round(n)));
    const a = Animated.timing(v, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start(() => setShown(value));
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [duration, reduce, v, value]);
  return shown;
}

export function CountUp({ value, duration, from }: { value: number; duration?: number; from?: number }) {
  const n = useCountUp(value, duration, from);
  return <>{n.toLocaleString()}</>;
}

/** A gentle repeating pulse (0 to 1 to 0) for "live" indicators. */
export function usePulse(period = 1600): Animated.Value {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0, duration: period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [period, reduce, v]);
  return v;
}

/**
 * Largest font size (between min and max) at which `text` fits a box, using a
 * simple average-glyph-width model. Good enough to stage a question at the
 * biggest size the screen allows.
 */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  max: number,
  min: number,
  glyph = 0.54,
  leading = 1.14
): number {
  const chars = Math.max(1, [...text].length);
  for (let size = max; size > min; size -= 1) {
    const perLine = Math.max(1, Math.floor(width / (size * glyph)));
    const words = text.split(/\s+/);
    let lines = 1;
    let used = 0;
    for (const w of words) {
      const len = [...w].length + (used ? 1 : 0);
      if (used + len > perLine && used > 0) {
        lines += 1;
        used = [...w].length;
      } else {
        used += len;
      }
    }
    if (chars / perLine > lines) lines = Math.ceil(chars / perLine);
    if (lines * size * leading <= height) return size;
  }
  return min;
}

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { GameConfig, GameSessionState, QuestionCard } from '@/features/shared';

import { StyleSheet } from 'react-native';
import PlayQuestionScreen, {
  getQuestionTextSafeWidth,
  getQuestionViewportScale,
} from '@/app/(app)/play/question';
import { PALETTES } from '@/constants/theme';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import { useLocaleStore } from '@/store/locale';
import {
  clearQuestionTranslations,
  registerQuestionTranslations,
} from '@/features/play/data';
import { router } from '../doubles/expoRouter';
import { __setI18nLocaleAwareTextStyle } from '../doubles/useI18n';

function createQuestion(
  overrides: Partial<QuestionCard> & Pick<QuestionCard, 'id' | 'canonicalKey'>
): QuestionCard {
  return {
    id: overrides.id,
    canonicalKey: overrides.canonicalKey,
    categoryId: overrides.categoryId ?? 'cat_science',
    categoryName: overrides.categoryName ?? 'Science',
    prompt: overrides.prompt ?? 'What is the answer?',
    answer: overrides.answer ?? '42',
    promptImageUrl: overrides.promptImageUrl,
    answerImageUrl: overrides.answerImageUrl,
    pointValue: overrides.pointValue ?? 200,
    locale: overrides.locale ?? 'en',
    resolvedFromFallback: overrides.resolvedFromFallback ?? false,
    used: overrides.used ?? false,
    boardSide: overrides.boardSide,
    rumbleFirstTeamId: overrides.rumbleFirstTeamId,
    rumbleSecondTeamId: overrides.rumbleSecondTeamId,
  };
}

function createSession(overrides: Partial<GameSessionState> = {}): GameSessionState {
  const board = overrides.board ?? [createQuestion({ id: 'q-1', canonicalKey: 'science:200:1' })];
  const teams =
    overrides.teams ??
    [
      { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 0, wagersUsed: 0 },
      { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
      { id: 'team_3', name: 'Gamma', playerNames: ['Gia'], score: 0, wagersUsed: 0 },
    ];

  const config: GameConfig =
    overrides.config ??
    {
      mode: overrides.mode ?? 'rumble',
      teams: teams.map(({ id, name, playerNames }) => ({ id, name, playerNames })),
      categories: ['science'],
      contentLocaleChain: ['en'],
      quickPlayTopicCount: 3,
      hotSeatEnabled: false,
      wagerEnabled: false,
      wagersPerTeam: 0,
    };

  return {
    id: 'session-question',
    mode: overrides.mode ?? 'rumble',
    config,
    contentLocaleChain: ['en'],
    step: 'question',
    phase: 'questionReveal',
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
      team_1: 0,
      team_2: 0,
      team_3: 0,
    },
    usedQuestionIds: new Set(),
    seed: 'seed-question',
    wagersPerTeam: 0,
    wager: null,
    bonus: {
      active: false,
      played: false,
      multiplier: 2,
    },
    scoreEvents: [],
    timerStartedAt: 1_000_000,
    ...overrides,
  };
}

describe('question viewport sizing', () => {
  it('keeps text clear of landscape cutout and navigation insets', () => {
    expect(getQuestionTextSafeWidth(844, 42, 48, 16)).toBe(738);
    expect(getQuestionTextSafeWidth(844, 0, 0, 16)).toBe(812);
  });

  it('scales web question chrome proportionally with viewport area', () => {
    expect(getQuestionViewportScale(1200, 675)).toBe(1);
    expect(getQuestionViewportScale(1800, 1012.5)).toBe(1.5);
    expect(getQuestionViewportScale(320, 480)).toBe(0.8);
  });
});

describe('PlayQuestionScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    usePlayStore.setState({ session: null, tokens: 5, rapidFire: null });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    act(() => {
      useThemeStore.setState({ paletteId: 'default' });
    });
  });

  it('keeps a dark canvas (no white flash) when currentQuestion is cleared mid next-turn', () => {
    act(() => {
      useThemeStore.setState({ paletteId: 'dark' });
      usePlayStore.setState({
        session: createSession({
          mode: 'classic',
          currentQuestion: undefined,
          board: [createQuestion({ id: 'q-empty', canonicalKey: 'science:200:empty' })],
        }),
      });
    });

    render(<PlayQuestionScreen />);

    const canvas = screen.getByTestId('question-turn-transition-canvas');
    const flat = StyleSheet.flatten(canvas.props.style);
    expect(flat.backgroundColor).toBe(PALETTES.dark.background);
    expect(flat.backgroundColor).not.toBe('#FFFFFF');
    expect(flat.backgroundColor).not.toBe('#F0EBE3');
  });

  it('uses dual party chips for rumble reveals and restores the timing guide across windows', () => {
    const question = createQuestion({
      id: 'q-rumble',
      canonicalKey: 'science:200:rumble',
      rumbleFirstTeamId: 'team_2',
      rumbleSecondTeamId: 'team_3',
    });

    usePlayStore.setState({
      session: createSession({
        currentQuestion: question,
        board: [question],
      }),
    });

    render(<PlayQuestionScreen />);

    // Shared chrome: back + topic/points meta + timer; teams live in party chips.
    expect(screen.getByLabelText('Back to question board')).toBeTruthy();
    expect(screen.getByText('TOPIC: SCIENCE | 200 POINTS')).toBeTruthy();
    expect(screen.getByTestId('rumble-party-chips')).toBeTruthy();
    expect(screen.getByTestId('rumble-skip-wait')).toBeTruthy();
    expect(screen.getByText('Skip wait')).toBeTruthy();
    expect(screen.getByLabelText('First team locked')).toBeTruthy();
    expect(screen.getByLabelText('Second team locked')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.getByTestId('rumble-timing-guide')).toBeTruthy();
    expect(
      screen.getByText('TEAM 1 APPEARS AFTER 30S, ANSWERS BY 60. TEAM 2 APPEARS AFTER 1:15.')
    ).toBeTruthy();

    jest.spyOn(Date, 'now').mockReturnValue(1_031_000);
    act(() => {
      jest.advanceTimersByTime(31_000);
    });

    expect(screen.getByLabelText('First team answering: Beta')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('ANSWERING')).toBeTruthy();
    expect(screen.getByLabelText('Second team locked')).toBeTruthy();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.getByText('BETA ANSWERS BY 60S.')).toBeTruthy();
    expect(screen.getByText('TOPIC: SCIENCE | 200 POINTS')).toBeTruthy();
    expect(screen.getByTestId('rumble-skip-wait')).toBeTruthy();

    jest.spyOn(Date, 'now').mockReturnValue(1_061_000);
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByLabelText('First team: Beta')).toBeTruthy();
    expect(screen.getByLabelText('Second team locked')).toBeTruthy();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.getByText('NEXT TEAM APPEARS AT 01:16.')).toBeTruthy();

    jest.spyOn(Date, 'now').mockReturnValue(1_076_000);
    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    expect(screen.getByLabelText('First team: Beta')).toBeTruthy();
    expect(screen.getByLabelText('Second team answering: Gamma')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
    expect(screen.getByText('GAMMA ANSWERS NOW. ROUND ENDS AT 01:30.')).toBeTruthy();
    expect(screen.queryByText('STEAL')).toBeNull();

    jest.spyOn(Date, 'now').mockReturnValue(1_090_000);
    act(() => {
      jest.advanceTimersByTime(14_000);
    });

    expect(screen.getByLabelText('First team: Beta')).toBeTruthy();
    expect(screen.getByLabelText('Second team: Gamma')).toBeTruthy();
    expect(screen.getByText('ROUND ENDED.')).toBeTruthy();
    expect(screen.queryByTestId('rumble-skip-wait')).toBeNull();
  });

  it('skips rumble wait stages from the Skip wait control', () => {
    const question = createQuestion({
      id: 'q-rumble-skip-ui',
      canonicalKey: 'science:200:rumble-skip-ui',
      rumbleFirstTeamId: 'team_2',
      rumbleSecondTeamId: 'team_3',
    });

    usePlayStore.setState({
      session: createSession({
        currentQuestion: question,
        board: [question],
      }),
    });

    render(<PlayQuestionScreen />);

    expect(screen.getByLabelText('First team locked')).toBeTruthy();
    expect(screen.getByLabelText('Second team locked')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('rumble-skip-wait'));
    });
    expect(screen.getByLabelText('First team answering: Beta')).toBeTruthy();
    expect(screen.getByText('BETA ANSWERS BY 60S.')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('rumble-skip-wait'));
    });
    expect(screen.getByLabelText('First team: Beta')).toBeTruthy();
    expect(screen.getByText('NEXT TEAM APPEARS AT 01:16.')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('rumble-skip-wait'));
    });
    expect(screen.getByLabelText('Second team answering: Gamma')).toBeTruthy();
    expect(screen.getByText('GAMMA ANSWERS NOW. ROUND ENDS AT 01:30.')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('rumble-skip-wait'));
    });
    expect(screen.getByText('ROUND ENDED.')).toBeTruthy();
    expect(screen.queryByTestId('rumble-skip-wait')).toBeNull();
  });

  it('keeps show answer unavailable until the second rumble team is revealed and keeps it available after 90 seconds', () => {
    const question = createQuestion({
      id: 'q-rumble',
      canonicalKey: 'science:200:rumble',
      rumbleFirstTeamId: 'team_2',
      rumbleSecondTeamId: 'team_3',
    });

    usePlayStore.setState({
      session: createSession({
        currentQuestion: question,
        board: [question],
      }),
    });

    render(<PlayQuestionScreen />);

    fireEvent.press(screen.getByText('SHOW ANSWER'));
    expect(router.replace).not.toHaveBeenCalledWith('/play/answer');

    jest.spyOn(Date, 'now').mockReturnValue(1_076_000);
    act(() => {
      jest.advanceTimersByTime(76_000);
    });

    fireEvent.press(screen.getByText('SHOW ANSWER'));
    expect(router.replace).not.toHaveBeenCalledWith('/play/answer');
    expect(screen.getByText('Who gets the points?')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();

    act(() => {
      usePlayStore.setState({
        session: createSession({
          currentQuestion: question,
          board: [question],
        }),
      });
    });
    jest.spyOn(Date, 'now').mockReturnValue(1_090_000);
    act(() => {
      jest.advanceTimersByTime(14_000);
    });

    fireEvent.press(screen.getByText('SHOW ANSWER'));
    expect(screen.getByText('Who gets the points?')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('auto-expires a question after ten minutes and reveals the answer with no points awarded', () => {
    const question = createQuestion({
      id: 'q-timeout',
      canonicalKey: 'science:200:timeout',
      answer: 'A clock',
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        currentQuestion: question,
        board: [question],
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 0, wagersUsed: 0 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
        ],
        scores: { team_1: 0, team_2: 0 },
        config: {
          mode: 'classic',
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
      }),
    });

    render(<PlayQuestionScreen />);

    jest.spyOn(Date, 'now').mockReturnValue(1_600_000);
    act(() => {
      jest.advanceTimersByTime(600_000);
    });

    expect(screen.getByTestId('timeout-result-status')).toBeTruthy();
    expect(screen.getByText("TIME'S UP")).toBeTruthy();
    expect(screen.getByText('NO POINTS AWARDED')).toBeTruthy();
    expect(screen.queryByText('The question expired. The answer is revealed and no points are awarded.')).toBeNull();
    expect(screen.queryByText('Points awarded.')).toBeNull();
    expect(screen.getByText('A clock')).toBeTruthy();
    expect(usePlayStore.getState().session?.lastAwardedTeamId).toBeNull();
    expect(usePlayStore.getState().session?.timedOutQuestionId).toBe('q-timeout');
  });

  it('shows a scrollable question body with prompt imagery for dense prompts', () => {
    const question = createQuestion({
      id: 'q-locale',
      canonicalKey: 'history:400:locale',
      locale: 'ar',
      prompt:
        'هذا سؤال طويل يحتوي على تفاصيل إضافية حتى نتحقق من أن الشاشة تبقى قابلة للقراءة عندما يزداد طول النص المعروض للمستخدم.',
      promptImageUrl: 'https://example.com/prompt.png',
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        currentQuestion: question,
        board: [question],
        config: {
          mode: 'classic',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['history'],
          contentLocaleChain: ['ar', 'en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: true,
          wagersPerTeam: 1,
        },
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 0, wagersUsed: 0 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
        ],
        scores: { team_1: 0, team_2: 0 },
      }),
    });

    render(<PlayQuestionScreen />);

    expect(screen.getByTestId('question-content-scroll')).toBeTruthy();
    expect(screen.getByTestId('question-prompt-image')).toBeTruthy();
  });

  it('lets unrevealed mobile questions wrap instead of shrinking to one unreadable line', () => {
    const prompt = 'Which tragic hero is known for thee of jealousy?';
    const question = createQuestion({
      id: 'q-mobile-readable',
      canonicalKey: 'literature:200:mobile-readable',
      categoryName: 'Shakespeare',
      prompt,
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        currentQuestion: question,
        board: [question],
        config: {
          mode: 'classic',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['literature'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: false,
          wagersPerTeam: 0,
        },
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 0, wagersUsed: 0 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
        ],
        scores: { team_1: 0, team_2: 0 },
      }),
    });

    render(<PlayQuestionScreen />);

    expect(screen.getByText(prompt).props.numberOfLines).toBe(3);
    expect(screen.getByText(prompt).props.minimumFontScale).toBe(0.72);
  });

  it('keeps the next-turn action docked after points are assigned in the embedded answer flow', () => {
    const question = createQuestion({
      id: 'q-next-turn-dock',
      canonicalKey: 'literature:200:next-turn-dock',
      categoryName: 'Shakespeare',
      prompt: 'Which tragic hero is known for thee of jealousy?',
      answer: 'Othello',
    });

    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        step: 'answer',
        phase: 'scoring',
        lastAwardedTeamId: 'team_1',
        currentQuestion: question,
        board: [question],
        config: {
          mode: 'classic',
          teams: [
            { id: 'team_1', name: 'Alpha', playerNames: ['Ava'] },
            { id: 'team_2', name: 'Beta', playerNames: ['Ben'] },
          ],
          categories: ['literature'],
          contentLocaleChain: ['en'],
          quickPlayTopicCount: 3,
          hotSeatEnabled: false,
          wagerEnabled: false,
          wagersPerTeam: 0,
        },
        teams: [
          { id: 'team_1', name: 'Alpha', playerNames: ['Ava'], score: 200, wagersUsed: 0 },
          { id: 'team_2', name: 'Beta', playerNames: ['Ben'], score: 0, wagersUsed: 0 },
        ],
        scores: { team_1: 200, team_2: 0 },
      }),
    });

    const { rerender } = render(<PlayQuestionScreen />);

    expect(screen.getByTestId('question-answer-next-turn-dock')).toBeTruthy();
    expect(screen.getByText('NEXT TURN')).toBeTruthy();

    act(() => useThemeStore.setState({ paletteId: 'dark' }));
    rerender(<PlayQuestionScreen />);

    expect(screen.getByTestId('question-answer-next-turn-text')).toHaveStyle({
      color: PALETTES.dark.textOnBackground,
    });
  });

  it('keeps the active wager multiplier visible through the question and answer states', () => {
    const question = createQuestion({
      id: 'q-wager-multiplier',
      canonicalKey: 'science:200:wager-multiplier',
    });
    const wager = {
      wageringTeamId: 'team_1',
      targetTeamId: 'team_2',
      multiplier: 1.5 as const,
      question,
    };

    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        currentQuestion: question,
        board: [question],
        wager,
      }),
    });

    render(<PlayQuestionScreen />);
    expect(
      screen.getByText('Wager x1.5 (Correct: 1.5x gain, incorrect: 1x loss)')
    ).toBeTruthy();

    act(() => {
      usePlayStore.setState({
        session: createSession({
          mode: 'classic',
          step: 'answer',
          phase: 'answerLock',
          currentQuestion: question,
          board: [question],
          wager,
        }),
      });
    });

    expect(
      screen.getByText('Wager x1.5 (Correct: 1.5x gain, incorrect: 1x loss)')
    ).toBeTruthy();
  });

  it('hides the report control until the answer is revealed', () => {
    const question = createQuestion({
      id: 'q-report-hidden',
      canonicalKey: 'science:200:report-hidden',
    });

    usePlayStore.setState({
      session: createSession({
        currentQuestion: question,
        board: [question],
      }),
    });

    render(<PlayQuestionScreen />);
    expect(screen.queryByTestId('question-report-button')).toBeNull();
  });

  it('opens the report modal from the post-reveal control', () => {
    const question = createQuestion({
      id: 'q-report-open',
      canonicalKey: 'science:200:report-open',
      prompt: 'Which tragic hero is known for thee of jealousy?',
      answer: 'Othello',
    });

    usePlayStore.setState({
      session: createSession({
        step: 'answer',
        phase: 'scoring',
        currentQuestion: question,
        board: [question],
      }),
    });

    render(<PlayQuestionScreen />);
    expect(screen.getByTestId('question-report-button')).toBeTruthy();
    expect(screen.getByText('Report question/answer')).toBeTruthy();
    expect(screen.queryByTestId('question-report-modal')).toBeNull();

    fireEvent.press(screen.getByTestId('question-report-button'));
    expect(screen.getByTestId('question-report-modal')).toBeTruthy();
  });
});

describe('PlayQuestionScreen with two content languages', () => {
  const KEY = 'q900001';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    __setI18nLocaleAwareTextStyle(true);
    registerQuestionTranslations('ja', {
      [KEY]: { prompt: '日本の首都はどこですか？', answer: '東京' },
    });
    registerQuestionTranslations('ar', {
      [KEY]: { prompt: 'ما هي عاصمة اليابان؟', answer: 'طوكيو' },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    clearQuestionTranslations();
    act(() => {
      useLocaleStore.setState({ contentLocales: { primary: null, secondary: null } });
      usePlayStore.setState({ session: null });
    });
  });

  function showQuestion(overrides: Partial<GameSessionState> = {}) {
    const question = createQuestion({
      id: 'q-bilingual',
      canonicalKey: KEY,
      prompt: 'What is the capital of Japan?',
      answer: 'Tokyo',
    });
    usePlayStore.setState({
      session: createSession({
        mode: 'classic',
        currentQuestion: question,
        board: [question],
        ...overrides,
      }),
    });
  }

  it('shows the primary language with the secondary beneath it, each with its own direction', () => {
    act(() => {
      useLocaleStore.setState({ contentLocales: { primary: 'ja', secondary: 'ar' } });
    });
    showQuestion();

    render(<PlayQuestionScreen />);

    const primary = screen.getByTestId('question-primary-prompt');
    const secondary = screen.getByTestId('question-secondary-prompt');
    expect(primary).toHaveTextContent('日本の首都はどこですか？');
    expect(primary).toHaveStyle({ writingDirection: 'ltr' });
    expect(secondary).toHaveTextContent('ما هي عاصمة اليابان؟');
    expect(secondary).toHaveStyle({ writingDirection: 'rtl' });
    expect(screen.queryByText('What is the capital of Japan?')).toBeNull();
  });

  it('shows the secondary answer beneath the primary answer once revealed', () => {
    act(() => {
      useLocaleStore.setState({ contentLocales: { primary: 'ar', secondary: 'ja' } });
    });
    showQuestion({ step: 'answer', phase: 'answerLock' });

    render(<PlayQuestionScreen />);

    expect(screen.getByText('طوكيو')).toHaveStyle({ writingDirection: 'rtl' });
    expect(screen.getByTestId('answer-secondary-answer')).toHaveTextContent('東京');
    expect(screen.getByTestId('answer-secondary-answer')).toHaveStyle({ writingDirection: 'ltr' });
  });

  it('falls back to English in the slot whose language has no variant', () => {
    act(() => {
      useLocaleStore.setState({ contentLocales: { primary: 'ar', secondary: 'sw' } });
    });
    showQuestion();

    render(<PlayQuestionScreen />);

    expect(screen.getByTestId('question-primary-prompt')).toHaveTextContent('ما هي عاصمة اليابان؟');
    expect(screen.getByTestId('question-secondary-prompt')).toHaveTextContent(
      'What is the capital of Japan?'
    );
    expect(screen.getByTestId('question-secondary-prompt')).toHaveStyle({ writingDirection: 'ltr' });
  });

  it('keeps the single-language layout when only one language is set', () => {
    act(() => {
      useLocaleStore.setState({ contentLocales: { primary: 'ja', secondary: null } });
    });
    showQuestion();

    render(<PlayQuestionScreen />);

    expect(screen.getByTestId('question-primary-prompt')).toHaveTextContent('日本の首都はどこですか？');
    expect(screen.queryByTestId('question-secondary-prompt')).toBeNull();
  });
});

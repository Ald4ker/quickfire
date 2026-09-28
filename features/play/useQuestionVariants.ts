import { useMemo } from 'react';
import type { QuestionCard } from '@/features/shared';
import { resolveQuestionVariants, type QuestionVariants } from '@/features/play/data';
import { useLocaleStore } from '@/store/locale';

/**
 * The on-screen variants of the current question: primary content language, plus the secondary
 * one beneath it when the player has picked two. Selection is by `canonicalKey`, so both
 * languages always show the same question.
 */
export function useQuestionVariants(
  question: QuestionCard | null | undefined
): QuestionVariants | null {
  const contentLocales = useLocaleStore((state) => state.contentLocales);

  return useMemo(
    () => (question ? resolveQuestionVariants(question, contentLocales) : null),
    [question, contentLocales]
  );
}

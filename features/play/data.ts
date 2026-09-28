import { mark } from '@/lib/startupTiming';
import rawQuestions from '@/constants/questions.json';
import { groupRumbleQuestionsByValueBucket, normalizeRumbleTopicCount } from '@/features/play/rumble';
import type { CategoryOption, GameMode, QuestionCard } from '@/features/shared';
import type {
  ContentLocale,
  ContentLocalePriority,
  NonEnglishContentLocale,
} from '@/lib/i18n/config';
import { questionCanonicalKey } from '@/features/play/canonicalKey';
import { normalizeQuickPlayTopicCount } from '@/features/play/tokenCosts';

interface SourceQA {
  /** Permanent spreadsheet UserID; the canonical key is `q<userId>` (see canonicalKey.ts). */
  userId?: string;
  text: string;
  answer: string;
  imageKey?: string;
}

interface SourceGroup {
  id: string;
  questionAndanswer: SourceQA[];
  categoryId: string;
  name: string;
  points: number;
}

/** One translated question variant, as stored in `constants/translations/<locale>.json`. */
export type LocalizedQuestion = Pick<QuestionCard, 'prompt' | 'answer'>;

/** A per-locale pack: canonical key (`q<UserID>`) to translated prompt and answer. */
export type QuestionTranslationPack = Record<string, LocalizedQuestion>;

function getGroupSignature(group: SourceGroup) {
  const entries = group.questionAndanswer
    .map(({ text, answer }) => `${text.trim()}::${answer.trim()}`)
    .join('||');
  return `${group.categoryId}|${slugify(group.name)}|${group.points}|${entries}`;
}

function dedupeQuestionGroups(groups: SourceGroup[]) {
  const unique = new Map<string, SourceGroup>();

  for (const group of groups) {
    const signature = getGroupSignature(group);
    if (!unique.has(signature)) {
      unique.set(signature, group);
    }
  }

  return Array.from(unique.values());
}

mark('play data module evaluating (questions.json already parsed)');
// SAFETY: constants/questions.json is authored to the SourceGroup schema and validated by import tooling.
const QUESTION_GROUPS = dedupeQuestionGroups(rawQuestions as SourceGroup[]);
mark('questions deduped');
const CATEGORY_TRANSLATIONS: Partial<Record<ContentLocale, Record<string, string>>> = {};
/**
 * Translated question variants by content locale, keyed by canonical key. English is not stored
 * here: it always comes from the bundled `questions.json`. Packs are generated per locale by
 * `scripts/build-locale-packs.ts` into `constants/translations/<locale>.json` (gitignored) and
 * handed to `registerQuestionTranslations`; loading them at runtime is a separate change.
 */
const QUESTION_TRANSLATIONS: Partial<Record<NonEnglishContentLocale, QuestionTranslationPack>> = {};

let englishByCanonicalKey: Map<string, SourceQA> | null = null;

/** Bundled English question for a canonical key (built once, on first use). */
function getEnglishQuestion(canonicalKey: string): SourceQA | undefined {
  if (!englishByCanonicalKey) {
    englishByCanonicalKey = new Map();
    for (const group of QUESTION_GROUPS) {
      const slug = slugify(group.name);
      group.questionAndanswer.forEach((qa, index) => {
        const key = getCanonicalKey(group, slug, index);
        if (!englishByCanonicalKey!.has(key)) englishByCanonicalKey!.set(key, qa);
      });
    }
  }
  return englishByCanonicalKey.get(canonicalKey);
}

/** Add (or replace) the translated variants for one content locale. */
export function registerQuestionTranslations(
  locale: NonEnglishContentLocale,
  pack: QuestionTranslationPack
): void {
  QUESTION_TRANSLATIONS[locale] = { ...QUESTION_TRANSLATIONS[locale], ...pack };
}

/** Test helper: drop every registered translation pack. */
export function clearQuestionTranslations(): void {
  for (const locale of Object.keys(QUESTION_TRANSLATIONS)) {
    delete QUESTION_TRANSLATIONS[locale as NonEnglishContentLocale];
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickTwoDistinctIndices(length: number): [number, number] {
  if (length <= 1) return [0, 0];
  const a = Math.floor(Math.random() * length);
  let b = Math.floor(Math.random() * length);
  let guard = 0;
  while (b === a && guard < 64) {
    b = Math.floor(Math.random() * length);
    guard += 1;
  }
  if (b === a) b = (a + 1) % length;
  return [a, b];
}

function getCanonicalKey(group: SourceGroup, slug: string, index: number) {
  return questionCanonicalKey(group.questionAndanswer[index]!, slug, group.points, index);
}

function resolveCategoryTranslation(
  slug: string,
  englishTitle: string,
  localeChain: ContentLocale[]
) {
  for (const locale of localeChain) {
    const translatedTitle = CATEGORY_TRANSLATIONS[locale]?.[slug];

    if (translatedTitle) {
      return {
        title: translatedTitle,
        resolvedLocale: locale,
        fellBackToEnglish: locale === 'en',
      };
    }

    if (locale === 'en') {
      return {
        title: englishTitle,
        resolvedLocale: 'en' as const,
        fellBackToEnglish: true,
      };
    }
  }

  return {
    title: englishTitle,
    resolvedLocale: 'en' as const,
    fellBackToEnglish: true,
  };
}

function resolveQuestionTranslation(
  canonicalKey: string,
  englishQuestion: SourceQA,
  localeChain: ContentLocale[]
) {
  for (const locale of localeChain) {
    const translatedQuestion =
      locale === 'en' ? undefined : QUESTION_TRANSLATIONS[locale]?.[canonicalKey];

    if (translatedQuestion) {
      return {
        prompt: translatedQuestion.prompt.trim(),
        answer: translatedQuestion.answer.trim(),
        locale,
        resolvedFromFallback: locale !== localeChain[0],
      };
    }

    if (locale === 'en') {
      return {
        prompt: englishQuestion.text.trim(),
        answer: englishQuestion.answer.trim(),
        locale: 'en' as const,
        resolvedFromFallback: localeChain[0] !== 'en',
      };
    }
  }

  return {
    prompt: englishQuestion.text.trim(),
    answer: englishQuestion.answer.trim(),
    locale: 'en' as const,
    resolvedFromFallback: localeChain[0] !== 'en',
  };
}

/** One language's text for a question, as shown on the question and answer views. */
export interface QuestionVariant {
  locale: ContentLocale;
  prompt: string;
  answer: string;
  /** True when the requested language had no variant and English is shown in its place. */
  fellBackToEnglish: boolean;
}

export interface QuestionVariants {
  primary: QuestionVariant;
  /** Present only when a secondary content language is set and differs from what primary shows. */
  secondary: QuestionVariant | null;
}

type VariantSource = Pick<QuestionCard, 'canonicalKey' | 'prompt' | 'answer' | 'locale'>;

function variantForLocale(question: VariantSource, locale: ContentLocale): QuestionVariant {
  if (locale !== 'en') {
    const translated = QUESTION_TRANSLATIONS[locale]?.[question.canonicalKey];
    if (translated) {
      return {
        locale,
        prompt: translated.prompt.trim(),
        answer: translated.answer.trim(),
        fellBackToEnglish: false,
      };
    }
  }

  if (question.locale === locale) {
    return {
      locale,
      prompt: question.prompt.trim(),
      answer: question.answer.trim(),
      fellBackToEnglish: false,
    };
  }

  const english = getEnglishQuestion(question.canonicalKey);
  if (english) {
    return {
      locale: 'en',
      prompt: english.text.trim(),
      answer: english.answer.trim(),
      fellBackToEnglish: locale !== 'en',
    };
  }

  // Not in the bundle (for example a question served by Convex): show the card as it came.
  return {
    locale: question.locale,
    prompt: question.prompt.trim(),
    answer: question.answer.trim(),
    fellBackToEnglish: question.locale === 'en' && locale !== 'en',
  };
}

/**
 * Resolve the chosen question (by canonical key) into the variants to show on screen: the primary
 * content language, and the secondary one beneath it when set. Each slot falls back to English on
 * its own when its language has no variant. With no content language set, primary is English.
 * The secondary slot is dropped when it would repeat exactly what primary shows (for example both
 * fell back to English), so the screen never shows the same text twice.
 */
export function resolveQuestionVariants(
  question: VariantSource,
  contentLocales: ContentLocalePriority
): QuestionVariants {
  const primary = variantForLocale(question, contentLocales.primary ?? 'en');
  if (!contentLocales.secondary || contentLocales.secondary === contentLocales.primary) {
    return { primary, secondary: null };
  }

  const secondary = variantForLocale(question, contentLocales.secondary);
  const repeatsPrimary =
    secondary.locale === primary.locale &&
    secondary.prompt === primary.prompt &&
    secondary.answer === primary.answer;

  return { primary, secondary: repeatsPrimary ? null : secondary };
}

export function getPlayableCategories(
  localeChain: ContentLocale[] = ['en']
): CategoryOption[] {
  const grouped = new Map<string, CategoryOption>();

  for (const group of QUESTION_GROUPS) {
    const slug = slugify(group.name);
    const existing = grouped.get(slug);
    if (existing) {
      existing.questionCount += group.questionAndanswer.length;
      continue;
    }
    const translation = resolveCategoryTranslation(slug, group.name, localeChain);
    grouped.set(slug, {
      id: group.categoryId,
      slug,
      title: translation.title,
      questionCount: group.questionAndanswer.length,
      resolvedLocale: translation.resolvedLocale,
      fellBackToEnglish: translation.fellBackToEnglish,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Some source topics ship multiple groups at the same point value.
 * The play board needs exactly one left/right pair per (topic, value),
 * so collapse extras before building tiles (required for balanced Rumble).
 */
function pickGroupsForBoard(categoryGroups: SourceGroup[]): SourceGroup[] {
  const byPoints = new Map<number, SourceGroup[]>();

  for (const group of categoryGroups) {
    if (!group.questionAndanswer.length) continue;
    const existing = byPoints.get(group.points) ?? [];
    existing.push(group);
    byPoints.set(group.points, existing);
  }

  return Array.from(byPoints.entries())
    .sort(([pointsA], [pointsB]) => pointsA - pointsB)
    .map(([, groups]) => pickRandom(groups));
}

export function buildBoard(
  categorySlugs: string[],
  localeChain: ContentLocale[] = ['en'],
  askedCanonicalKeys: ReadonlySet<string> = new Set()
): QuestionCard[] {
  const board: QuestionCard[] = [];

  for (const slug of categorySlugs) {
    const categoryGroups = QUESTION_GROUPS
      .filter((group) => slugify(group.name) === slug)
      .sort((a, b) => a.points - b.points);
    const groupsForBoard = pickGroupsForBoard(categoryGroups);

    for (const group of groupsForBoard) {
      const unaskedIndices = group.questionAndanswer
        .map((_, index) => index)
        .filter((index) => !askedCanonicalKeys.has(getCanonicalKey(group, slug, index)));
      const poolIndices = unaskedIndices.length >= 2
        ? unaskedIndices
        : group.questionAndanswer.map((_, index) => index);
      const [leftPoolIndex, rightPoolIndex] = pickTwoDistinctIndices(poolIndices.length);
      const iLeft = poolIndices[leftPoolIndex]!;
      const iRight = poolIndices[rightPoolIndex]!;
      const categoryTranslation = resolveCategoryTranslation(slug, group.name, localeChain);

      const pushSide = (index: number, side: 'left' | 'right') => {
        const qa = group.questionAndanswer[index]!;
        const canonicalKey = getCanonicalKey(group, slug, index);
        const resolvedQuestion = resolveQuestionTranslation(canonicalKey, qa, localeChain);
        board.push({
          id: `${group.categoryId}:${canonicalKey}:${side}`,
          canonicalKey,
          categoryId: group.categoryId,
          categoryName: categoryTranslation.title,
          prompt: resolvedQuestion.prompt,
          answer: resolvedQuestion.answer,
          promptImageKey: qa.imageKey,
          pointValue: group.points,
          locale: resolvedQuestion.locale,
          resolvedFromFallback: resolvedQuestion.resolvedFromFallback,
          used: false,
          boardSide: side,
        });
      };

      pushSide(iLeft, 'left');
      pushSide(iRight, 'right');
    }
  }

  return board;
}

export function getBonusQuestion(
  categorySlugs: string[],
  usedQuestionIds: Set<string>,
  localeChain: ContentLocale[] = ['en'],
  askedCanonicalKeys: ReadonlySet<string> = new Set()
): QuestionCard | null {
  const candidates: QuestionCard[] = [];

  for (const group of QUESTION_GROUPS) {
    const slug = slugify(group.name);
    if (!categorySlugs.includes(slug)) continue;
    for (let index = 0; index < group.questionAndanswer.length; index += 1) {
      const qa = group.questionAndanswer[index];
      const canonicalKey = getCanonicalKey(group, slug, index);
      const id = `${group.categoryId}:${canonicalKey}:bonus`;
      if (usedQuestionIds.has(id) || askedCanonicalKeys.has(canonicalKey)) continue;
      const resolvedQuestion = resolveQuestionTranslation(
        canonicalKey,
        qa,
        localeChain
      );
      const categoryTranslation = resolveCategoryTranslation(
        slug,
        `${group.name} Bonus`,
        localeChain
      );
      candidates.push({
        id,
        canonicalKey,
        categoryId: group.categoryId,
        categoryName: categoryTranslation.title,
        prompt: resolvedQuestion.prompt,
        answer: resolvedQuestion.answer,
        promptImageKey: qa.imageKey,
        pointValue: group.points + 100,
        locale: resolvedQuestion.locale,
        resolvedFromFallback: resolvedQuestion.resolvedFromFallback,
        used: false,
      });
    }
  }

  return candidates.length ? pickRandom(candidates) : null;
}

export function defaultTopicCountForMode(mode: GameMode): number {
  if (mode === 'quickPlay') return 3;
  if (mode === 'rapidFire') return 5;
  return 6;
}

export function getModeCategoryCount(mode: GameMode, topicCount?: number): number {
  if (mode === 'quickPlay') return normalizeQuickPlayTopicCount(topicCount);
  if (mode === 'random') {
    if (
      topicCount === 1 ||
      topicCount === 2 ||
      topicCount === 3 ||
      topicCount === 4 ||
      topicCount === 5 ||
      topicCount === 6
    ) {
      return topicCount;
    }
    return 6;
  }
  if (mode === 'rumble') return normalizeRumbleTopicCount(topicCount);
  if (mode === 'rapidFire') return 5;
  return 6;
}

export function getRandomRemainingQuestion(
  board: QuestionCard[],
  usedQuestionIds: Set<string>,
  options?: { teamId?: string }
): QuestionCard | null {
  const remaining = board.filter((question) => !usedQuestionIds.has(question.id));
  if (!remaining.length) return null;
  if (options?.teamId) {
    const owned = remaining.filter((question) => question.assignedTeamId === options.teamId);
    if (owned.length) return pickRandom(owned);
  }
  return pickRandom(remaining);
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

/**
 * Fair random-mode ownership: each team gets an equal share of 100/200/300 tiles.
 * Falls back to whole-board balance if value buckets are uneven.
 */
export function assignRandomQuestionOwners(
  board: QuestionCard[],
  teamIds: string[]
): QuestionCard[] {
  if (teamIds.length < 2 || board.length === 0) return board;

  const assignments = new Map<string, string>();
  const byValueBucket = groupRumbleQuestionsByValueBucket(board);

  const assignBucket = (questions: QuestionCard[]) => {
    if (questions.length % teamIds.length !== 0) return false;
    const repeatsPerTeam = questions.length / teamIds.length;
    const owners = buildBalancedTeamSequence(teamIds, repeatsPerTeam);
    shuffleItems(questions).forEach((question, index) => {
      assignments.set(question.id, owners[index]!);
    });
    return true;
  };

  if (byValueBucket) {
    let ok = true;
    for (const questions of byValueBucket.values()) {
      if (!assignBucket(questions)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return board.map((question) => ({
        ...question,
        assignedTeamId: assignments.get(question.id),
      }));
    }
  }

  // ponytail: whole-board balance if buckets can't divide evenly
  if (!assignBucket(board)) return board;
  return board.map((question) => ({
    ...question,
    assignedTeamId: assignments.get(question.id),
  }));
}

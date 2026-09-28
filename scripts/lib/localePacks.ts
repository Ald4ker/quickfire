/**
 * Per-locale question packs built from the translation pack (`questions-long.csv.gz`).
 *
 * A locale pack maps canonical key (`q<UserID>`) to the translated prompt and answer, which is the
 * shape `registerQuestionTranslations` in `features/play/data.ts` takes. English is never packed:
 * the app's English text is the bundled `constants/questions.json`.
 */
import type { QuestionsLongRow } from './questionsLong';
import {
  CONTENT_LOCALES,
  isNonEnglishContentLocale,
  type NonEnglishContentLocale,
} from '../../lib/i18n/config';
import type { QuestionTranslationPack } from '../../features/play/data';

export interface BuildLocalePacksOptions {
  /** Only these locales (default: all 17 content locales). */
  locales?: readonly NonEnglishContentLocale[];
  /** Only these canonical keys (default: every key in the pack). */
  keys?: ReadonlySet<string>;
}

export interface LocalePackBuild {
  packs: Partial<Record<NonEnglishContentLocale, QuestionTranslationPack>>;
  /** Rows skipped per reason, for the build log. */
  skipped: {
    english: number;
    duplicate: number;
    unknownLocale: number;
    empty: number;
    filtered: number;
  };
}

export function buildLocalePacks(
  rows: readonly QuestionsLongRow[],
  options: BuildLocalePacksOptions = {}
): LocalePackBuild {
  const wanted = new Set<NonEnglishContentLocale>(options.locales ?? CONTENT_LOCALES);
  const packs: LocalePackBuild['packs'] = {};
  const skipped: LocalePackBuild['skipped'] = {
    english: 0,
    duplicate: 0,
    unknownLocale: 0,
    empty: 0,
    filtered: 0,
  };

  for (const row of rows) {
    if (row.locale === 'en') {
      skipped.english += 1;
      continue;
    }
    if (!isNonEnglishContentLocale(row.locale)) {
      skipped.unknownLocale += 1;
      continue;
    }
    if (row.status !== 'active') {
      skipped.duplicate += 1;
      continue;
    }
    if (!wanted.has(row.locale) || (options.keys && !options.keys.has(row.canonicalKey))) {
      skipped.filtered += 1;
      continue;
    }
    const prompt = row.prompt.trim();
    const answer = row.answer.trim();
    if (!row.canonicalKey || !prompt || !answer) {
      skipped.empty += 1;
      continue;
    }
    const pack = (packs[row.locale] ??= {});
    pack[row.canonicalKey] = { prompt, answer };
  }

  return { packs, skipped };
}

/** Stable JSON for a pack: keys sorted by UserID so regenerated files diff cleanly. */
export function serializeLocalePack(pack: QuestionTranslationPack): string {
  const sorted = Object.keys(pack).sort((a, b) => {
    const na = Number(a.replace(/^q/, ''));
    const nb = Number(b.replace(/^q/, ''));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
  const ordered: QuestionTranslationPack = {};
  for (const key of sorted) ordered[key] = pack[key]!;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

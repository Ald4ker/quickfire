/**
 * Push convex/seed/*.json (English) and the translation pack to a Convex deployment.
 *
 * Usage:
 *   bun run seed:push                          # dev (from .env.local)
 *   bun run seed:push -- --prod                # production
 *   bun run seed:push -- --skip-translations   # English only
 *   bun run seed:push -- --locales=ar,fr       # only these translation locales
 *   bun run seed:push -- --translations-only   # skip categories and English rows
 *
 * Translation rows come from constants/translations/questions-long.csv.gz (see
 * scripts/lib/questionsLong.ts). A row is pushed only if its canonical key exists in the
 * English seed, so translations can never outrun the English catalog.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { localesInPack, readQuestionsLong } from './lib/questionsLong';

const seedDir = path.join(process.cwd(), 'convex', 'seed');
const QUESTION_BATCH_SIZE = 200;
const TRANSLATION_BATCH_SIZE = 400;
const DEV_DEPLOYMENT = 'successful-wildcat-165';
const argv = process.argv.slice(2);
const prod = argv.includes('--prod');
const skipTranslations = argv.includes('--skip-translations');
const translationsOnly = argv.includes('--translations-only');
const localesArg = argv.find((arg) => arg.startsWith('--locales='));
const onlyLocales = localesArg
  ? new Set(localesArg.slice('--locales='.length).split(',').map((s) => s.trim()).filter(Boolean))
  : null;

function deploymentArgs(): string[] {
  if (prod) {
    return ['--prod'];
  }
  return ['--deployment-name', DEV_DEPLOYMENT];
}

type ConvexCliJson =
  | string
  | number
  | boolean
  | null
  | ConvexCliJson[]
  | { readonly [key: string]: ConvexCliJson | undefined };

type ConvexCliArgs = { readonly [key: string]: ConvexCliJson | undefined };

function runConvex(functionName: string, args: ConvexCliArgs, options?: { push?: boolean }) {
  const cliArgs = ['convex', 'run'];
  if (options?.push) {
    cliArgs.push('--push');
  }
  cliArgs.push(...deploymentArgs(), functionName, JSON.stringify(args));

  const result = spawnSync('bunx', cliArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`convex run ${functionName} failed:\n${detail}`);
  }

  return result.stdout.trim();
}

function pushCode() {
  if (!prod) {
    return;
  }

  const cliArgs = ['convex', 'deploy', '-y'];

  const result = spawnSync('bunx', cliArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error('convex deploy failed');
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

interface SeedQuestion {
  categorySlug: string;
  canonicalKey: string;
  prompt: string;
  answer: string;
  pointValue: number;
  locale: string;
  status: string;
  promptImageKey?: string;
}

function seedQuestionBatches(rows: SeedQuestion[], batchSize: number, label: string) {
  const batches = chunk(rows, batchSize);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  console.log(`Seeding ${rows.length} ${label} in ${batches.length} batches...`);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const result = runConvex('seed:seedQuestions', {
      // SAFETY: SeedQuestion rows are plain JSON matching the Convex seedQuestions validator.
      questions: batch.map((row) => ({ ...row })) as ConvexCliJson[],
    });
    // SAFETY: seed:seedQuestions returns { inserted, updated, skipped } counts.
    const parsed = JSON.parse(result) as { inserted: number; updated: number; skipped: number };
    inserted += parsed.inserted;
    updated += parsed.updated;
    skipped += parsed.skipped;
    if ((i + 1) % 25 === 0 || i + 1 === batches.length) {
      console.log(
        `  ${label} batch ${i + 1}/${batches.length}: ${inserted} inserted, ${updated} updated, ${skipped} skipped so far`
      );
    }
  }
  return { inserted, updated, skipped };
}

function loadTranslationRows(englishKeys: Set<string>, categorySlugs: Set<string>): SeedQuestion[] {
  const pack = readQuestionsLong();
  const locales = localesInPack(pack).filter((locale) => locale !== 'en');
  const wanted = onlyLocales ? locales.filter((locale) => onlyLocales.has(locale)) : locales;
  if (onlyLocales) {
    const unknown = [...onlyLocales].filter((locale) => !locales.includes(locale));
    if (unknown.length) {
      throw new Error(`--locales includes locales not in the pack: ${unknown.join(', ')}`);
    }
  }
  const wantedSet = new Set(wanted);

  const rows: SeedQuestion[] = [];
  let droppedDuplicate = 0;
  let droppedUnknownKey = 0;
  let droppedUnknownCategory = 0;
  const seen = new Set<string>();

  for (const row of pack) {
    if (row.locale === 'en' || !wantedSet.has(row.locale)) continue;
    if (row.status !== 'active') {
      droppedDuplicate += 1;
      continue;
    }
    if (!englishKeys.has(row.canonicalKey)) {
      droppedUnknownKey += 1;
      continue;
    }
    if (!categorySlugs.has(row.categorySlug)) {
      droppedUnknownCategory += 1;
      continue;
    }
    const dedupe = `${row.canonicalKey}\0${row.locale}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({
      categorySlug: row.categorySlug,
      canonicalKey: row.canonicalKey,
      prompt: row.prompt,
      answer: row.answer,
      pointValue: row.pointValue,
      locale: row.locale,
      status: 'active',
      ...(row.promptImageKey ? { promptImageKey: row.promptImageKey } : {}),
    });
  }

  console.log(
    `Translation pack: ${wanted.length} locales (${wanted.join(', ')}); ${rows.length} rows to seed; ` +
      `dropped ${droppedDuplicate} duplicate-status, ${droppedUnknownKey} unknown-key, ${droppedUnknownCategory} unknown-category rows`
  );
  return rows;
}

function main() {
  const categories = JSON.parse(
    fs.readFileSync(path.join(seedDir, 'categories.json'), 'utf8')
  ) as { slug: string }[];
  const translations = JSON.parse(
    fs.readFileSync(path.join(seedDir, 'categoryTranslations.json'), 'utf8')
  );
  const questions = JSON.parse(
    fs.readFileSync(path.join(seedDir, 'questions.json'), 'utf8')
  ) as SeedQuestion[];

  const target = prod ? 'production (energized-hummingbird-439)' : `development (${DEV_DEPLOYMENT})`;
  console.log(`Pushing seed to ${target}...`);

  console.log('Deploying Convex functions...');
  pushCode();

  let englishResult = { inserted: 0, updated: 0, skipped: 0 };
  if (!translationsOnly) {
    console.log(`Seeding ${categories.length} categories...`);
    runConvex('seed:seedCategories', {
      // SAFETY: seed JSON is validated by the Convex seedCategories validator.
      categories: categories as ConvexCliJson[],
    }, { push: !prod });

    console.log(`Seeding ${translations.length} category translations...`);
    runConvex('seed:seedCategoryTranslations', {
      // SAFETY: seed JSON is validated by the Convex seedCategoryTranslations validator.
      translations: translations as ConvexCliJson[],
    });

    const activeSlugs = categories.map((category) => category.slug);
    console.log('Retiring categories not in seed...');
    const retired = runConvex('seed:retireCategoriesNotInSeed', { activeSlugs });
    console.log(retired);

    englishResult = seedQuestionBatches(questions, QUESTION_BATCH_SIZE, 'English questions');

    console.log('Seeding token products...');
    runConvex('seed:seedTokenProducts', {});
  }

  let translationResult = { inserted: 0, updated: 0, skipped: 0 };
  if (!skipTranslations) {
    const englishKeys = new Set(questions.map((q) => q.canonicalKey));
    const categorySlugs = new Set(categories.map((category) => category.slug));
    const rows = loadTranslationRows(englishKeys, categorySlugs);
    translationResult = seedQuestionBatches(rows, TRANSLATION_BATCH_SIZE, 'translation rows');
  }

  console.log(
    `Done (${target}): English ${englishResult.inserted} inserted, ${englishResult.updated} updated, ${englishResult.skipped} skipped; ` +
      `translations ${translationResult.inserted} inserted, ${translationResult.updated} updated, ${translationResult.skipped} skipped`
  );
}

main();

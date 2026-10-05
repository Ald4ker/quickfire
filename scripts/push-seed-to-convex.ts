/**
 * Push convex/seed/*.json (English) and the translation pack to a Convex deployment.
 *
 * Usage:
 *   bun run seed:push                          # dev (from .env.local)
 *   bun run seed:push -- --prod                # production
 *   bun run seed:push -- --skip-translations   # English only
 *   bun run seed:push -- --locales=ar,fr       # only these translation locales
 *   bun run seed:push -- --translations-only   # skip categories and English rows
 *   bun run seed:push -- --dry-run-legacy-migration  # report what the migration would do
 *   bun run seed:push -- --skip-legacy-migration     # leave legacy rows alone
 *
 * Translation rows come from constants/translations/questions-long.csv.gz (see
 * scripts/lib/questionsLong.ts). A row is pushed only if its canonical key exists in the
 * English seed, so translations can never outrun the English catalog.
 *
 * After the English rows are seeded, the push retires the position-keyed rows
 * (`<slug>:<points>:<index>`) that the `q<UserID>` keys replaced, and remaps device
 * history onto the new keys. Both steps are idempotent and batched; see
 * scripts/lib/legacyQuestionKeys.ts and convex/seed.ts. Run with `--dry-run-legacy-migration`
 * against production first.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildLegacyQuestionKeyMap } from './lib/legacyQuestionKeys';
import { localesInPack, readQuestionsLong } from './lib/questionsLong';

const seedDir = path.join(process.cwd(), 'convex', 'seed');
const QUESTION_BATCH_SIZE = 200;
const TRANSLATION_BATCH_SIZE = 400;
const DEV_DEPLOYMENT = 'successful-wildcat-165';
/** Legacy position keys only ever existed for the English rows. */
const LEGACY_LOCALE = 'en';
const LEGACY_KEY_BATCH_SIZE = 250;
const LEGACY_MAPPING_CHUNK_SIZE = 2_000;
const HISTORY_PAGE_SIZE = 500;
/** Safety valve: 2,000 pages x 500 rows is far more device history than this app has. */
const HISTORY_MAX_PAGES_PER_CHUNK = 2_000;
const argv = process.argv.slice(2);
const prod = argv.includes('--prod');
const skipTranslations = argv.includes('--skip-translations');
const translationsOnly = argv.includes('--translations-only');
const skipLegacyMigration = argv.includes('--skip-legacy-migration');
const dryRunLegacyMigration = argv.includes('--dry-run-legacy-migration');
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

interface LegacyKeyPair {
  legacyKey: string;
  canonicalKey: string;
}

/**
 * Position key → `q<UserID>` for every English source row. Pairs whose canonical key is not
 * in the seed being pushed are dropped: the migration never guesses a target.
 */
function loadLegacyKeyPairs(englishKeys: Set<string>): LegacyKeyPair[] {
  const groups = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'constants', 'questions.json'), 'utf8')
  );
  const categories = JSON.parse(
    fs.readFileSync(path.join(seedDir, 'categories.json'), 'utf8')
  );
  const { mapping, unresolvedThemes, rowsWithoutUserId } = buildLegacyQuestionKeyMap(
    groups,
    categories
  );
  if (unresolvedThemes.length) {
    console.warn(
      `Legacy keys: no seed category for themeGroup(s) ${unresolvedThemes.join(', ')}; nothing inferred for them`
    );
  }

  const pairs: LegacyKeyPair[] = [];
  let droppedUnknownCanonical = 0;
  for (const [legacyKey, canonicalKey] of mapping) {
    if (!englishKeys.has(canonicalKey)) {
      droppedUnknownCanonical += 1;
      continue;
    }
    pairs.push({ legacyKey, canonicalKey });
  }

  console.log(
    `Legacy keys: ${pairs.length} position-keyed rows to migrate (${rowsWithoutUserId} source rows without a UserID, ` +
      `${droppedUnknownCanonical} without a matching seed row)`
  );
  return pairs;
}

function retireLegacyQuestions(pairs: LegacyKeyPair[]) {
  const batches = chunk(pairs, LEGACY_KEY_BATCH_SIZE);
  let retired = 0;
  let alreadyRetired = 0;
  let missingLegacy = 0;
  let missingCanonical = 0;

  console.log(`Migrating ${pairs.length} legacy question rows in ${batches.length} batches...`);
  for (let i = 0; i < batches.length; i += 1) {
    const result = runConvex('seed:retireLegacyQuestionKeys', {
      locale: LEGACY_LOCALE,
      dryRun: dryRunLegacyMigration,
      // SAFETY: LegacyKeyPair rows are plain JSON matching the validator.
      questions: batches[i].map((pair) => ({ ...pair })) as ConvexCliJson[],
    });
    // SAFETY: seed:retireLegacyQuestionKeys returns those four counters.
    const parsed = JSON.parse(result) as {
      retired: number;
      alreadyRetired: number;
      missingLegacy: number;
      missingCanonical: number;
    };
    retired += parsed.retired;
    alreadyRetired += parsed.alreadyRetired;
    missingLegacy += parsed.missingLegacy;
    missingCanonical += parsed.missingCanonical;
    if ((i + 1) % 10 === 0 || i + 1 === batches.length) {
      console.log(
        `  legacy batch ${i + 1}/${batches.length}: ${retired} retired, ${alreadyRetired} already retired, ` +
          `${missingLegacy} absent, ${missingCanonical} skipped so far`
      );
    }
  }

  return { retired, alreadyRetired, missingLegacy, missingCanonical };
}

/**
 * Walk device history once per mapping chunk, resuming from the cursor each call. A chunk
 * that cannot finish within the page budget is reported and skipped, so one stalled chunk
 * never blocks the rest.
 */
function remapLegacyQuestionHistory(pairs: LegacyKeyPair[]) {
  const chunks = chunk(pairs, LEGACY_MAPPING_CHUNK_SIZE);
  let remapped = 0;
  let scanned = 0;
  let incompleteChunks = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const mapping = chunks[i];
    let cursor: string | undefined;
    let done = false;

    for (let page = 0; page < HISTORY_MAX_PAGES_PER_CHUNK; page += 1) {
      const result = runConvex('seed:remapLegacyQuestionHistory', {
        dryRun: dryRunLegacyMigration,
        batchSize: HISTORY_PAGE_SIZE,
        cursor,
        // SAFETY: LegacyKeyPair rows are plain JSON matching the validator.
        mapping: mapping.map((pair) => ({ ...pair })) as ConvexCliJson[],
      });
      // SAFETY: seed:remapLegacyQuestionHistory returns those counters and a cursor.
      const parsed = JSON.parse(result) as {
        remapped: number;
        scanned: number;
        isDone: boolean;
        cursor: string | null;
      };
      remapped += parsed.remapped;
      scanned += parsed.scanned;
      if (parsed.isDone || parsed.cursor === null) {
        done = true;
        break;
      }
      cursor = parsed.cursor;
    }

    if (!done) {
      incompleteChunks += 1;
      console.warn(
        `  history chunk ${i + 1}/${chunks.length} hit the page cap after ${HISTORY_MAX_PAGES_PER_CHUNK} pages; re-run to continue`
      );
    }
    console.log(
      `  history chunk ${i + 1}/${chunks.length}: ${remapped} keys remapped, ${scanned} rows scanned so far`
    );
  }

  return { remapped, scanned, incompleteChunks };
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

  const englishKeys = new Set(questions.map((q) => q.canonicalKey));

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

    if (skipLegacyMigration) {
      console.log('Skipping legacy key migration (--skip-legacy-migration).');
    } else {
      const dryRunLabel = dryRunLegacyMigration ? ' (dry run, nothing written)' : '';
      const legacyPairs = loadLegacyKeyPairs(englishKeys);
      if (legacyPairs.length === 0) {
        console.log(`No legacy position keys to migrate${dryRunLabel}.`);
      } else {
        const retired = retireLegacyQuestions(legacyPairs);
        console.log(
          `Legacy rows${dryRunLabel}: ${retired.retired} retired, ${retired.alreadyRetired} already retired, ` +
            `${retired.missingLegacy} absent, ${retired.missingCanonical} left active (canonical row missing)`
        );
        const history = remapLegacyQuestionHistory(legacyPairs);
        console.log(
          `Device history${dryRunLabel}: ${history.remapped} keys remapped across ${history.scanned} scanned rows`
        );
      }
    }

    console.log('Seeding token products...');
    runConvex('seed:seedTokenProducts', {});
  }

  let translationResult = { inserted: 0, updated: 0, skipped: 0 };
  if (!skipTranslations) {
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

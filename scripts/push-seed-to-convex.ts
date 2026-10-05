/**
 * Push convex/seed/*.json (English) and the translation pack to a Convex deployment.
 *
 * Usage:
 *   bun run seed:push                          # dev (from .env.local)
 *   bun run seed:push -- --prod                # production
 *   bun run seed:push -- --skip-translations   # English only
 *   bun run seed:push -- --locales=ar,fr       # only these translation locales
 *   bun run seed:push -- --translations-only   # skip categories and English rows
 *   bun run seed:push -- --dry-run-legacy-migration      # report the migration only
 *   bun run seed:push -- --skip-legacy-migration         # leave legacy rows alone
 *   bun run seed:push -- --legacy-checkpoint='<token>'   # resume an interrupted walk
 *
 * Translation rows come from constants/translations/questions-long.csv.gz (see
 * scripts/lib/questionsLong.ts). A row is pushed only if its canonical key exists in the
 * English seed, so translations can never outrun the English catalog.
 *
 * Legacy key migration
 * --------------------
 * After the English rows are seeded, the push retires the `<slug>:<points>:<index>` rows
 * that the `q<UserID>` keys replaced and moves device history onto the new keys. The pairs
 * come from the frozen snapshot in convex/seed/legacyQuestionKeys.ts (generated from
 * 1992d4d -> 6291744 by scripts/build-legacy-question-keys.ts); nothing here recomputes them
 * from current source data.
 *
 * Each migration call is atomic and bounded. The migration as a whole is not: while it runs,
 * and while English seeding and retirement overlap, both copies of a question can be
 * playable. Seeding upserts by key and retirement only flips a status, so re-running is
 * always safe.
 *
 * An interrupted history walk exits non-zero and prints a `--legacy-checkpoint='<token>'`
 * command to resume with. The token carries the target selector, the frozen map version, the
 * mode (dry run or write) and the last confirmed cursor, and it is decoded and validated
 * before this script deploys, seeds or calls a migration. A token from another target,
 * another snapshot or the other mode is refused, and an empty or missing checkpoint means an
 * explicit restart instead of an empty cursor. Only confirmed pages advance the cursor, so a
 * retry never skips the page that failed. Every migration call also sends the expected
 * frozen map version, which the handler checks before it reads or writes.
 *
 * The cursor travels as opaque data inside one 16 KiB encoded-token budget, shared by the
 * encoder and the decoder, so nothing here assumes a cursor length and no emitted token is
 * one this script would refuse. A cursor too large for that budget is reported with an
 * accurate restart instruction instead of a token.
 *
 * The target selector separates this script's two targets (the named dev deployment and
 * prod). It does not independently prove the underlying account or environment identity, so
 * confirming which deployment a shell is pointed at is still the operator's job.
 *
 * `--dry-run-legacy-migration` is reporting only: it does not deploy, seed, retire or write.
 * The migration functions must therefore already be deployed to the target, code only
 * (`npx convex dev --once` for dev, `npx convex deploy -y` for prod). Do not use a full
 * seed:push as the preflight: it already runs the retirement. A dry run against a catalog
 * whose replacement rows are not seeded yet honestly reports them as missing.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LEGACY_QUESTION_KEY_VERSION,
} from '../convex/seed/legacyQuestionKeys';
import { localesInPack, readQuestionsLong } from './lib/questionsLong';

const seedDir = path.join(process.cwd(), 'convex', 'seed');
const QUESTION_BATCH_SIZE = 200;
const TRANSLATION_BATCH_SIZE = 400;
const DEV_DEPLOYMENT = 'successful-wildcat-165';
const LEGACY_KEY_BATCH_SIZE = 250;
const HISTORY_PAGE_SIZE = 500;
/**
 * Runaway guard for the history walk, which otherwise ends on `isDone`. Hitting it is
 * reported as incomplete with a resume cursor, so nothing is lost.
 */
const HISTORY_MAX_PAGES = 20_000;
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
const checkpointArg = argv.find((arg) => arg.startsWith('--legacy-checkpoint='));
const target = prod ? 'production (energized-hummingbird-439)' : `development (${DEV_DEPLOYMENT})`;

/**
 * A resume checkpoint, so an interrupted walk cannot be resumed against the wrong target,
 * the wrong frozen snapshot or the wrong mode. `target` distinguishes this script's prod
 * deployment from its named dev deployment; it does not independently prove the underlying
 * account or environment identity, which stays the operator's responsibility.
 */
interface LegacyCheckpoint {
  version: 1;
  target: string;
  mapVersion: string;
  mode: 'dry-run' | 'write';
  cursor: string;
}

const CHECKPOINT_MAX_ENCODED_BYTES = 16 * 1024;
/** base64url alphabet only, so the emitted command needs no escaping beyond quotes. */
const CHECKPOINT_ALPHABET = /^[A-Za-z0-9_-]+$/;

/**
 * Shared by the encoder and the decoder, so a token this script emits is always one its own
 * decoder accepts. One budget covers the whole token: a cursor is opaque here, so no cursor
 * length is assumed, and base64url plus JSON escaping are already paid for by the time the
 * finished token is measured. 16 KiB stays far below the per-argument limits of shells and
 * Convex.
 */
function assertCheckpointTokenShape(token: string) {
  if (!CHECKPOINT_ALPHABET.test(token)) {
    throw new Error('--legacy-checkpoint is not base64url encoded');
  }
  const bytes = Buffer.byteLength(token, 'utf8');
  if (bytes > CHECKPOINT_MAX_ENCODED_BYTES) {
    throw new Error(`--legacy-checkpoint is ${bytes} bytes, over the ${CHECKPOINT_MAX_ENCODED_BYTES} byte checkpoint budget`);
  }
}

function encodeCheckpoint(checkpoint: LegacyCheckpoint): string {
  const token = Buffer.from(JSON.stringify(checkpoint), 'utf8').toString('base64url');
  assertCheckpointTokenShape(token);
  return token;
}

function decodeCheckpoint(raw: string): LegacyCheckpoint {
  assertCheckpointTokenShape(raw);

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new Error('--legacy-checkpoint could not be decoded; copy it from a previous run');
  }

  const candidate = payload as Partial<LegacyCheckpoint> | null;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    candidate.version !== 1 ||
    typeof candidate.target !== 'string' ||
    typeof candidate.mapVersion !== 'string' ||
    (candidate.mode !== 'dry-run' && candidate.mode !== 'write') ||
    typeof candidate.cursor !== 'string'
  ) {
    throw new Error('--legacy-checkpoint is malformed; copy it from a previous run');
  }
  if (candidate.cursor.length === 0) {
    throw new Error(
      '--legacy-checkpoint has an unusable cursor (it must not be empty). ' +
        'Omit the checkpoint to restart the walk from the beginning.'
    );
  }

  const expectedMode = dryRunLegacyMigration ? 'dry-run' : 'write';
  const mismatches: string[] = [];
  if (candidate.target !== target) {
    mismatches.push(`target: checkpoint ${candidate.target}, this run ${target}`);
  }
  if (candidate.mapVersion !== LEGACY_QUESTION_KEY_VERSION) {
    mismatches.push(
      `frozen map version: checkpoint ${candidate.mapVersion}, this checkout ${LEGACY_QUESTION_KEY_VERSION}`
    );
  }
  if (candidate.mode !== expectedMode) {
    mismatches.push(`mode: checkpoint ${candidate.mode}, this run ${expectedMode}`);
  }
  if (mismatches.length) {
    throw new Error(
      `--legacy-checkpoint does not belong to this run:\n  ${mismatches.join('\n  ')}\n` +
        'Omit the checkpoint to restart the walk from the beginning.'
    );
  }

  return candidate as LegacyCheckpoint;
}

const checkpoint = checkpointArg
  ? decodeCheckpoint(checkpointArg.slice('--legacy-checkpoint='.length))
  : null;
const resumeCursor = checkpoint?.cursor;

(function validateFlags() {
  if (dryRunLegacyMigration && skipLegacyMigration) {
    throw new Error('--dry-run-legacy-migration and --skip-legacy-migration cannot be combined');
  }
  if (checkpoint && skipLegacyMigration) {
    throw new Error('--legacy-checkpoint cannot be combined with --skip-legacy-migration');
  }
})();

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

type Counter = {
  retired: number;
  alreadyRetired: number;
  missingLegacy: number;
  missingCanonical: number;
  inactiveCanonical: number;
  categoryMismatch: number;
  invalidPair: number;

  remapped: number;
  missingTarget: number;
  inactiveTarget: number;
  unmappedLegacyKeys: number;
  scanned: number;
};

type RetireBatch = Pick<
  Counter,
  'retired' | 'alreadyRetired' | 'missingLegacy' | 'missingCanonical' | 'inactiveCanonical' | 'categoryMismatch' | 'invalidPair'
> & {
  offset: number;
  processed: number;
  total: number;
  nextOffset: number | null;
  mapVersion: string;
};

type RemapPage = Pick<Counter, 'remapped' | 'missingTarget' | 'inactiveTarget' | 'categoryMismatch' | 'unmappedLegacyKeys' | 'scanned'> & {
  isDone: boolean;
  cursor: string | null;
  mapVersion: string;
};

function emptyCounters(): Counter {
  return {
    retired: 0,
    alreadyRetired: 0,
    missingLegacy: 0,
    missingCanonical: 0,
    inactiveCanonical: 0,
    categoryMismatch: 0,
    invalidPair: 0,
    remapped: 0,
    missingTarget: 0,
    inactiveTarget: 0,
    unmappedLegacyKeys: 0,
    scanned: 0,
  };
}

/**
 * The prerequisite for a dry run is deployed code only. A full seed:push is not a valid
 * preflight: it already runs the retirement. A dry run against a catalog where the
 * replacements were not seeded yet will honestly report them as missing rather than invent
 * anything.
 */
function callMigration(functionName: string, args: ConvexCliArgs, dryRun: boolean): string {
  try {
    return runConvex(functionName, args);
  } catch (error) {
    if (!dryRun) throw error;
    throw new Error(
      `${functionName} is not available on ${target}. A dry run never deploys, so the migration ` +
        `functions must already be deployed there: deploy code only (` +
        `${prod ? 'npx convex deploy -y' : 'npx convex dev --once'}) and do not seed.\n` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Consistency guard on the response; the handler already refuses a mismatched caller. */
function assertMapVersion(functionName: string, deployed: string) {
  if (deployed !== LEGACY_QUESTION_KEY_VERSION) {
    throw new Error(
      `${functionName} on ${target} reports frozen map version ${deployed}, but this checkout ships ` +
        `${LEGACY_QUESTION_KEY_VERSION}. Deploy the snapshot you mean to migrate with.`
    );
  }
}

/**
 * Quote-safe, bounded resume instruction. A missing confirmed position is an explicit
 * restart, never an empty Convex cursor, and the mode is preserved so following the
 * instruction cannot turn a dry run into a write.
 */
function resumeInstruction(dryRun: boolean, cursor: string | null): string {
  if (!cursor) {
    return 'no page has been confirmed yet; restart the walk by omitting --legacy-checkpoint';
  }

  let token: string;
  try {
    token = encodeCheckpoint({
      version: 1,
      target,
      mapVersion: LEGACY_QUESTION_KEY_VERSION,
      mode: dryRun ? 'dry-run' : 'write',
      cursor,
    });
  } catch {
    // Never present a token the decoder would refuse: state the limit and restart instead.
    return (
      `the confirmed cursor is ${Buffer.byteLength(cursor, 'utf8')} bytes, over the ` +
      `${CHECKPOINT_MAX_ENCODED_BYTES} byte resumable checkpoint budget, so no resume token can be emitted. ` +
      'Restart the walk by omitting --legacy-checkpoint; pages are idempotent, so a restart only costs time'
    );
  }

  const mode = dryRun ? ' --dry-run-legacy-migration' : '';
  return `bun run seed:push --${prod ? ' --prod' : ''}${mode} --legacy-checkpoint='${token}'`;
}

function retireLegacyQuestions(dryRun: boolean): Counter {
  const totals = emptyCounters();
  let offset = 0;
  let done = false;

  while (!done) {
    const raw = callMigration(
      'seed:retireLegacyQuestionKeys',
      {
        expectedMapVersion: LEGACY_QUESTION_KEY_VERSION,
        offset,
        batchSize: LEGACY_KEY_BATCH_SIZE,
        dryRun,
      },
      dryRun
    );
    // SAFETY: seed:retireLegacyQuestionKeys returns the counters declared in RetireBatch.
    const batch = JSON.parse(raw) as RetireBatch;
    assertMapVersion('seed:retireLegacyQuestionKeys', batch.mapVersion);

    for (const key of [
      'retired',
      'alreadyRetired',
      'missingLegacy',
      'missingCanonical',
      'inactiveCanonical',
      'categoryMismatch',
      'invalidPair',
    ] as const) {
      totals[key] += batch[key];
    }

    console.log(
      `  legacy rows ${batch.offset + batch.processed}/${batch.total}: ` +
        `${totals.retired} ${dryRun ? 'retirable' : 'retired'}, ${totals.alreadyRetired} already retired, ` +
        `${totals.missingLegacy} absent, ` +
        `${totals.missingCanonical + totals.inactiveCanonical + totals.categoryMismatch + totals.invalidPair} skipped`
    );

    if (batch.nextOffset === null) {
      done = true;
    } else {
      offset = batch.nextOffset;
    }
  }

  return totals;
}

function remapLegacyQuestionHistory(
  dryRun: boolean,
  startCursor: string | undefined
): Counter & { pages: number; done: boolean; resumeCursor: string | null } {
  const totals = emptyCounters();
  let cursor = startCursor;
  // Seeded from the validated checkpoint, so a failure on the first resumed page still
  // reports the position that checkpoint was confirmed at.
  let confirmedCursor: string | null = startCursor ?? null;
  let pages = 0;
  let done = false;

  try {
    while (!done && pages < HISTORY_MAX_PAGES) {
      const raw = callMigration(
        'seed:remapLegacyQuestionHistory',
        {
          expectedMapVersion: LEGACY_QUESTION_KEY_VERSION,
          cursor,
          batchSize: HISTORY_PAGE_SIZE,
          dryRun,
        },
        dryRun
      );
      // SAFETY: seed:remapLegacyQuestionHistory returns the counters declared in RemapPage.
      const page = JSON.parse(raw) as RemapPage;
      assertMapVersion('seed:remapLegacyQuestionHistory', page.mapVersion);

      for (const key of [
        'remapped',
        'missingTarget',
        'inactiveTarget',
        'categoryMismatch',
        'unmappedLegacyKeys',
        'scanned',
      ] as const) {
        totals[key] += page[key];
      }
      pages += 1;

      if (page.isDone) {
        done = true;
        break;
      }
      if (!page.cursor) {
        throw new Error('seed:remapLegacyQuestionHistory returned no cursor and is not done');
      }
      cursor = page.cursor;
      confirmedCursor = page.cursor;
      if (pages % 10 === 0) {
        console.log(
          `  history page ${pages}: ${totals.remapped} keys remapped across ${totals.scanned} scanned rows`
        );
      }
    }
  } catch (error) {
    console.error(
      `History walk stopped after ${pages} confirmed pages. Resume with:\n` +
        `  ${resumeInstruction(dryRun, confirmedCursor)}\n` +
        `  (frozen map version ${LEGACY_QUESTION_KEY_VERSION}, target ${target})`
    );
    throw error;
  }

  return { ...totals, pages, done, resumeCursor: done ? null : confirmedCursor };
}

/**
 * Runs both migration steps and returns the list of reasons the migration is not
 * provisionally complete. `missingLegacy` and `alreadyRetired` are expected on a fresh or
 * repeated run and are never problems.
 */
function runLegacyMigration(dryRun: boolean): string[] {
  const dryRunLabel = dryRun ? ' [dry run, nothing written]' : '';
  const retire = retireLegacyQuestions(dryRun);
  const history = remapLegacyQuestionHistory(dryRun, resumeCursor);

  console.log(
    `Legacy rows${dryRunLabel}: ${retire.retired} ${dryRun ? 'retirable' : 'retired'}, ` +
      `${retire.alreadyRetired} already retired, ${retire.missingLegacy} absent, ` +
      `${retire.missingCanonical} replacement missing, ${retire.inactiveCanonical} replacement not active, ` +
      `${retire.categoryMismatch} category mismatch, ${retire.invalidPair} invalid pair`
  );
  console.log(
    `Device history${dryRunLabel}: ${history.remapped} keys remapped across ${history.scanned} scanned rows ` +
      `(${history.pages} pages${history.done ? '' : ', incomplete'})`
  );

  const problems: string[] = [];
  if (retire.missingCanonical) {
    problems.push(`${retire.missingCanonical} legacy rows kept active because the replacement row is missing`);
  }
  if (retire.inactiveCanonical) {
    problems.push(`${retire.inactiveCanonical} legacy rows kept active because the replacement row is not active`);
  }
  if (retire.categoryMismatch) {
    problems.push(`${retire.categoryMismatch} legacy rows kept active because the replacement sits in another category`);
  }
  if (retire.invalidPair) {
    problems.push(`${retire.invalidPair} frozen pairs failed key-shape validation`);
  }
  if (history.missingTarget) {
    problems.push(`${history.missingTarget} history records left unchanged because the replacement row is missing`);
  }
  if (history.inactiveTarget) {
    problems.push(`${history.inactiveTarget} history records left unchanged because the replacement row is not active`);
  }
  if (history.categoryMismatch) {
    problems.push(`${history.categoryMismatch} history records left unchanged because the replacement sits in another category`);
  }
  if (history.unmappedLegacyKeys) {
    problems.push(
      `${history.unmappedLegacyKeys} history records hold position keys absent from the frozen snapshot ` +
        `(convex/seed/legacyQuestionKeys.ts). Inspect their provenance and land a separately reviewed mapping ` +
        `for them; this pinned snapshot is not regenerated to guess`
    );
  }
  if (!history.done) {
    problems.push(
      `history walk incomplete after ${history.pages} pages; resume with ` +
        resumeInstruction(dryRun, history.resumeCursor)
    );
  }

  return problems;
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

  console.log(`Pushing seed to ${target}...`);

  if (dryRunLegacyMigration) {
    console.log(
      'Dry run: reporting the legacy key migration only. Nothing is deployed, seeded, retired or written, ' +
        'and the migration functions must already be deployed to this target.'
    );
    const problems = runLegacyMigration(true);
    reportMigrationProblems(problems);
    return;
  }

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
      reportMigrationProblems(runLegacyMigration(false));
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

function reportMigrationProblems(problems: string[]) {
  if (problems.length === 0) {
    console.log('Legacy key migration complete.');
    return;
  }
  console.error('Legacy key migration INCOMPLETE:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exitCode = 1;
}

main();

/**
 * Verify the translation pack lines up with the English seed before anything is pushed.
 *
 * Checks:
 *   1. every English row in the pack has a matching canonical key in convex/seed/questions.json
 *      with the same prompt (trimmed); mismatches are listed;
 *   2. every non-English active row points at a key that exists in the English seed;
 *   3. per-locale counts, duplicate-status rows, rows with a source issue.
 *
 * Exit code 1 when an English key is missing from the seed or its prompt differs.
 *
 * Run: bun run seed:translations:check [path-to-pack]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_TRANSLATIONS_PACK, localesInPack, readQuestionsLong } from './lib/questionsLong';

interface SeedQuestion {
  categorySlug: string;
  canonicalKey: string;
  prompt: string;
  answer: string;
  locale: string;
  status: string;
}

function main() {
  const packPath = process.argv[2] ?? DEFAULT_TRANSLATIONS_PACK;
  const seedPath = path.join(process.cwd(), 'convex', 'seed', 'questions.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SeedQuestion[];
  const seedByKey = new Map(seed.map((row) => [row.canonicalKey, row] as const));

  const pack = readQuestionsLong(packPath);
  const locales = localesInPack(pack);
  console.log(`Pack: ${pack.length} rows, ${locales.length} locales: ${locales.join(', ')}`);
  console.log(`English seed: ${seed.length} rows`);

  const missingInSeed: string[] = [];
  const promptMismatch: { key: string; seed: string; pack: string }[] = [];
  const answerMismatch: { key: string; seed: string; pack: string }[] = [];
  const categoryMismatch: { key: string; seed: string; pack: string }[] = [];
  let englishActive = 0;
  let englishDuplicate = 0;

  for (const row of pack) {
    if (row.locale !== 'en') continue;
    if (row.status !== 'active') {
      englishDuplicate += 1;
      continue;
    }
    englishActive += 1;
    const seedRow = seedByKey.get(row.canonicalKey);
    if (!seedRow) {
      missingInSeed.push(row.canonicalKey);
      continue;
    }
    if (seedRow.prompt.trim() !== row.prompt.trim()) {
      promptMismatch.push({ key: row.canonicalKey, seed: seedRow.prompt, pack: row.prompt });
    }
    if (seedRow.answer.trim() !== row.answer.trim()) {
      answerMismatch.push({ key: row.canonicalKey, seed: seedRow.answer, pack: row.answer });
    }
    if (seedRow.categorySlug !== row.categorySlug) {
      categoryMismatch.push({ key: row.canonicalKey, seed: seedRow.categorySlug, pack: row.categorySlug });
    }
  }

  const seedNotInPack = seed.filter((row) => !pack.some((p) => p.locale === 'en' && p.canonicalKey === row.canonicalKey));

  const perLocale = new Map<string, { active: number; duplicate: number; unknownKey: number; issues: number }>();
  for (const row of pack) {
    if (row.locale === 'en') continue;
    const stats = perLocale.get(row.locale) ?? { active: 0, duplicate: 0, unknownKey: 0, issues: 0 };
    if (row.status !== 'active') {
      stats.duplicate += 1;
    } else {
      stats.active += 1;
      if (!seedByKey.has(row.canonicalKey)) stats.unknownKey += 1;
    }
    if (row.sourceIssue) stats.issues += 1;
    perLocale.set(row.locale, stats);
  }

  console.log(`English rows in pack: ${englishActive} active, ${englishDuplicate} duplicate-status`);
  console.log(`English keys missing from seed: ${missingInSeed.length}`);
  for (const key of missingInSeed.slice(0, 20)) console.log(`  ${key}`);
  console.log(`English prompt mismatches: ${promptMismatch.length}`);
  for (const m of promptMismatch.slice(0, 20)) console.log(`  ${m.key}\n    seed: ${m.seed}\n    pack: ${m.pack}`);
  console.log(`English answer mismatches (informational): ${answerMismatch.length}`);
  for (const m of answerMismatch.slice(0, 20)) console.log(`  ${m.key}: seed "${m.seed}" vs pack "${m.pack}"`);
  console.log(`Category slug mismatches (informational): ${categoryMismatch.length}`);
  for (const m of categoryMismatch.slice(0, 20)) console.log(`  ${m.key}: seed ${m.seed} vs pack ${m.pack}`);
  console.log(`Seed keys with no English row in the pack (informational): ${seedNotInPack.length}`);
  for (const row of seedNotInPack.slice(0, 20)) console.log(`  ${row.canonicalKey} (${row.categorySlug})`);

  console.log('Per locale (active / duplicate-status / unknown key / source issues):');
  for (const [locale, stats] of [...perLocale.entries()].sort()) {
    console.log(`  ${locale.padEnd(8)} ${stats.active} / ${stats.duplicate} / ${stats.unknownKey} / ${stats.issues}`);
  }

  const failed = missingInSeed.length > 0 || promptMismatch.length > 0;
  console.log(failed ? 'CHECK FAILED' : 'CHECK PASSED');
  process.exit(failed ? 1 : 0);
}

main();

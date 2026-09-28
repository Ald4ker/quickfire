/**
 * Build per-locale question packs from the translation pack.
 *
 * Reads `constants/translations/questions-long.csv.gz` (see scripts/lib/questionsLong.ts) and writes
 * one `constants/translations/<locale>.json` per content locale: canonical key -> { prompt, answer }.
 * Duplicate-status rows and English rows are left out (English stays in the bundled questions.json).
 *
 * The generated JSON files are gitignored: they are build output (about 1.3 MB per language), and
 * how the app loads them at runtime (bundled, or downloaded per language) is a separate decision.
 * Generate only what you need:
 *
 *   bun run packs:build                         # all 17 locales
 *   bun run packs:build -- --locales=ar,fr      # just these
 *   bun run packs:build -- --keys=q1,q57        # just these questions (for fixtures and checks)
 *   bun run packs:build -- --pack=path/to/questions-long.csv.gz --out=some/dir
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_TRANSLATIONS_PACK, readQuestionsLong } from './lib/questionsLong';
import { buildLocalePacks, serializeLocalePack } from './lib/localePacks';
import { isNonEnglishContentLocale, type NonEnglishContentLocale } from '../lib/i18n/config';

const DEFAULT_OUT_DIR = path.join('constants', 'translations');

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function main() {
  const packPath = readFlag('pack') ?? DEFAULT_TRANSLATIONS_PACK;
  const outDir = readFlag('out') ?? DEFAULT_OUT_DIR;
  const localeArgs = parseList(readFlag('locales'));
  const keyArgs = parseList(readFlag('keys'));

  const unknown = (localeArgs ?? []).filter((locale) => !isNonEnglishContentLocale(locale));
  if (unknown.length) {
    console.error(`Unknown content locale(s): ${unknown.join(', ')}`);
    process.exit(1);
  }
  // SAFETY: every entry was checked with isNonEnglishContentLocale above.
  const locales = localeArgs as NonEnglishContentLocale[] | undefined;

  const rows = readQuestionsLong(packPath);
  const { packs, skipped } = buildLocalePacks(rows, {
    locales,
    keys: keyArgs ? new Set(keyArgs) : undefined,
  });

  const absoluteOut = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);
  fs.mkdirSync(absoluteOut, { recursive: true });

  for (const [locale, pack] of Object.entries(packs)) {
    const file = path.join(absoluteOut, `${locale}.json`);
    const json = serializeLocalePack(pack);
    fs.writeFileSync(file, json, 'utf8');
    const kb = Math.round(Buffer.byteLength(json, 'utf8') / 1024);
    console.log(`${locale}: ${Object.keys(pack).length} questions -> ${path.relative(process.cwd(), file)} (${kb} KB)`);
  }

  console.log(
    `Skipped rows: english ${skipped.english}, duplicate ${skipped.duplicate}, ` +
      `unknown locale ${skipped.unknownLocale}, empty ${skipped.empty}, filtered ${skipped.filtered}`
  );
}

main();

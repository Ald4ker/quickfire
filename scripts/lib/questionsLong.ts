/**
 * Reader for the translation pack `constants/translations/questions-long.csv.gz`.
 *
 * One row per question per locale (English included). Columns:
 * userId, canonicalKey, topic, categorySlug, difficulty, pointValue, locale, prompt, answer,
 * status, duplicateOf, promptImageKey, sourceIssue
 *
 * The pack is generated outside the repo from the master translation spreadsheet
 * (see docs/CODEBASE_MAP.md, "Question data"). English rows are used only to verify alignment
 * with `constants/source-questions.csv`; the app's English text still comes from that CSV.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { decodeCsvBuffer, parseCsv } from './csv';

export const DEFAULT_TRANSLATIONS_PACK = path.join(
  'constants',
  'translations',
  'questions-long.csv.gz'
);

export const REQUIRED_COLUMNS = [
  'userId',
  'canonicalKey',
  'topic',
  'categorySlug',
  'difficulty',
  'pointValue',
  'locale',
  'prompt',
  'answer',
  'status',
] as const;

export interface QuestionsLongRow {
  userId: string;
  canonicalKey: string;
  topic: string;
  categorySlug: string;
  difficulty: string;
  pointValue: number;
  locale: string;
  prompt: string;
  answer: string;
  status: string;
  duplicateOf: string;
  promptImageKey: string;
  sourceIssue: string;
}

export function parseQuestionsLong(content: string): QuestionsLongRow[] {
  const table = parseCsv(content);
  const header = table[0];
  if (!header) {
    throw new Error('questions-long: empty file');
  }
  const col = new Map(header.map((name, index) => [name.trim(), index] as const));
  for (const required of REQUIRED_COLUMNS) {
    if (!col.has(required)) {
      throw new Error(`questions-long: missing column "${required}" (header: ${header.join(',')})`);
    }
  }
  const get = (row: string[], name: string) => (row[col.get(name) ?? -1] ?? '').trim();

  const rows: QuestionsLongRow[] = [];
  for (const row of table.slice(1)) {
    if (row.length < REQUIRED_COLUMNS.length) {
      continue;
    }
    const userId = get(row, 'userId');
    if (!userId) {
      continue;
    }
    rows.push({
      userId,
      canonicalKey: get(row, 'canonicalKey'),
      topic: get(row, 'topic'),
      categorySlug: get(row, 'categorySlug'),
      difficulty: get(row, 'difficulty'),
      pointValue: Number(get(row, 'pointValue')),
      locale: get(row, 'locale'),
      prompt: get(row, 'prompt'),
      answer: get(row, 'answer'),
      status: get(row, 'status') || 'active',
      duplicateOf: get(row, 'duplicateOf'),
      promptImageKey: get(row, 'promptImageKey'),
      sourceIssue: get(row, 'sourceIssue'),
    });
  }
  return rows;
}

export function readQuestionsLong(packPath = DEFAULT_TRANSLATIONS_PACK): QuestionsLongRow[] {
  const absolute = path.isAbsolute(packPath) ? packPath : path.join(process.cwd(), packPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`questions-long: pack not found at ${absolute}`);
  }
  let buffer = fs.readFileSync(absolute);
  if (absolute.endsWith('.gz')) {
    buffer = zlib.gunzipSync(buffer);
  }
  return parseQuestionsLong(decodeCsvBuffer(buffer));
}

/** Locales present in the pack, English first, then in first-seen order. */
export function localesInPack(rows: readonly QuestionsLongRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.locale);
  }
  const locales = [...seen].filter((locale) => locale !== 'en');
  return seen.has('en') ? ['en', ...locales] : locales;
}

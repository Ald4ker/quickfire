/**
 * Merge picture-topic groups into constants/questions.json and refresh categories.ts.
 *
 * Survives full CSV re-imports when run after import-questions-from-csv.ts:
 *   bun run seed:import  (includes this step)
 *
 * Standalone: bun run topics:picture:merge
 *
 * Picture rows also exist in the source spreadsheet (same text and answer), so each picture
 * question is given the spreadsheet `userId` found in the freshly imported catalog. That keeps
 * the stable `q<UserID>` key for picture questions and lets their translations line up.
 */
import * as fs from 'fs';
import * as path from 'path';

interface SourceQA {
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

const PICTURE_TOPICS = new Set(['Guess the Flag', 'Guess the Jersey']);

const CATEGORY_IDS: Record<string, string> = {
  'Guess the Flag': 'gen28',
  'Guess the Jersey': 'gen29',
};

function writeCategoriesTs(groups: SourceGroup[]) {
  const categoriesPath = path.join(process.cwd(), 'constants', 'categories.ts');
  const byTopic = new Map<string, string>();
  for (const group of groups) {
    if (!byTopic.has(group.name)) {
      byTopic.set(group.name, group.categoryId);
    }
  }

  const entries = [...byTopic.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const lines = entries.map(
    ([name, id]) => `  { id: '${id}', name: ${JSON.stringify(name)} },`
  );

  const contents = `/**
 * Categories derived from constants/questions.json (via scripts/import-questions-from-csv.ts).
 * Slug format matches scripts/normalize-questions.ts (slugify of name).
 * Used when Convex is not seeded.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Unique categories from questions.json: id, slug (for selection), title (English display) */
const RAW_CATEGORIES: { id: string; name: string }[] = [
${lines.join('\n')}
];

export const FALLBACK_CATEGORIES = RAW_CATEGORIES.map((c) => ({
  id: c.id,
  slug: slugify(c.name),
  title: c.name,
}));
`;

  fs.writeFileSync(categoriesPath, contents, 'utf-8');
  console.log(`Wrote ${entries.length} categories to ${categoriesPath}`);
}

function qaLookupKey(topic: string, qa: SourceQA): string {
  return `${topic}\0${qa.text.trim()}\0${qa.answer.trim()}`;
}

function main() {
  const questionsPath = path.join(process.cwd(), 'constants', 'questions.json');
  const pictureGroupsPath = path.join(
    process.cwd(),
    'constants',
    'picture-topics',
    'groups.json'
  );

  if (!fs.existsSync(pictureGroupsPath)) {
    console.error(`Missing ${pictureGroupsPath}. Run: python3 scripts/prepare-picture-topic-assets.py`);
    process.exit(1);
  }

  const existing = JSON.parse(fs.readFileSync(questionsPath, 'utf-8')) as SourceGroup[];
  const pictureGroups = JSON.parse(
    fs.readFileSync(pictureGroupsPath, 'utf-8')
  ) as SourceGroup[];

  // userId by (topic, text, answer) from the catalog's own picture rows (imported from the CSV).
  const userIdByQa = new Map<string, string>();
  for (const group of existing) {
    if (!PICTURE_TOPICS.has(group.name)) continue;
    for (const qa of group.questionAndanswer) {
      if (qa.userId) {
        userIdByQa.set(qaLookupKey(group.name, qa), qa.userId);
      }
    }
  }

  let withUserId = 0;
  let withoutUserId = 0;
  for (const group of pictureGroups) {
    const expectedId = CATEGORY_IDS[group.name];
    if (expectedId && group.categoryId !== expectedId) {
      group.categoryId = expectedId;
    }
    for (const qa of group.questionAndanswer) {
      const userId = qa.userId ?? userIdByQa.get(qaLookupKey(group.name, qa));
      if (userId) {
        qa.userId = userId;
        withUserId += 1;
      } else {
        withoutUserId += 1;
      }
    }
  }

  const kept = existing.filter((g) => !PICTURE_TOPICS.has(g.name));
  const merged = [...kept, ...pictureGroups].sort((a, b) => {
    if (a.categoryId !== b.categoryId) {
      return a.categoryId.localeCompare(b.categoryId);
    }
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    return a.points - b.points;
  });

  fs.writeFileSync(questionsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
  writeCategoriesTs(merged);

  const pictureCount = pictureGroups.reduce((n, g) => n + g.questionAndanswer.length, 0);
  console.log(
    `Merged ${pictureGroups.length} picture groups (${pictureCount} questions) into ${questionsPath}`
  );
  console.log(`Picture questions with a spreadsheet userId: ${withUserId}; without: ${withoutUserId}`);
  if (withoutUserId > 0) {
    console.warn('Picture questions without a userId keep legacy position keys; add them to the spreadsheet.');
  }
}

main();

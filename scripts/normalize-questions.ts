/**
 * Normalizes constants/questions.json into one-question-per-record format.
 * Output: convex/seed/questions.json, convex/seed/categories.json, convex/seed/categoryTranslations.json
 *
 * Canonical keys are `q<UserID>` (stable across re-imports and locales). Rows without a
 * userId keep the legacy `<slug>:<points>:<index>` key and are reported, so they can be fixed.
 * Each category also gets `questionCount` (unique active keys) so Convex never has to count
 * question rows at query time.
 *
 * Run with: npx tsx scripts/normalize-questions.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { questionCanonicalKey } from '../features/play/canonicalKey';

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

interface NormalizedCategory {
  slug: string;
  title: string;
  themeGroup: string;
  enabled: boolean;
  questionCount: number;
}

interface NormalizedCategoryTranslation {
  categorySlug: string;
  locale: string;
  title: string;
}

interface NormalizedQuestion {
  categorySlug: string;
  canonicalKey: string;
  prompt: string;
  answer: string;
  pointValue: number;
  locale: string;
  status: string;
  promptImageKey?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Temporarily hidden topics (not in spreadsheet — do not re-add). */
const DISABLED_THEME_GROUPS = new Set<string>();

/** Keep stable slugs when display titles change (avoids seed/DB collisions). */
const SLUG_BY_THEME_GROUP: Record<string, string> = {
  gen6: 'countries-and-capitals',
};

function main() {
  const inputPath = path.join(
    process.cwd(),
    'constants',
    'questions.json'
  );
  const seedDir = path.join(process.cwd(), 'convex', 'seed');
  const categoriesPath = path.join(seedDir, 'categories.json');
  const categoryTranslationsPath = path.join(seedDir, 'categoryTranslations.json');
  const questionsPath = path.join(seedDir, 'questions.json');

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const groups: SourceGroup[] = JSON.parse(raw);

  const categoryMap = new Map<string, NormalizedCategory>();
  const categoryTranslations: NormalizedCategoryTranslation[] = [];
  const questions: NormalizedQuestion[] = [];
  const keysByCategory = new Map<string, Set<string>>();
  const seenKeys = new Map<string, string>();
  let legacyKeys = 0;

  for (const g of groups) {
    const slug = SLUG_BY_THEME_GROUP[g.categoryId] ?? slugify(g.name);
    if (!categoryMap.has(slug)) {
      categoryMap.set(slug, {
        slug,
        title: g.name,
        themeGroup: g.categoryId,
        enabled: !DISABLED_THEME_GROUPS.has(g.categoryId),
        questionCount: 0,
      });
      categoryTranslations.push({
        categorySlug: slug,
        locale: 'en',
        title: g.name,
      });
    }

    for (const [index, qa] of g.questionAndanswer.entries()) {
      const canonicalKey = questionCanonicalKey(qa, slug, g.points, index);
      if (!qa.userId) {
        legacyKeys += 1;
      }
      const previous = seenKeys.get(canonicalKey);
      if (previous) {
        console.warn(`Duplicate canonical key ${canonicalKey} in ${slug} (first seen in ${previous}); skipping`);
        continue;
      }
      seenKeys.set(canonicalKey, slug);

      const row: NormalizedQuestion = {
        categorySlug: slug,
        canonicalKey,
        prompt: qa.text,
        answer: qa.answer,
        pointValue: g.points,
        locale: 'en',
        status: 'active',
      };
      if (qa.imageKey) {
        row.promptImageKey = qa.imageKey;
      }
      questions.push(row);

      const keys = keysByCategory.get(slug) ?? new Set<string>();
      keys.add(canonicalKey);
      keysByCategory.set(slug, keys);
    }
  }

  for (const category of categoryMap.values()) {
    category.questionCount = keysByCategory.get(category.slug)?.size ?? 0;
  }

  const categories = Array.from(categoryMap.values());

  if (!fs.existsSync(seedDir)) {
    fs.mkdirSync(seedDir, { recursive: true });
  }

  fs.writeFileSync(
    categoriesPath,
    JSON.stringify(categories, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    categoryTranslationsPath,
    JSON.stringify(categoryTranslations, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    questionsPath,
    JSON.stringify(questions, null, 2),
    'utf-8'
  );

  console.log(`Wrote ${categories.length} categories to ${categoriesPath}`);
  console.log(`Wrote ${categoryTranslations.length} category translations to ${categoryTranslationsPath}`);
  console.log(`Wrote ${questions.length} questions to ${questionsPath}`);
  if (legacyKeys > 0) {
    console.warn(`${legacyKeys} questions have no userId and use legacy position keys`);
  }
}

main();

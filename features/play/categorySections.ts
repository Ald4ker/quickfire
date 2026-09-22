import type { CategoryOption } from '@/features/shared';

export type CategorySectionId = 'general' | 'history' | 'popCulture' | 'sports' | 'gaming';

export interface CategorySection {
  id: CategorySectionId;
  title: string;
  categories: CategoryOption[];
}

const TOPICS = {
  general: [
    'Corporations', 'Capital Cities', 'Famous Firsts',
    'General Knowledge', 'Geography', 'Guess the Decade', 'Guess the Flag', 'In between:', 'Initials',
    'Invented Where?', 'Match the Nickname', 'National Icons',
    'Odd One Out', 'Science', 'Trump Quotes', 'Two Truths and a Lie', 'UK', 'USA',
    'What year?', 'What’s the Connection?', 'Which Country?',
  ],
  history: [
    '19th Century', '19th Century Europe', '20th Century', '21st Century',
    'Ancient Civilisations', 'Cold War', 'European Christendom', 'European History',
    'Talab-ul Ilm', 'The Modern Middle East', 'UK History', 'US History', 'WW1', 'WW2',
  ],
  popCulture: [
    'Attack on Titan', 'Avatar: The Last Airbender',
    'Breaking Bad', 'DC Extended Universe', 'Dexter', 'Disney', 'Dragon Ball',
    'Fast and Furious', 'Friends', 'Game of Thrones', 'Halo',
    'Harry Potter', 'How I Met Your Mother', 'James Bond', 'Kuruluş: Osman',
    'Marvel', 'Naruto', 'One Piece', 'Peaky Blinders', 'Pirates of the Caribbean',
    'Pokémon', 'Prison Break', 'SpongeBob SquarePants', 'Star Wars',
    'Stranger Things', 'Suits', 'The Big Bang Theory', 'The Office US',
  ],
  sports: [
    'Cricket', 'FIFA World Cup', 'Formula 1', 'Guess the Jersey', 'NBA', 'Premier League', 'UFC',
    'UEFA Champions League', 'Which Player?',
  ],
  gaming: [
    'ARK: Survival Evolved', 'Dota', 'League of Legends', 'Minecraft', 'Overwatch',
    'Red Dead Redemption', 'Super Mario Bros.', 'The Legend of Zelda',
  ],
} as const satisfies Record<CategorySectionId, readonly string[]>;

const SECTION_ORDER: CategorySectionId[] = ['general', 'history', 'popCulture', 'sports', 'gaming'];
const SECTION_TITLES = {
  general: 'General Knowledge',
  history: 'History',
  popCulture: 'Pop Culture',
  sports: 'Sports',
  gaming: 'Gaming',
} as const satisfies Record<CategorySectionId, string>;

function topicKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getCategorySectionId(categoryId: string): CategorySectionId {
  if (categoryId.startsWith('gen')) return 'general';
  if (categoryId.startsWith('h')) return 'history';
  if (categoryId.startsWith('pc')) return 'popCulture';
  if (categoryId.startsWith('s')) return 'sports';
  if (/^g\d+$/.test(categoryId)) return 'gaming';
  return 'general';
}

export function groupCategoriesBySection(categories: CategoryOption[]): CategorySection[] {
  const byTitle = new Map(categories.map((category) => [topicKey(category.title), category]));

  return SECTION_ORDER.map((id) => ({
    id,
    title: SECTION_TITLES[id],
    categories: TOPICS[id].flatMap((title) => {
      const key = topicKey(title);
      const category = byTitle.get(key) ?? (key === 'modern-middle-east' ? byTitle.get('the-modern-middle-east') : undefined);
      return category ? [{ ...category, title }] : [];
    }),
  })).filter((section) => section.categories.length > 0);
}

/** Only the sole highest-scoring team leads; ties do not highlight team 1 by default. */
export function getLeadingTeamId(teams: { id: string; score: number }[]): string | undefined {
  const highScore = Math.max(...teams.map((team) => team.score));
  const leaders = teams.filter((team) => team.score === highScore);
  return leaders.length === 1 ? leaders[0]?.id : undefined;
}

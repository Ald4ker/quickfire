/**
 * Category artwork - local images from assets/topics/ only (512px WebP thumbs).
 * Categories without a bundled image resolve to null; UI shows MISSING.
 * Regenerate: `bun run topics:optimize` (expects PNG masters if re-exporting).
 */

import type { ImageSource } from 'expo-image';

/** Shown in place of category art when no local image is mapped. */
export const MISSING_CATEGORY_PICTURE_LABEL = 'MISSING';

// ── Local images (require() for Metro bundler) ──────────────────────────

const LOCAL: Record<string, ImageSource> = {
  h1: require('../assets/topics/19th_cent.webp'),
  h2: require('../assets/topics/19th_cent_eu.webp'),
  h3: require('../assets/topics/20th_century.webp'),
  h4: require('../assets/topics/21st_cent.webp'),
  h5: require('../assets/topics/ancient_civilisations.webp'),
  h7: require('../assets/topics/cold_war.webp'),
  h8: require('../assets/topics/European_history.webp'),
  h11: require('../assets/topics/modern_middle_east.webp'),
  h12: require('../assets/topics/UK_history.webp'),
  h13: require('../assets/topics/american_history.webp'),
  g1: require('../assets/topics/ark-survival-evolved.webp'),
  g3: require('../assets/topics/dota.webp'),
  g5: require('../assets/topics/halo.webp'),
  g6: require('../assets/topics/LoL.webp'),
  g7: require('../assets/topics/minecraft.webp'),
  g8: require('../assets/topics/overwatch.webp'),
  g9: require('../assets/topics/RDR2.webp'),
  g10: require('../assets/topics/super_mario_bros.webp'),
  g11: require('../assets/topics/the-legend-of-zelda.webp'),
  pc1: require('../assets/topics/atla.webp'),
  pc2: require('../assets/topics/breaking_bad.webp'),
  pc3: require('../assets/topics/dexter.webp'),
  pc4: require('../assets/topics/DC.webp'),
  pc5: require('../assets/topics/disney.webp'),
  pc6: require('../assets/topics/dragon_ball.webp'),
  pc7: require('../assets/topics/friends.webp'),
  pc8: require('../assets/topics/game_of_thrones.webp'),
  pc9: require('../assets/topics/harry_potter.webp'),
  pc10: require('../assets/topics/himym.webp'),
  pc11: require('../assets/topics/James_bond.webp'),
  pc13: require('../assets/topics/mcu.webp'),
  pc14: require('../assets/topics/naruto.webp'),
  pc15: require('../assets/topics/one_piece.webp'),
  pc16: require('../assets/topics/PotC.webp'),
  pc17: require('../assets/topics/pokemon.webp'),
  pc18: require('../assets/topics/prison-break.webp'),
  pc20: require('../assets/topics/spongebob.webp'),
  pc23: require('../assets/topics/star-wars.webp'),
  pc24: require('../assets/topics/stranger-things.webp'),
  pc25: require('../assets/topics/big_bang_theory.webp'),
  pc26: require('../assets/topics/fast_and_furious.webp'),
  pc28: require('../assets/topics/the_office.webp'),
  s2: require('../assets/topics/cricket.webp'),
  s3: require('../assets/topics/f1.webp'),
  s5: require('../assets/topics/NBA.webp'),
  s7: require('../assets/topics/epl.webp'),
  s9: require('../assets/topics/ucl.webp'),
  s10: require('../assets/topics/UFC.webp'),
  s12: require('../assets/topics/world_cup.webp'),
  gen1: require('../assets/topics/corporations.webp'),
  gen2: require('../assets/topics/geography.webp'),
  gen3: require('../assets/topics/science.webp'),
  gen4: require('../assets/topics/UK.webp'),
  gen5: require('../assets/topics/USA.webp'),
  h14: require('../assets/topics/ww1.webp'),
  h15: require('../assets/topics/ww2.webp'),
  s11: require('../assets/topics/which_player.webp'),
  gen6: require('../assets/topics/capitals_and_cities.webp'),
  gen7: require('../assets/topics/famous_firsts.webp'),
  gen9: require('../assets/topics/general_knowledge.webp'),
  gen10: require('../assets/topics/which_decade.webp'),
  gen12: require('../assets/topics/what_year.webp'),
  gen13: require('../assets/topics/what_s_in_between.webp'),
  gen14: require('../assets/topics/initials_only.webp'),
  gen15: require('../assets/topics/invented_where.webp'),
  gen16: require('../assets/topics/nicknames.webp'),
  gen17: require('../assets/topics/famous_icons.webp'),
  gen18: require('../assets/topics/odd_one_out.webp'),
  gen19: require('../assets/topics/talabul-ilm.webp'),
  gen20: require('../assets/topics/trump_quotes.webp'),
  gen21: require('../assets/topics/what_came_next.webp'),
  gen22: require('../assets/topics/whats_the_connection.webp'),
  gen23: require('../assets/topics/Which_country.webp'),
  gen24: require('../assets/topics/famous_quotes.webp'),
  gen26: require('../assets/topics/before_they_were_famous.webp'),
  gen27: require('../assets/topics/two_truths_and_a_lie.webp'),
  gen28: require('../assets/topics/guess_the_flag.webp'),
  gen29: require('../assets/topics/guess_the_jersey.webp'),
  h16: require('../assets/topics/european_christendom.webp'),
  h17: require('../assets/topics/ertugral.webp'),
  h18: require('../assets/topics/kurulus_osman.webp'),
  pc31: require('../assets/topics/attack_on_titan.webp'),
  pc32: require('../assets/topics/peaky_blinders.webp'),
  pc33: require('../assets/topics/suits.webp'),

};

export function getCategoryPictureSource(categoryId: string): ImageSource | null {
  return LOCAL[categoryId] ?? null;
}

/** All bundled topic thumbs — for home-screen warm cache. */
export function getAllCategoryPictureSources(): ImageSource[] {
  return Object.values(LOCAL);
}

/** Topic stripe colour (matches TriviaApp Games vs default blue). */
export function getCategoryBoardAccent(categoryId: string): string {
  return /^g\d+$/.test(categoryId) ? '#10b981' : '#3b82f6';
}

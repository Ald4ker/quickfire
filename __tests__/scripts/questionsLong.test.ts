import { describe, expect, it } from '@jest/globals';
import { decodeCsvBuffer, parseCsv } from '@/scripts/lib/csv';
import { localesInPack, parseQuestionsLong } from '@/scripts/lib/questionsLong';

const HEADER =
  'userId,canonicalKey,topic,categorySlug,difficulty,pointValue,locale,prompt,answer,status,duplicateOf,promptImageKey,sourceIssue';

describe('parseCsv / decodeCsvBuffer', () => {
  it('handles quoted commas, doubled quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('decodes UTF-8 with and without a BOM', () => {
    const text = 'id,prompt\n1,Pokémon 纲手\n';
    expect(decodeCsvBuffer(Buffer.from(text, 'utf8'))).toBe(text);
    expect(decodeCsvBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]))).toBe(text);
  });
});

describe('parseQuestionsLong', () => {
  it('reads one row per question per locale and reports locales English-first', () => {
    const csv = [
      HEADER,
      '1,q1,Naruto,naruto,Easy,100,en,What does Tsunade summon?,Slug,active,,,',
      '1,q1,Naruto,naruto,Easy,100,zh-Hans,"纲手召唤什么？",蛞蝓,active,,,',
      '1,q1,Naruto,naruto,Easy,100,ar,"ماذا تستدعي تسونادي؟",بزاقة,active,,,',
      '2,q2,Naruto,naruto,Easy,100,en,Repeated question,Slug,duplicate,1,,',
    ].join('\n');
    const rows = parseQuestionsLong(csv);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ userId: '1', canonicalKey: 'q1', locale: 'en', pointValue: 100, status: 'active' });
    expect(rows[1]?.prompt).toBe('纲手召唤什么？');
    expect(rows[3]).toMatchObject({ status: 'duplicate', duplicateOf: '1' });
    expect(localesInPack(rows)).toEqual(['en', 'zh-Hans', 'ar']);
  });

  it('rejects a pack with a missing column', () => {
    expect(() => parseQuestionsLong('userId,locale\n1,en\n')).toThrow(/missing column/);
  });
});

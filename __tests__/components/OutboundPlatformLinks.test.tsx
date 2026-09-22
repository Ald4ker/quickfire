import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

describe('OutboundPlatformLinks', () => {
  const source = readFileSync(
    join(__dirname, '../../components/OutboundPlatformLinks.tsx'),
    'utf8'
  );

  it('opens website / store targets via Linking', () => {
    expect(source).toContain('getPublicSiteUrl()');
    expect(source).toContain('APP_STORE_URL');
    expect(source).toContain('PLAY_STORE_URL');
    expect(source).toContain('testID="outbound-website-link"');
  });

  it('avoids Android host-label clip (no letterSpacing / numberOfLines, trailing pad)', () => {
    expect(source).toContain('PUBLIC_SITE_HOST_LABEL');
    expect(source).toContain('\\u2007');
    expect(source).toContain('allowFontScaling={false}');
    expect(source).toContain('paddingEnd: 4');

    const nativeReturn = source.slice(source.indexOf('outbound-platform-links-native'));
    expect(nativeReturn).not.toMatch(/numberOfLines=\{1\}/);

    const nativeBlock = source.slice(source.indexOf('nativeLinkText:'));
    const styleBlock = nativeBlock.slice(0, nativeBlock.indexOf('pressed:'));
    expect(styleBlock).not.toMatch(/^\s*letterSpacing:/m);
  });
});

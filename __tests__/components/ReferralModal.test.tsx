import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

describe('ReferralModal', () => {
  const source = readFileSync(
    join(__dirname, '../../components/ReferralModal.tsx'),
    'utf8'
  );

  it('uses a full-screen flex overlay with backdrop scrim', () => {
    expect(source).toContain('testID="referral-modal"');
    expect(source).toContain('styles.backdrop');
    expect(source).toMatch(/overlay:\s*\{[^}]*flex:\s*1/s);
    expect(source).toContain('...StyleSheet.absoluteFillObject');
  });

  it('colors Share and Apply with accentGlow like store BUY', () => {
    expect(source).toContain('actionButtonBg = T.accentGlow');
    expect(source).toContain('backgroundColor: actionButtonBg');
    expect(source).not.toMatch(/copyButton:[\s\S]*backgroundColor:\s*COLORS\.primary/);
    expect(source).not.toMatch(/applyButton:[\s\S]*backgroundColor:\s*COLORS\.primary/);
  });

  it('shows success or already-applied exclusively, never both', () => {
    expect(source).toContain("success ?? t('store.referral.alreadyApplied')");
    expect(source).toContain("testID={success ? 'referral-success' : 'referral-already-applied'}");
    expect(source).not.toMatch(/alreadyRedeemed \?[\s\S]*alreadyApplied[\s\S]*\{success \?/);
  });

  it('maps not_new_account to the no-longer-new copy key', () => {
    expect(source).toContain("not_new_account: 'store.referral.errorNotNew'");
  });
});

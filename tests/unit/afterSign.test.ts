import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test } = require('../../scripts/afterSign.js');

describe('afterSign production trust', () => {
  it('requires production trust for Standard and strict Full builds', () => {
    expect(__test.productionTrustRequired({ OPL_REQUIRE_MACOS_GATEKEEPER: 'true' })).toBe(true);
    expect(__test.productionTrustRequired({ OPL_MAC_STRICT_SIGNING_CHECKS: 'TRUE' })).toBe(true);
    expect(__test.productionTrustRequired({})).toBe(false);
  });

  it('accepts a Developer ID Application signature with a TeamIdentifier', () => {
    const spawn = (_command: string, args: string[]) =>
      args[0] === '--verify'
        ? { status: 0, stdout: '', stderr: '' }
        : {
            status: 0,
            stdout: '',
            stderr: 'Authority=Developer ID Application: FENG GAO (SVVC4TA784)\nTeamIdentifier=SVVC4TA784\n',
          };
    expect(() => __test.assertDeveloperIdApplication('/tmp/One Person Lab.app', spawn)).not.toThrow();
  });

  it('rejects ad-hoc or otherwise unverifiable signatures without fallback', () => {
    const adHoc = (_command: string, args: string[]) =>
      args[0] === '--verify'
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 0, stdout: '', stderr: 'Signature=adhoc\nTeamIdentifier=not set\n' };
    expect(() => __test.assertDeveloperIdApplication('/tmp/One Person Lab.app', adHoc)).toThrow(
      /refusing ad-hoc fallback/
    );
  });
});

import { describe, expect, it } from 'vitest';

import { buildWindowsWslProvisioningView } from '../../../packages/desktop/src/process/services/windows-wsl/provisioningWindow';

describe('WindowsWslProvisioningWindow view', () => {
  it('renders bounded setup progress without executable renderer content', () => {
    const html = buildWindowsWslProvisioningView(
      {
        stage: 'installing_owned_distribution',
        detail: 'Installing <OPL-Linux> & validating ownership.',
      },
      'en-US'
    );

    expect(html).toContain('value="45"');
    expect(html).toContain('Installing &lt;OPL-Linux&gt; &amp; validating ownership.');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
  });

  it('renders the Chinese first-run surface', () => {
    const html = buildWindowsWslProvisioningView(
      {
        stage: 'validating_routes',
        detail: '正在验证 Linux 运行时。',
      },
      'zh-CN'
    );

    expect(html).toContain('Windows 首次配置');
    expect(html).toContain('value="92"');
  });
});

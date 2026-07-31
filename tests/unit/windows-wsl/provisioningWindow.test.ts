import { describe, expect, it } from 'vitest';

import {
  buildWindowsWslProvisioningView,
  localizedFailureDetail,
} from '../../../packages/desktop/src/process/services/windows-wsl/provisioningWindow';

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

  it('renders localized elapsed heartbeat detail for a long-running 65 percent stage', () => {
    const html = buildWindowsWslProvisioningView(
      {
        stage: 'initializing_guest',
        detail: 'Checking Ubuntu software sources and synchronizing the bundled Linux runtime.',
        elapsedSeconds: 75,
        heartbeat: true,
      },
      'zh-CN'
    );

    expect(html).toContain('value="65"');
    expect(html).toContain('正在检查 Ubuntu 软件源并同步内置 Linux 运行组件。');
    expect(html).toContain('已用时 1 分 15 秒');
    expect(html).toContain('任务仍在继续');
    expect(html).not.toContain('Checking Ubuntu software sources');
  });

  it('explains guest DNS failures without telling the user to reinstall', () => {
    const detail = localizedFailureDetail(
      { detail: 'guest bootstrap failed', restartRequired: false, code: 'guest_dns_unavailable' },
      'zh-CN'
    );
    expect(detail).toContain('无法解析 Ubuntu 软件源');
    expect(detail).toContain('不需要重新安装');
    expect(detail).toContain('guest_dns_unavailable');
  });
});

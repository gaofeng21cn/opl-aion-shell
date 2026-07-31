import { BrowserWindow, dialog } from 'electron';

import {
  WindowsWslProvisioningError,
  type WindowsWslProvisioningProgress,
  type WindowsWslProvisioningStage,
} from './provisioner';

type ProvisioningCopy = {
  title: string;
  eyebrow: string;
  ready: string;
  failureTitle: string;
  restartTitle: string;
  restartMessage: string;
  retry: string;
  close: string;
};

const STAGE_PERCENT: Record<WindowsWslProvisioningStage, number> = {
  checking_host: 10,
  enabling_wsl: 20,
  restart_required: 30,
  installing_owned_distribution: 45,
  initializing_guest: 65,
  activating_owner_artifacts: 80,
  validating_routes: 92,
  ready: 100,
  repair_required: 100,
  blocked_by_policy: 100,
  cancelled: 100,
};

const ENGLISH_COPY: ProvisioningCopy = {
  title: 'Preparing One Person Lab',
  eyebrow: 'Windows setup',
  ready: 'OPL Linux is ready.',
  failureTitle: 'One Person Lab setup needs attention',
  restartTitle: 'Restart Windows to continue',
  restartMessage:
    'Windows enabled the required WSL feature. Restart Windows, then open One Person Lab again to continue automatically.',
  retry: 'Retry',
  close: 'Close',
};

const CHINESE_COPY: ProvisioningCopy = {
  title: '正在准备 One Person Lab',
  eyebrow: 'Windows 首次配置',
  ready: 'OPL Linux 已就绪。',
  failureTitle: 'One Person Lab 配置需要处理',
  restartTitle: '重启 Windows 后继续',
  restartMessage: 'Windows 已启用所需的 WSL 功能。请重启 Windows，然后再次打开 One Person Lab 自动继续。',
  retry: '重试',
  close: '关闭',
};

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildWindowsWslProvisioningView(progress: WindowsWslProvisioningProgress, locale = 'en'): string {
  const copy = locale.toLowerCase().startsWith('zh') ? CHINESE_COPY : ENGLISH_COPY;
  const percent = STAGE_PERCENT[progress.stage];
  return `<!doctype html>
<html lang="${locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(copy.title)}</title>
    <style>
      :root { color-scheme: light dark; font-family: "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: Canvas; color: CanvasText; }
      main { display: grid; min-height: 260px; align-content: center; gap: 18px; padding: 34px 38px; }
      .eyebrow { margin: 0; color: GrayText; font-size: 12px; }
      h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: 0; }
      .detail { min-height: 48px; margin: 0; color: GrayText; font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
      progress { width: 100%; height: 12px; accent-color: Highlight; }
      .percent { margin: -10px 0 0; color: GrayText; font-size: 12px; text-align: right; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${htmlEscape(copy.eyebrow)}</p>
      <h1>${htmlEscape(copy.title)}</h1>
      <p class="detail">${htmlEscape(progress.detail || (progress.stage === 'ready' ? copy.ready : ''))}</p>
      <progress max="100" value="${percent}"></progress>
      <p class="percent">${percent}%</p>
    </main>
  </body>
</html>`;
}

function provisioningError(error: unknown): {
  detail: string;
  restartRequired: boolean;
  code: string | null;
} {
  if (error instanceof Error) {
    return {
      detail: error.message,
      restartRequired:
        'restartRequired' in error &&
        typeof (error as Error & { restartRequired?: unknown }).restartRequired === 'boolean' &&
        (error as Error & { restartRequired: boolean }).restartRequired,
      code: error instanceof WindowsWslProvisioningError ? error.code : null,
    };
  }
  return { detail: String(error), restartRequired: false, code: null };
}

export function localizedFailureDetail(failure: ReturnType<typeof provisioningError>, locale: string): string {
  const isChinese = locale.toLowerCase().startsWith('zh');
  if (failure.code === 'guest_dns_unavailable') {
    return isChinese
      ? 'WSL 无法解析 Ubuntu 软件源（archive.ubuntu.com/security.ubuntu.com）。请检查网络、代理或 VPN 后点击“重试”；不需要重新安装。\n错误码：guest_dns_unavailable'
      : 'WSL could not resolve the Ubuntu software sources (archive.ubuntu.com/security.ubuntu.com). Check your network, proxy, or VPN, then choose Retry; reinstalling is not required.\nError code: guest_dns_unavailable';
  }
  if (failure.code === 'guest_network_unavailable') {
    return isChinese
      ? 'WSL 无法连接 Ubuntu 软件源。若代理地址使用 localhost，请改用 WSL 可访问的代理地址；检查网络后点击“重试”。\n错误码：guest_network_unavailable'
      : 'WSL could not connect to the Ubuntu software sources. If your proxy uses localhost, use a proxy address reachable from WSL, then choose Retry.\nError code: guest_network_unavailable';
  }
  if (failure.code === 'guest_proxy_unavailable') {
    return isChinese
      ? 'WSL 检测到代理使用 localhost，但该地址在 WSL NAT 中通常指向 guest 自己。请改用 WSL 可访问的 Windows 代理地址后点击“重试”。\n错误码：guest_proxy_unavailable'
      : 'WSL detected a localhost proxy, which usually points to the guest itself under WSL NAT. Use a Windows proxy address reachable from WSL, then choose Retry.\nError code: guest_proxy_unavailable';
  }
  const networkCatalogFailure =
    failure.code === 'distribution_catalog_unavailable' &&
    /(?:WININET_E_CANNOT_CONNECT|CANNOT_CONNECT|timed?\s*out|timeout|network|proxy|dns|could not connect|unable to reach)/i.test(
      failure.detail
    );
  if (networkCatalogFailure) {
    return isChinese
      ? '无法连接 WSL 在线目录（raw.githubusercontent.com）。请检查网络、代理或 VPN 后点击“重试”。\n错误码：distribution_catalog_unavailable'
      : 'The WSL online catalog (raw.githubusercontent.com) is unreachable. Check your network, proxy, or VPN, then choose Retry.\nError code: distribution_catalog_unavailable';
  }
  return failure.detail;
}

function hostLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || 'en';
}

export class WindowsWslProvisioningWindow {
  private window: BrowserWindow | null = null;
  private showTimer: NodeJS.Timeout | null = null;
  private latestProgress: WindowsWslProvisioningProgress = {
    stage: 'checking_host',
    detail: 'Checking WSL2 and the dedicated OPL Linux environment.',
  };

  update(progress: WindowsWslProvisioningProgress): void {
    this.latestProgress = progress;
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        width: 560,
        height: 330,
        minWidth: 480,
        minHeight: 300,
        resizable: false,
        maximizable: false,
        minimizable: true,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      this.window.on('closed', () => {
        this.window = null;
      });
      this.showTimer = setTimeout(() => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.show();
          this.window.focus();
        }
      }, 250);
    }
    const html = buildWindowsWslProvisioningView(this.latestProgress, hostLocale());
    void this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    this.window.setProgressBar(STAGE_PERCENT[progress.stage] / 100);
  }

  complete(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.setProgressBar(-1);
      this.window.close();
    }
    this.window = null;
  }

  async showFailure(error: unknown): Promise<'retry' | 'close'> {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    const copy = hostLocale().toLowerCase().startsWith('zh') ? CHINESE_COPY : ENGLISH_COPY;
    const failure = provisioningError(error);
    const locale = hostLocale();
    this.update({
      stage: failure.restartRequired ? 'restart_required' : 'repair_required',
      detail: localizedFailureDetail(failure, locale),
    });
    if (this.window && !this.window.isDestroyed()) this.window.show();
    const result = await dialog.showMessageBox(this.window ?? undefined, {
      type: failure.restartRequired ? 'info' : 'error',
      title: failure.restartRequired ? copy.restartTitle : copy.failureTitle,
      message: failure.restartRequired ? copy.restartMessage : localizedFailureDetail(failure, locale),
      buttons: failure.restartRequired ? [copy.close] : [copy.retry, copy.close],
      defaultId: failure.restartRequired ? 0 : 0,
      cancelId: failure.restartRequired ? 0 : 1,
      noLink: true,
    });
    return !failure.restartRequired && result.response === 0 ? 'retry' : 'close';
  }
}

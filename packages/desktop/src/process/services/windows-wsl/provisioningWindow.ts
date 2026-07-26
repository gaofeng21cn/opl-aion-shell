import { BrowserWindow, dialog } from 'electron';

import type { WindowsWslProvisioningProgress, WindowsWslProvisioningStage } from './provisioner';

type ProvisioningCopy = {
  title: string;
  eyebrow: string;
  ready: string;
  failureTitle: string;
  restartTitle: string;
  restartMessage: string;
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
  close: 'Close',
};

const CHINESE_COPY: ProvisioningCopy = {
  title: '正在准备 One Person Lab',
  eyebrow: 'Windows 首次配置',
  ready: 'OPL Linux 已就绪。',
  failureTitle: 'One Person Lab 配置需要处理',
  restartTitle: '重启 Windows 后继续',
  restartMessage: 'Windows 已启用所需的 WSL 功能。请重启 Windows，然后再次打开 One Person Lab 自动继续。',
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
} {
  if (error instanceof Error) {
    return {
      detail: error.message,
      restartRequired:
        'restartRequired' in error &&
        typeof (error as Error & { restartRequired?: unknown }).restartRequired === 'boolean' &&
        (error as Error & { restartRequired: boolean }).restartRequired,
    };
  }
  return { detail: String(error), restartRequired: false };
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

  async showFailure(error: unknown): Promise<void> {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    const copy = hostLocale().toLowerCase().startsWith('zh') ? CHINESE_COPY : ENGLISH_COPY;
    const failure = provisioningError(error);
    this.update({
      stage: failure.restartRequired ? 'restart_required' : 'repair_required',
      detail: failure.detail,
    });
    if (this.window && !this.window.isDestroyed()) this.window.show();
    await dialog.showMessageBox(this.window ?? undefined, {
      type: failure.restartRequired ? 'info' : 'error',
      title: failure.restartRequired ? copy.restartTitle : copy.failureTitle,
      message: failure.restartRequired ? copy.restartMessage : failure.detail,
      buttons: [copy.close],
      defaultId: 0,
      noLink: true,
    });
  }
}

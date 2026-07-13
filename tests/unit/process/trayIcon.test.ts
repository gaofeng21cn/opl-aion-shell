import path from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeImageMock = vi.hoisted(() => ({
  createFromPath: vi.fn(),
}));

vi.mock('@/common/electronSafe', () => ({
  electronApp: { isPackaged: false },
  electronMenu: { buildFromTemplate: vi.fn() },
  electronNativeImage: nativeImageMock,
  electronTray: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {},
}));

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { getTrayIcon } from '@/process/utils/tray';

const createImage = (empty = false) => ({
  isEmpty: vi.fn(() => empty),
  resize: vi.fn(() => ({ resized: true })),
  setTemplateImage: vi.fn(),
});

describe('macOS tray icon', () => {
  beforeEach(() => {
    nativeImageMock.createFromPath.mockReset();
  });

  it('loads the dedicated OPL mark and enables system template rendering', () => {
    const image = createImage();
    nativeImageMock.createFromPath.mockReturnValue(image);

    expect(getTrayIcon('darwin', '/app/resources')).toBe(image);
    expect(nativeImageMock.createFromPath).toHaveBeenCalledWith('/app/resources/opl-branding/trayTemplate.png');
    expect(image.setTemplateImage).toHaveBeenCalledWith(true);
    expect(image.resize).not.toHaveBeenCalled();
  });

  it('keeps the full application icon on other desktop platforms', () => {
    const image = createImage();
    nativeImageMock.createFromPath.mockReturnValue(image);

    expect(getTrayIcon('win32', 'C:\\app\\resources')).toEqual({ resized: true });
    expect(nativeImageMock.createFromPath).toHaveBeenCalledWith(path.join('C:\\app\\resources', 'app.png'));
    expect(image.setTemplateImage).not.toHaveBeenCalled();
    expect(image.resize).toHaveBeenCalledWith({ width: 32, height: 32 });
  });

  it('fails clearly when the packaged asset is missing', () => {
    nativeImageMock.createFromPath.mockReturnValue(createImage(true));

    expect(() => getTrayIcon('darwin', '/missing')).toThrow(
      'Tray icon could not be loaded from /missing/opl-branding/trayTemplate.png'
    );
  });

  it.each([
    ['trayTemplate.png', 16],
    ['trayTemplate@2x.png', 32],
  ])('ships %s as a transparent monochrome %d px asset', async (filename, size) => {
    const assetPath = path.resolve(process.cwd(), 'resources', 'opl-branding', filename);
    const image = sharp(assetPath);
    const metadata = await image.metadata();
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visiblePixels = 0;

    expect(metadata.width).toBe(size);
    expect(metadata.height).toBe(size);
    expect(info.channels).toBe(4);

    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 3] === 0) continue;
      visiblePixels += 1;
      expect(data[offset]).toBe(0);
      expect(data[offset + 1]).toBe(0);
      expect(data[offset + 2]).toBe(0);
    }

    expect(visiblePixels).toBeGreaterThan(size * size * 0.2);
    expect(visiblePixels).toBeLessThan(size * size * 0.6);
  });
});

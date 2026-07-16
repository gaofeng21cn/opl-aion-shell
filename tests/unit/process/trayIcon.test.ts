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

function alphaBounds(data: Buffer, width: number, height: number, channels: number, threshold: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

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

describe('desktop application icon', () => {
  it('keeps the official source artwork unchanged and derives Codex-sized macOS assets', async () => {
    const sourcePath = path.resolve(process.cwd(), 'resources', 'icon.png');
    const source = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(source.info.width).toBe(1024);
    expect(source.info.height).toBe(1024);
    expect(alphaBounds(source.data, source.info.width, source.info.height, source.info.channels, 128)).toEqual({
      x: 0,
      y: 0,
      width: 1024,
      height: 1024,
    });

    for (const filename of ['app.png', 'app_dev.png']) {
      const assetPath = path.resolve(process.cwd(), 'resources', filename);
      const asset = await sharp(assetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(asset.info.width).toBe(1024);
      expect(asset.info.height).toBe(1024);
      expect(alphaBounds(asset.data, asset.info.width, asset.info.height, asset.info.channels, 128)).toEqual({
        x: 100,
        y: 100,
        width: 824,
        height: 824,
      });
    }
  });
});

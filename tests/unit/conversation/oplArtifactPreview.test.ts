import {
  openOplArtifactPreview,
  resolveOplArtifactPreviewTarget,
} from '@/renderer/pages/conversation/Preview/context/oplArtifactPreview';
import { describe, expect, it, vi } from 'vitest';

const workspace = '/workspace/project';

describe('OPL artifact preview adapter', () => {
  it.each([
    ['artifact://candidate/result.md', 'candidate/result.md', 'markdown'],
    ['evidence://review/report.pdf', 'review/report.pdf', 'pdf'],
    ['control/opl/reports/result.json', 'control/opl/reports/result.json', 'code'],
    ['/workspace/project/figures/plot.png', 'figures/plot.png', 'image'],
  ])('maps %s to a workspace-scoped Preview target', (ref, relativePath, contentType) => {
    expect(resolveOplArtifactPreviewTarget(ref, workspace)).toEqual({
      ok: true,
      target: {
        ref,
        relativePath,
        filePath: `${workspace}/${relativePath}`,
        fileName: relativePath.split('/').pop(),
        contentType,
        workspace,
      },
    });
  });

  it.each([
    ['/outside/project/report.md', workspace, '/outside/project/report.md', 'report.md', 'markdown'],
    ['/Users/example/Downloads/result.json', undefined, '/Users/example/Downloads/result.json', 'result.json', 'code'],
    ['C:\\Users\\example\\report.pdf', undefined, 'C:/Users/example/report.pdf', 'report.pdf', 'pdf'],
  ])(
    'maps explicit absolute path %s without treating workspace as an authorization boundary',
    (ref, targetWorkspace, filePath, fileName, contentType) => {
      expect(resolveOplArtifactPreviewTarget(ref, targetWorkspace)).toEqual({
        ok: true,
        target: {
          ref,
          filePath,
          fileName,
          contentType,
        },
      });
    }
  );

  it.each([
    ['', 'path_missing'],
    ['artifact://', 'path_missing'],
    ['artifact://../secret.md', 'unsafe_ref'],
    ['artifact://%2e%2e/secret.md', 'unsafe_ref'],
    ['/outside/../secret.md', 'unsafe_ref'],
    ['/%2e%2e/secret.md', 'unsafe_ref'],
    ['%2Foutside/project/report.md', 'unsafe_ref'],
    ['//server/share/report.md', 'unsafe_ref'],
    ['\\server\\share\\report.md', 'unsafe_ref'],
    ['file:///outside/project/report.md', 'unsupported_ref'],
    ['https://example.com/report.md', 'unsupported_ref'],
    ['https:example.com/report.md', 'unsupported_ref'],
    ['artifact://candidate/archive.zip', 'unsupported_ref'],
    ['artifact://candidate/report.md#body', 'unsafe_ref'],
  ])('fails closed for %s', (ref, reason) => {
    expect(resolveOplArtifactPreviewTarget(ref, workspace)).toEqual({ ok: false, reason });
  });

  it('requires an absolute workspace boundary', () => {
    expect(resolveOplArtifactPreviewTarget('artifact://candidate/result.md', 'relative/workspace')).toEqual({
      ok: false,
      reason: 'path_missing',
    });
  });

  it.each(['artifact://candidate/result.md', 'candidate/result.md'])(
    'does not guess a base path for workspace-relative ref %s',
    (ref) => {
      expect(resolveOplArtifactPreviewTarget(ref)).toEqual({ ok: false, reason: 'path_missing' });
    }
  );

  it('opens canonical text content read-only through the existing PreviewContext target', async () => {
    const openPreview = vi.fn();
    const io = {
      getFileMetadata: vi.fn().mockResolvedValue({ isDirectory: false }),
      readFile: vi.fn().mockResolvedValue('# Result\n\nEvidence.'),
      getImageBase64: vi.fn(),
    };

    await expect(
      openOplArtifactPreview({ ref: 'artifact://candidate/result.md', workspace, openPreview, io })
    ).resolves.toMatchObject({ ok: true });

    expect(io.readFile).toHaveBeenCalledWith({
      path: '/workspace/project/candidate/result.md',
      workspace,
    });
    expect(openPreview).toHaveBeenCalledWith('# Result\n\nEvidence.', 'markdown', {
      title: 'result.md',
      file_name: 'result.md',
      file_path: '/workspace/project/candidate/result.md',
      workspace,
      editable: false,
      truncated: false,
    });
  });

  it('opens an explicit absolute path outside the workspace without adding workspace scope', async () => {
    const openPreview = vi.fn();
    const io = {
      getFileMetadata: vi.fn().mockResolvedValue({ isDirectory: false }),
      readFile: vi.fn().mockResolvedValue('# External result'),
      getImageBase64: vi.fn(),
    };

    await expect(
      openOplArtifactPreview({ ref: '/outside/project/result.md', workspace, openPreview, io })
    ).resolves.toMatchObject({ ok: true });

    expect(io.getFileMetadata).toHaveBeenCalledWith({ path: '/outside/project/result.md' });
    expect(io.readFile).toHaveBeenCalledWith({ path: '/outside/project/result.md' });
    expect(openPreview).toHaveBeenCalledWith('# External result', 'markdown', {
      title: 'result.md',
      file_name: 'result.md',
      file_path: '/outside/project/result.md',
      editable: false,
      truncated: false,
    });
  });

  it('does not open a Preview tab when the canonical body is unavailable', async () => {
    const openPreview = vi.fn();
    const io = {
      getFileMetadata: vi.fn().mockRejectedValue(new Error('FILE_NOT_FOUND')),
      readFile: vi.fn(),
      getImageBase64: vi.fn(),
    };

    await expect(
      openOplArtifactPreview({ ref: 'evidence://review/missing.json', workspace, openPreview, io })
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(openPreview).not.toHaveBeenCalled();
  });
});

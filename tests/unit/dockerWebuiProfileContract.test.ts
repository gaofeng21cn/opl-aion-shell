import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');

describe('Docker WebUI image profile contract', () => {
  it('lets slim metadata-only images skip Full seed payload wrappers', () => {
    expect(dockerfile).toContain('ENV OPL_WEBUI_IMAGE_PROFILE=${OPL_WEBUI_IMAGE_PROFILE}');
    expect(dockerfile).toContain('if [ "${OPL_WEBUI_IMAGE_PROFILE}" = "webui-slim" ]; then');
    expect(dockerfile).toContain('Slim OPL WebUI image has metadata-only seed payload.');
    expect(dockerfile).toContain('exit 0');
    expect(dockerfile).toContain('\'exec /opt/opl/seed/payload/opl_framework/bin/opl "$@"\'');
    expect(dockerfile).toContain('\'exec /opt/opl/seed/payload/codex_cli/bin/codex "$@"\'');
  });

  it('keeps unselected OPL Flow out of WebUI build inputs', () => {
    expect(dockerfile).not.toContain('ARG OPL_FLOW_REF');
    expect(dockerfile).not.toContain('AS opl-flow');
    expect(dockerfile).not.toContain('COPY --from=opl-flow');
    expect(dockerfile).not.toContain('ENV OPL_FLOW_REPO_ROOT=');
    expect(dockerfile).not.toContain('/opt/opl-flow/scripts/install_local_plugin.py');
  });

  it('keeps lifecycle recovery on a volume separate from App data and projects', () => {
    expect(dockerfile).toContain('ENV AIONUI_DATA_DIR=/data');
    expect(dockerfile).toContain('ENV OPL_PROJECTS_DIR=/projects');
    expect(dockerfile).toContain('ENV OPL_WEBUI_RECOVERY_DIR=/recovery');
    expect(dockerfile).toContain('mkdir -p /data /projects /recovery');
    expect(dockerfile).toContain('VOLUME ["/data", "/projects", "/recovery"]');
    expect(dockerfile).not.toContain('/var/run/docker.sock');
    expect(dockerfile).not.toContain('docker system prune');
  });
});

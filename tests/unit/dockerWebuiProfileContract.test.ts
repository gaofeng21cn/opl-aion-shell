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

  it('packages the OPL Flow installer required by configure-codex', () => {
    expect(dockerfile).toContain('ARG OPL_FLOW_REF=5ae0625f5240a13fa820b4c92362f1d06bdce857');
    expect(dockerfile).toContain('COPY --from=opl-flow /opt/opl-flow /opt/opl-flow');
    expect(dockerfile).toContain('ENV OPL_FLOW_REPO_ROOT=/opt/opl-flow');
    expect(dockerfile).toContain('python3 tini');
    expect(dockerfile).toContain('/opt/opl-flow/scripts/install_local_plugin.py');
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

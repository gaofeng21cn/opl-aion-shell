import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export type GuiBaselineTheme = 'light' | 'dark';
export type GuiBaselineLocale = 'zh-CN' | 'en-US';

export type GuiBaselineAnchorEvidence = {
  id: string;
  selector: string;
  expected: 'visible' | 'hidden' | 'attached';
  exists: boolean;
  visible: boolean;
  matched: boolean;
};

export type GuiBaselineLayoutCheck = {
  id: string;
  passed: boolean;
  details: string;
};

export type GuiBaselineCoverageGap = {
  id: string;
  reason: string;
};

export type GuiBaselineManifestEntry = {
  id: string;
  shell_head: string;
  route: string;
  viewport: {
    name: string;
    width: number;
    height: number;
  };
  theme: GuiBaselineTheme;
  locale: GuiBaselineLocale;
  state: Record<string, string | number | boolean>;
  screenshot_path: string;
  required_anchors: string[];
  anchors: GuiBaselineAnchorEvidence[];
  layout_checks: GuiBaselineLayoutCheck[];
  coverage_gaps: GuiBaselineCoverageGap[];
  claim: 'route_state_non_empty_and_layout_only';
};

type EntryInput = Omit<GuiBaselineManifestEntry, 'required_anchors' | 'claim'>;

const git = (repoRoot: string, args: string[]): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export function requireCleanShellHead(repoRoot: string): string {
  const expectedRoot = fs.realpathSync(repoRoot);
  const actualRoot = fs.realpathSync(git(repoRoot, ['rev-parse', '--show-toplevel']));
  if (actualRoot !== expectedRoot) {
    throw new Error(`GUI baseline evidence repo mismatch: expected ${expectedRoot}, got ${actualRoot}`);
  }

  const dirty = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (dirty) {
    throw new Error(`GUI baseline evidence requires a clean Shell worktree:\n${dirty}`);
  }

  const head = git(repoRoot, ['rev-parse', 'HEAD^{commit}']);
  if (!/^[0-9a-f]{40}$/.test(head)) {
    throw new Error(`GUI baseline evidence could not resolve an exact Shell HEAD: ${head}`);
  }
  return head;
}

export class GuiBaselineManifestWriter {
  private readonly entries: GuiBaselineManifestEntry[] = [];

  constructor(
    private readonly repoRoot: string,
    private readonly manifestPath: string,
    private readonly shellHead: string,
    private readonly command: string
  ) {}

  add(input: EntryInput): void {
    if (input.shell_head !== this.shellHead) {
      throw new Error(`Evidence ${input.id} was collected from ${input.shell_head}, expected ${this.shellHead}`);
    }
    if (this.entries.some((entry) => entry.id === input.id || entry.screenshot_path === input.screenshot_path)) {
      throw new Error(`Duplicate GUI baseline evidence id or screenshot path: ${input.id}`);
    }
    if (!input.route.startsWith('/')) {
      throw new Error(`Evidence ${input.id} must record an exact route, got ${input.route}`);
    }
    if (input.viewport.width <= 0 || input.viewport.height <= 0 || Object.keys(input.state).length === 0) {
      throw new Error(`Evidence ${input.id} must record a non-empty viewport and state`);
    }
    if (input.anchors.length === 0 || input.layout_checks.length === 0) {
      throw new Error(`Evidence ${input.id} must record required anchors and layout checks`);
    }

    const failedAnchors = input.anchors.filter((anchor) => !anchor.matched);
    if (failedAnchors.length > 0) {
      throw new Error(
        `Evidence ${input.id} failed required anchors: ${failedAnchors.map((anchor) => anchor.id).join(', ')}`
      );
    }
    const failedLayoutChecks = input.layout_checks.filter((check) => !check.passed);
    if (failedLayoutChecks.length > 0) {
      throw new Error(
        `Evidence ${input.id} failed layout checks: ${failedLayoutChecks.map((check) => check.id).join(', ')}`
      );
    }

    this.entries.push({
      ...input,
      required_anchors: input.anchors.map((anchor) => anchor.id),
      claim: 'route_state_non_empty_and_layout_only',
    });
  }

  write(): void {
    if (this.entries.length === 0) {
      throw new Error('GUI baseline manifest cannot be written without evidence entries');
    }

    const finalHead = requireCleanShellHead(this.repoRoot);
    if (finalHead !== this.shellHead) {
      throw new Error(`Shell HEAD changed during evidence collection: ${this.shellHead} -> ${finalHead}`);
    }

    for (const entry of this.entries) {
      const screenshotPath = path.resolve(this.repoRoot, entry.screenshot_path);
      const relativePath = path.relative(this.repoRoot, screenshotPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Evidence ${entry.id} screenshot is outside the Shell repo: ${entry.screenshot_path}`);
      }
      if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0) {
        throw new Error(`Evidence ${entry.id} screenshot is missing or empty: ${entry.screenshot_path}`);
      }
    }

    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    fs.writeFileSync(
      this.manifestPath,
      `${JSON.stringify(
        {
          schema: 'opl_aionui_gui_route_visual_evidence.v1',
          generated_at: new Date().toISOString(),
          shell_head: this.shellHead,
          command: this.command,
          evidence_scope: 'route_state_non_empty_and_layout_only',
          visual_reference_cohort: {
            authority: 'one-person-lab-app',
            contract_ref: 'one-person-lab-app/contracts/app-gui-visual-reference-cohort.json',
            relation: 'external_authority_reference_only',
            scene_matrix_copied: false,
            parity_evaluated_by_this_manifest: false,
          },
          claims: {
            route_state_non_empty: true,
            layout_bounds_checked: true,
            parity_1_to_1: false,
            release_ready: false,
          },
          notes: [
            'Each entry is bound to the exact clean Shell HEAD, route, viewport, theme, locale, state, anchors, and layout checks.',
            'The App visual reference cohort remains external authority; this Shell manifest does not copy its scene matrix.',
            'The manifest does not establish 1:1 visual parity, packaged-app currentness, or release readiness.',
          ],
          entries: this.entries,
        },
        null,
        2
      )}\n`
    );
  }
}

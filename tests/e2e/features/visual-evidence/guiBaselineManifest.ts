import { createHash } from 'node:crypto';
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

export type GuiBaselineAccessibilityEvidence = {
  named_controls: Array<{
    id: string;
    role: string;
    accessible_name: string;
    focusable: boolean;
    visible: boolean;
    matched: boolean;
  }>;
  focus: {
    initial_active_element: string;
    focused_control: string;
    focus_visible: boolean;
    escape_dispatched: boolean;
    escape_outcome: 'closed_expected_overlay' | 'no_overlay_expected' | 'overlay_not_closed';
    focus_after_escape: string;
  };
  overflow: {
    passed: boolean;
    violations: Array<{ selector: string; reason: string }>;
  };
  rendered_contrast: {
    passed: boolean;
    minimum_ratio: number;
    checks: Array<{
      id: string;
      ratio: number | null;
      minimum_required: number;
      passed: boolean;
      foreground: string;
      background: string;
    }>;
  };
};

export type GuiBaselineVisualReferenceBinding = {
  baseline_id: string;
  contract_commit: string;
  contract_sha256: string;
  reference_state: 'capture_and_human_approval_required' | 'approved';
  approval_receipt_schema: string;
  approval_receipt_sha256: string | null;
  scene_ids: string[];
  viewport_sizes: Record<string, { width: number; height: number }>;
  scenes: AppGuiVisualReferenceScene[];
};

export type AppGuiVisualReferenceScene = {
  id: string;
  surface_family: string;
  viewport: string;
  theme: GuiBaselineTheme;
  locale: GuiBaselineLocale;
  route: string;
  state: string;
  image: string;
  masks: unknown[];
};

export type AppGuiVisualReferenceContract = {
  schema_version: number;
  schema: string;
  owner: string;
  reference: {
    owner: string;
    baseline_id: string;
    state: GuiBaselineVisualReferenceBinding['reference_state'];
    allowed_states: string[];
    approval_receipt_schema: string;
    approval_receipt_file: string | null;
    approval_receipt_sha256: string | null;
  };
  candidate: { app_contract_ref: string; shell_source_ref?: string };
  capture_contract: {
    supported_viewports: Record<string, { width: number; height: number }>;
  };
  comparison_contract: {
    human_review: { required: boolean; accepted_verdict: string; binding_fields: string[] };
  };
  scene_matrix: AppGuiVisualReferenceScene[];
};

export type LoadedAppGuiVisualReferenceContract = {
  contract: AppGuiVisualReferenceContract;
  binding: GuiBaselineVisualReferenceBinding;
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
  accessibility: GuiBaselineAccessibilityEvidence;
  claim: 'contract_driven_route_state_layout_a11y_only';
};

type EntryInput = Omit<GuiBaselineManifestEntry, 'required_anchors' | 'claim'>;

const APP_CONTRACT_PATH = 'contracts/app-gui-visual-reference-cohort.json';

function parseContract(value: unknown): AppGuiVisualReferenceContract {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('App visual contract must be an object');
  const contract = value as AppGuiVisualReferenceContract;
  if (contract.schema !== 'opl_app_gui_visual_reference_cohort.v1' || contract.schema_version !== 1) {
    throw new Error('Unsupported App visual reference cohort schema');
  }
  if (contract.owner !== 'one-person-lab-app' || contract.reference?.owner !== 'one-person-lab-app') {
    throw new Error('App visual reference cohort owner is not authoritative');
  }
  if (!contract.reference.baseline_id || !contract.reference.approval_receipt_schema) {
    throw new Error('App visual reference cohort baseline binding is incomplete');
  }
  if (!contract.reference.allowed_states.includes(contract.reference.state)) {
    throw new Error(`App visual reference cohort has an invalid state: ${contract.reference.state}`);
  }
  const sceneIds = contract.scene_matrix?.map((scene) => scene.id) ?? [];
  if (sceneIds.length !== 16 || new Set(sceneIds).size !== sceneIds.length) {
    throw new Error(`App visual reference cohort must contain exactly 16 unique scenes, got ${sceneIds.length}`);
  }
  const supportedViewports = contract.capture_contract?.supported_viewports;
  if (
    !supportedViewports ||
    Object.keys(supportedViewports).sort().join(',') !== 'desktop,narrow' ||
    supportedViewports.desktop?.width !== 1440 ||
    supportedViewports.desktop?.height !== 900 ||
    supportedViewports.narrow?.width !== 400 ||
    supportedViewports.narrow?.height !== 800
  ) {
    throw new Error('App visual reference cohort must use desktop 1440x900 and narrow 400x800 viewports');
  }
  for (const scene of contract.scene_matrix) {
    if (
      !scene.route.startsWith('/') ||
      scene.image !== `${scene.id}.png` ||
      !Array.isArray(scene.masks) ||
      !['desktop', 'narrow'].includes(scene.viewport) ||
      !['light', 'dark'].includes(scene.theme) ||
      !['zh-CN', 'en-US'].includes(scene.locale)
    ) {
      throw new Error(`App visual scene ${scene.id} is incomplete`);
    }
    const viewport = supportedViewports[scene.viewport];
    if (!viewport) {
      throw new Error(`App visual scene ${scene.id} references an unsupported viewport`);
    }
  }
  if (contract.comparison_contract?.human_review?.accepted_verdict !== 'accepted') {
    throw new Error('App visual contract must use accepted human review verdict');
  }
  return contract;
}

export function readAppGuiVisualReferenceContract(appRepoRoot: string): LoadedAppGuiVisualReferenceContract {
  const contractCommit = git(appRepoRoot, ['rev-parse', 'origin/main^{commit}']);
  if (!/^[0-9a-f]{40}$/.test(contractCommit)) throw new Error(`Invalid App origin/main commit: ${contractCommit}`);
  const bytes = execFileSync('git', ['show', `origin/main:${APP_CONTRACT_PATH}`], {
    cwd: appRepoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const contract = parseContract(JSON.parse(bytes.toString('utf8')));
  return {
    contract,
    binding: {
      baseline_id: contract.reference.baseline_id,
      contract_commit: contractCommit,
      contract_sha256: createHash('sha256').update(bytes).digest('hex'),
      reference_state: contract.reference.state,
      approval_receipt_schema: contract.reference.approval_receipt_schema,
      approval_receipt_sha256: contract.reference.approval_receipt_sha256,
      scene_ids: contract.scene_matrix.map((scene) => scene.id),
      viewport_sizes: contract.capture_contract.supported_viewports,
      scenes: contract.scene_matrix,
    },
  };
}

function routeMatchesPattern(route: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z0-9_]+/g, '[^/?#]+');
  return new RegExp(`^${escaped}$`).test(route);
}

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
    private readonly evidenceRoot: string,
    private readonly manifestPath: string,
    private readonly shellHead: string,
    private readonly command: string,
    private readonly visualReference: GuiBaselineVisualReferenceBinding
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
    const expectedScene = this.visualReference.scenes[this.entries.length];
    if (!expectedScene || expectedScene.id !== input.id) {
      throw new Error(
        `Evidence must follow the App-owned scene order: expected ${expectedScene?.id ?? 'no additional scene'}, got ${input.id}`
      );
    }
    const expectedViewport = this.visualReference.viewport_sizes[expectedScene.viewport];
    if (
      !routeMatchesPattern(input.route, expectedScene.route) ||
      input.viewport.name !== expectedScene.viewport ||
      input.viewport.width !== expectedViewport?.width ||
      input.viewport.height !== expectedViewport?.height ||
      input.theme !== expectedScene.theme ||
      input.locale !== expectedScene.locale ||
      input.state.contract_state !== expectedScene.state ||
      path.basename(input.screenshot_path) !== expectedScene.image
    ) {
      throw new Error(
        `Evidence ${input.id} does not match its App-owned route, viewport, theme, locale, state, or image binding`
      );
    }
    if (input.accessibility.named_controls.length === 0) {
      throw new Error(`Evidence ${input.id} must record named controls`);
    }
    const failedAccessibilityChecks = [
      input.accessibility.focus.focused_control === 'none' ? 'focused_control' : null,
      !input.accessibility.focus.focus_visible ? 'focus_visible' : null,
      !input.accessibility.overflow.passed ? 'overflow' : null,
      !input.accessibility.rendered_contrast.passed ? 'rendered_contrast' : null,
    ].filter((check): check is string => check !== null);
    if (failedAccessibilityChecks.length > 0) {
      const accessibilityFailure = {
        focus: input.accessibility.focus,
        overflow: input.accessibility.overflow.violations,
        contrast: input.accessibility.rendered_contrast.checks.filter((check) => !check.passed),
      };
      throw new Error(
        `Evidence ${input.id} failed accessibility checks: ${failedAccessibilityChecks.join(', ')}; ${JSON.stringify(accessibilityFailure)}`
      );
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
      claim: 'contract_driven_route_state_layout_a11y_only',
    });
  }

  write(): void {
    if (this.entries.length === 0) {
      throw new Error('GUI baseline manifest cannot be written without evidence entries');
    }

    const expectedIds = new Set(this.visualReference.scene_ids);
    const actualIds = new Set(this.entries.map((entry) => entry.id));
    if (actualIds.size !== expectedIds.size || [...expectedIds].some((id) => !actualIds.has(id))) {
      throw new Error(
        `GUI baseline manifest must cover exactly the App-owned scene matrix: expected ${expectedIds.size}, got ${actualIds.size}`
      );
    }

    const finalHead = requireCleanShellHead(this.repoRoot);
    if (finalHead !== this.shellHead) {
      throw new Error(`Shell HEAD changed during evidence collection: ${this.shellHead} -> ${finalHead}`);
    }

    for (const entry of this.entries) {
      const screenshotPath = path.resolve(this.evidenceRoot, entry.screenshot_path);
      const relativePath = path.relative(this.evidenceRoot, screenshotPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Evidence ${entry.id} screenshot is outside the task evidence root: ${entry.screenshot_path}`);
      }
      if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0) {
        throw new Error(`Evidence ${entry.id} screenshot is missing or empty: ${entry.screenshot_path}`);
      }
    }

    const relativeManifestPath = path.relative(this.evidenceRoot, path.resolve(this.manifestPath));
    if (relativeManifestPath.startsWith('..') || path.isAbsolute(relativeManifestPath)) {
      throw new Error(`GUI baseline manifest is outside the task evidence root: ${this.manifestPath}`);
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
            contract_ref: `one-person-lab-app@${this.visualReference.contract_commit}:${APP_CONTRACT_PATH}`,
            baseline_id: this.visualReference.baseline_id,
            contract_commit: this.visualReference.contract_commit,
            contract_sha256: this.visualReference.contract_sha256,
            reference_state: this.visualReference.reference_state,
            approval_receipt_schema: this.visualReference.approval_receipt_schema,
            approval_receipt_sha256: this.visualReference.approval_receipt_sha256,
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
            'Each entry is bound to the exact clean Shell HEAD, App scene id, route, viewport, theme, locale, state, anchors, layout, and accessibility checks.',
            'The App visual reference cohort remains external authority; this Shell manifest records only its baseline and byte binding, never its scene matrix.',
            'The manifest does not establish 1:1 visual parity, installed currentness, or release readiness; human approval remains a separate receipt.',
          ],
          entries: this.entries,
        },
        null,
        2
      )}\n`
    );
  }
}

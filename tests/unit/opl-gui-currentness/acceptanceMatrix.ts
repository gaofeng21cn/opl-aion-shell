export type OplGuiAcceptanceCoverage = 'automated' | 'inherited' | 'gap';

export type OplGuiAcceptanceEntry = {
  id: string;
  capability: string;
  surface: 'home' | 'rail' | 'conversation' | 'runtime' | 'carrier-parity';
  viewport: 'desktop' | 'mobile' | 'shared';
  coverage: OplGuiAcceptanceCoverage;
  evidence: string[];
  gapReason?: string;
};

const e2eEvidence = 'tests/e2e/specs/opl-gui-currentness.e2e.ts';

export const OPL_GUI_ACCEPTANCE_MATRIX: readonly OplGuiAcceptanceEntry[] = [
  {
    id: 'desktop-rail-default',
    capability: 'Desktop navigation rail starts expanded and exposes the App-owned primary hierarchy.',
    surface: 'rail',
    viewport: 'desktop',
    coverage: 'automated',
    evidence: [e2eEvidence, 'tests/unit/layout/SiderNavigation.dom.test.tsx'],
  },
  {
    id: 'mobile-rail-default',
    capability: 'Mobile navigation rail starts closed after the responsive transition.',
    surface: 'rail',
    viewport: 'mobile',
    coverage: 'automated',
    evidence: [e2eEvidence],
  },
  {
    id: 'desktop-environment-default',
    capability: 'Conversation files and Environment details stay closed until explicitly opened.',
    surface: 'conversation',
    viewport: 'desktop',
    coverage: 'automated',
    evidence: [e2eEvidence, 'tests/unit/conversation/context/ConversationEnvironmentPopover.dom.test.tsx'],
  },
  {
    id: 'mobile-environment-default',
    capability: 'Mobile conversation keeps the files overlay closed and Environment reachable.',
    surface: 'conversation',
    viewport: 'mobile',
    coverage: 'automated',
    evidence: [e2eEvidence, 'tests/unit/conversation/context/MobileWorkspaceOverlay.dom.test.tsx'],
  },
  {
    id: 'desktop-composer-decision-controls',
    capability: 'Desktop composer exposes model and permission decisions inline.',
    surface: 'conversation',
    viewport: 'desktop',
    coverage: 'automated',
    evidence: [e2eEvidence, 'tests/unit/guid/GuidActionRow.dom.test.tsx'],
  },
  {
    id: 'mobile-composer-decision-controls',
    capability: 'Mobile composer moves model, reasoning, and permission decisions into the More sheet.',
    surface: 'conversation',
    viewport: 'mobile',
    coverage: 'automated',
    evidence: [
      e2eEvidence,
      'tests/unit/guid/GuidActionRow.dom.test.tsx',
      'tests/unit/conversation/AcpSendBox.dom.test.tsx',
    ],
  },
  {
    id: 'projectless-text-only',
    capability: 'Projectless Home keeps text input usable while refusing file paste, drop, and attachment entry.',
    surface: 'home',
    viewport: 'shared',
    coverage: 'inherited',
    evidence: ['tests/unit/guid/GuidInputCard.dom.test.tsx', 'tests/unit/guid/GuidActionRow.dom.test.tsx'],
  },
  {
    id: 'package-starter-unavailable',
    capability: 'An App-owned package missing from runtime status remains visible and fails closed.',
    surface: 'home',
    viewport: 'shared',
    coverage: 'inherited',
    evidence: ['tests/unit/guid/oplHomeAssistants.test.ts', 'tests/unit/guid/HomeStarters.dom.test.tsx'],
  },
  {
    id: 'package-starter-blocked',
    capability: 'An operationally blocked package starter is disabled with its factual reason.',
    surface: 'home',
    viewport: 'shared',
    coverage: 'inherited',
    evidence: ['tests/unit/guid/HomeStarters.dom.test.tsx'],
  },
  {
    id: 'package-starter-activating',
    capability: 'A package activation in progress has a distinct non-launchable Home presentation.',
    surface: 'home',
    viewport: 'shared',
    coverage: 'gap',
    evidence: [],
    gapReason:
      'The current Home projection has no stable activating state or fixture; launchAllowed=null is not rendered as a distinct status.',
  },
  {
    id: 'approval-timeline',
    capability: 'A real App bridge approval can be reviewed and acted on from the conversation timeline.',
    surface: 'runtime',
    viewport: 'shared',
    coverage: 'gap',
    evidence: [],
    gapReason:
      'The current E2E stream fixture cannot inject an App bridge approval lifecycle without fabricating runtime evidence.',
  },
  {
    id: 'receipt-timeline',
    capability: 'Current task receipts and evidence refs render without embedding artifact bodies.',
    surface: 'runtime',
    viewport: 'shared',
    coverage: 'inherited',
    evidence: ['tests/unit/conversation/CurrentTaskAwareness.dom.test.tsx'],
  },
  {
    id: 'keyboard-focus-return',
    capability: 'Mobile files overlay traps focus, closes on Escape, and restores focus to its opener.',
    surface: 'conversation',
    viewport: 'mobile',
    coverage: 'inherited',
    evidence: ['tests/unit/conversation/context/MobileWorkspaceOverlay.dom.test.tsx'],
  },
  {
    id: 'desktop-webui-shared-semantics',
    capability: 'Desktop IPC and WebUI proxy expose the same OPL route, state, and action semantics.',
    surface: 'carrier-parity',
    viewport: 'shared',
    coverage: 'gap',
    evidence: [],
    gapReason:
      'No shared product-scenario harness currently drives both carriers against the same App-state and action fixtures.',
  },
] as const;

export const OPL_GUI_ACCEPTANCE_GAPS = OPL_GUI_ACCEPTANCE_MATRIX.filter((entry) => entry.coverage === 'gap');

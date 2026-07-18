import type { ComponentType } from 'react';
import ScientificReasoningPage from './ScientificReasoningPage';
import type { DomainDetailViewDescriptor } from './types';

type DomainDetailViewRenderer = {
  viewId: string;
  schemaVersions: ReadonlySet<string>;
  component: ComponentType;
};

const DOMAIN_DETAIL_VIEW_RENDERERS: Readonly<Record<string, DomainDetailViewRenderer>> = {
  scientific_reasoning_map: {
    viewId: 'scientific-reasoning',
    schemaVersions: new Set(['scientific-reasoning-map.v1', 'scientific-reasoning-map.v2']),
    component: ScientificReasoningPage,
  },
};

/** Resolves a renderer by the domain-authored view kind, never by agent identity. */
export function resolveDomainDetailViewRenderer(descriptor: DomainDetailViewDescriptor): ComponentType | null {
  const registered = DOMAIN_DETAIL_VIEW_RENDERERS[descriptor.viewKind];
  return registered?.viewId === descriptor.viewId && registered.schemaVersions.has(descriptor.schemaVersion)
    ? registered.component
    : null;
}

/** Resolves a registered route after a valid fast projection omits its optional descriptor. */
export function resolveDomainDetailViewRendererByViewId(viewId: string): ComponentType | null {
  return (
    Object.values(DOMAIN_DETAIL_VIEW_RENDERERS).find((registered) => registered.viewId === viewId)?.component ?? null
  );
}

export const __domainDetailViewRegistryTest = {
  registeredViewKinds: Object.freeze(Object.keys(DOMAIN_DETAIL_VIEW_RENDERERS)),
};

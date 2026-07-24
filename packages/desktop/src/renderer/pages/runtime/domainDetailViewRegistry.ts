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
  return registered?.viewId === descriptor.viewId &&
    descriptor.schemaVersion !== null &&
    registered.schemaVersions.has(descriptor.schemaVersion)
    ? registered.component
    : null;
}

export const __domainDetailViewRegistryTest = {
  registeredViewKinds: Object.freeze(Object.keys(DOMAIN_DETAIL_VIEW_RENDERERS)),
};

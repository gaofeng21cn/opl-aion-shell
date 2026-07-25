import type { ComponentType } from 'react';
import { masScientificReasoningRendererExtension } from './extensions/MasScientificReasoning';
import type { RuntimeTranslate } from './formatters';
import type { DomainDetailViewDescriptor } from './types';

export type DomainDetailViewSummaryProps = {
  descriptor: DomainDetailViewDescriptor;
  t: RuntimeTranslate;
  onOpen: () => void;
};

/**
 * Owner-delivered renderer source is composed at build time. Descriptor data
 * can only select a registered view kind; it cannot supply code or a path.
 */
export type DomainDetailViewRendererExtension = {
  viewKind: string;
  ownerPackageId: string;
  rendererId: string;
  schemaCompatibility: (descriptor: DomainDetailViewDescriptor) => boolean;
  component: ComponentType;
  summary: ComponentType<DomainDetailViewSummaryProps>;
};

const DOMAIN_DETAIL_VIEW_RENDERER_EXTENSIONS: readonly DomainDetailViewRendererExtension[] = [
  masScientificReasoningRendererExtension,
];

const DOMAIN_DETAIL_VIEW_RENDERERS = new Map(
  DOMAIN_DETAIL_VIEW_RENDERER_EXTENSIONS.map((extension) => [extension.viewKind, extension])
);

/** Resolves only trusted, build-composed extensions by domain-authored view kind. */
export function resolveDomainDetailViewRendererExtension(
  descriptor: DomainDetailViewDescriptor
): DomainDetailViewRendererExtension | null {
  const extension = DOMAIN_DETAIL_VIEW_RENDERERS.get(descriptor.viewKind);
  return extension?.schemaCompatibility(descriptor) ? extension : null;
}

export function resolveDomainDetailViewRenderer(descriptor: DomainDetailViewDescriptor): ComponentType | null {
  return resolveDomainDetailViewRendererExtension(descriptor)?.component ?? null;
}

export const __domainDetailViewRegistryTest = {
  registeredExtensions: Object.freeze(
    DOMAIN_DETAIL_VIEW_RENDERER_EXTENSIONS.map(({ viewKind, ownerPackageId, rendererId }) => ({
      viewKind,
      ownerPackageId,
      rendererId,
    }))
  ),
};

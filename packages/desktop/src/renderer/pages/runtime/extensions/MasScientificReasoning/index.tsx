import ScientificReasoningPage from './ScientificReasoningPage';
import { ScientificReasoningSummary } from './ScientificReasoningSummary';
import { isScientificReasoningViewDescriptor } from './scientificReasoning';
import React from 'react';
import type { DomainDetailViewRendererExtension } from '../../domainDetailViewRegistry';

const Summary: DomainDetailViewRendererExtension['summary'] = ({ descriptor, t, onOpen }) =>
  isScientificReasoningViewDescriptor(descriptor) ? (
    <ScientificReasoningSummary descriptor={descriptor} t={t} onOpen={onOpen} />
  ) : null;

/**
 * MAS-owned source compiled into the trusted Shell build. Its schema and
 * payload knowledge stays in this extension instead of the generic runtime.
 */
export const masScientificReasoningRendererExtension = {
  viewKind: 'scientific_reasoning_map',
  ownerPackageId: 'med-autoscience',
  rendererId: 'scientific-reasoning-map',
  schemaCompatibility: isScientificReasoningViewDescriptor,
  component: ScientificReasoningPage,
  summary: Summary,
} satisfies DomainDetailViewRendererExtension;

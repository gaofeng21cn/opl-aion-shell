import { describe, expect, it } from 'vitest';
import {
  __domainDetailViewRegistryTest,
  resolveDomainDetailViewRenderer,
} from '@/renderer/pages/runtime/domainDetailViewRegistry';
import type { DomainDetailViewDescriptor } from '@/renderer/pages/runtime/types';

function descriptor(overrides: Partial<DomainDetailViewDescriptor> = {}): DomainDetailViewDescriptor {
  return {
    itemId: 'diabetes:001',
    viewId: 'scientific-reasoning',
    viewKind: 'scientific_reasoning_map',
    title: 'Research trajectory',
    schemaRef: null,
    schemaVersion: 'scientific-reasoning-map.v1',
    availability: 'available',
    revision: 0,
    digest: null,
    ...overrides,
  };
}

describe('domain detail view renderer registry', () => {
  it('selects by view kind and schema version without an agent-id branch', () => {
    expect(__domainDetailViewRegistryTest.registeredViewKinds).toEqual(['scientific_reasoning_map']);
    expect(resolveDomainDetailViewRenderer(descriptor())).toEqual(expect.any(Function));
    expect(resolveDomainDetailViewRenderer(descriptor({ schemaVersion: 'scientific-reasoning-map.v2' }))).toEqual(
      expect.any(Function)
    );
    expect(
      resolveDomainDetailViewRenderer(
        descriptor({ viewId: 'future-view', viewKind: 'future_domain_map', schemaVersion: 'future.v1' })
      )
    ).toBeNull();
    expect(
      resolveDomainDetailViewRenderer(descriptor({ schemaVersion: null, schemaRef: 'future.schema.json' }))
    ).toBeNull();
  });
});

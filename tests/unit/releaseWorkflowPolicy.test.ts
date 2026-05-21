import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const releaseWorkflowPolicy = await import(
  pathToFileURL(`${process.cwd()}/scripts/structure/release-workflow-policy.mjs`).href
);

describe('release workflow policy audit', () => {
  it('rejects retired automatic release publishing workflows', () => {
    const violations = releaseWorkflowPolicy.findReleaseWorkflowPolicyViolations([
      {
        filePath: '.github/workflows/build-and-release.yml',
        source: `
name: Build and Release
on:
  push:
    tags:
      - '*'
jobs:
  release:
    steps:
      - uses: softprops/action-gh-release@v2
`,
      },
    ]);

    expect(violations).toEqual([
      '.github/workflows/build-and-release.yml: automatic release publishing belongs to one-person-lab-app',
      '.github/workflows/build-and-release.yml: legacy release workflow "Build and Release" must stay retired',
    ]);
  });

  it('rejects release-event asset distribution from the shell repo', () => {
    const violations = releaseWorkflowPolicy.findReleaseWorkflowPolicyViolations([
      {
        filePath: '.github/workflows/release-distribute.yml',
        source: `
name: Distribute Release Assets
on:
  release:
    types: [published]
jobs:
  distribute:
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
      - run: aws s3 cp dist/ s3://example/releases/ --recursive
`,
      },
    ]);

    expect(violations).toEqual([
      '.github/workflows/release-distribute.yml: automatic release asset distribution belongs to one-person-lab-app',
      '.github/workflows/release-distribute.yml: legacy release workflow "Distribute Release Assets" must stay retired',
    ]);
  });

  it('allows manual build diagnostics that never publish release assets', () => {
    const violations = releaseWorkflowPolicy.findReleaseWorkflowPolicyViolations([
      {
        filePath: '.github/workflows/build-manual.yml',
        source: `
name: Manual Build Diagnostic
on:
  workflow_dispatch:
jobs:
  build:
    steps:
      - run: node scripts/build-with-builder.js --pack-only
`,
      },
    ]);

    expect(violations).toEqual([]);
  });
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Preview Context 导出
 * Preview context exports
 */

export { PreviewProvider, usePreviewContext } from './PreviewContext';
export type { PreviewContextValue, DomSnippet } from './PreviewContext';

export { openOplArtifactPreview, resolveOplArtifactPreviewTarget } from './oplArtifactPreview';
export type {
  OplArtifactPreviewFailureReason,
  OplArtifactPreviewResolution,
  OplArtifactPreviewTarget,
} from './oplArtifactPreview';

export { PreviewToolbarExtrasProvider, usePreviewToolbarExtras } from './PreviewToolbarExtrasContext';
export type { PreviewToolbarExtras, PreviewToolbarExtrasContextValue } from './PreviewToolbarExtrasContext';

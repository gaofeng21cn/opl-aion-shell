/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: { openFile: { invoke: vi.fn() } },
  },
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewToolbarExtrasContext', () => ({
  usePreviewToolbarExtras: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PDFViewer from '@/renderer/pages/conversation/Preview/components/viewers/PDFViewer';

describe('PDFViewer error state', () => {
  it('explains that a PDF cannot be displayed when no source is available', async () => {
    render(<PDFViewer />);

    expect(await screen.findByText(/preview\.pdf\.pathMissing/)).toBeInTheDocument();
    expect(screen.getByText('preview.pdf.unableDisplay')).toBeInTheDocument();
  });
});

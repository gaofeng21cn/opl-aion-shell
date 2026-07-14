/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { installEarlyFatalHandlers, writeEarlyFatalRecord } from './process/startup/mainBootstrapFatal';

const removeEarlyFatalHandlers = installEarlyFatalHandlers();

void import('./index').then(
  () => {
    removeEarlyFatalHandlers();
  },
  (error) => {
    removeEarlyFatalHandlers();
    writeEarlyFatalRecord({ type: 'bootstrapImportFailure', error });
    process.exit(1);
  }
);

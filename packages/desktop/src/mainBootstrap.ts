/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { installEarlyFatalHandlers, writeEarlyFatalRecord } from './process/startup/mainBootstrapFatal';

installEarlyFatalHandlers();

void import('./index').catch((error) => {
  writeEarlyFatalRecord({ type: 'bootstrapImportFailure', error });
  process.exit(1);
});

/**
 * Build script for the standalone server.
 *
 * Uses esbuild directly instead of `bun build` so the standalone WebUI entry
 * matches the Electron main-process module resolution.
 *
 * Output format is ESM (.mjs) so that:
 * - import.meta.url is correctly set at runtime (fixes open@10 which uses it)
 * - ESM-only dependencies load without CJS/ESM interop errors
 * - eval('require') works via the createRequire banner shim
 */

import { build } from 'esbuild';
import { cpSync, existsSync } from 'fs';
import { resolve } from 'path';

// Copy built-in skills to dist-server/skills/ so standalone mode can initialize
// them into the user config directory on first startup.
const skillsSrc = resolve('src/process/resources/skills');
if (existsSync(skillsSrc)) {
  cpSync(skillsSrc, resolve('dist-server/skills'), { recursive: true });
}

const cjsBanner = [
  "import { createRequire as __shim_createRequire } from 'module';",
  "import { fileURLToPath as __shim_fileURLToPath } from 'url';",
  "import { dirname as __shim_dirname } from 'path';",
  'const require = __shim_createRequire(import.meta.url);',
  'const __filename = __shim_fileURLToPath(import.meta.url);',
  'const __dirname = __shim_dirname(__filename);',
].join('\n');

const sharedConfig = {
  platform: 'node',
  target: 'node22',
  bundle: true,
  format: 'esm',
  tsconfig: 'tsconfig.json',
  external: ['bun:sqlite', 'keytar', 'node-pty', 'ws'],
  logLevel: 'info',
};

// Build the main server entry as .mjs (requires import.meta.url for open@10 etc.)
await build({
  ...sharedConfig,
  entryPoints: ['src/server.ts'],
  outdir: 'dist-server',
  // Output as .mjs so Node.js treats it as ESM unconditionally
  outExtension: { '.js': '.mjs' },
  // Inject CJS compatibility shims so bundled code that uses __dirname,
  // __filename, or eval('require') continues to work in the ESM output.
  // Use aliased imports to avoid collisions with names used inside the bundle.
  banner: { js: cjsBanner },
});

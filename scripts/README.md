# Shell Build Entries

`package.json` owns executable commands. This reference explains the
build responsibilities without mirroring every script or historical phase.

- `bun run package` invokes electron-vite with
  `packages/desktop/electron.vite.config.ts` and creates `out/main`,
  `out/preload`, and `out/renderer`.
- `scripts/build-with-builder.js` coordinates target selection, source
  bundling, resource preparation, and electron-builder distribution.
- `packages/desktop/electron-builder.yml` declares the actual packaging
  hooks, files, native unpacking, and target configuration.
- `scripts/validate-packaged-runtime.js` checks the constructed runtime
  resources. A package must be inspected on its actual target architecture;
  an installed native module or a successful bundle is not binary acceptance.
- `scripts/webui.ts` starts the standalone host described in
  [WebUI development](../docs/guides/webui.md).

AionCore remains an official unmodified dependency. Resource preparation and
Codex selection must follow the pinned intake and App carrier contract.
Distribution, signing, notarization, public feeds, and App installation remain
App-owned operations; a Shell build command is not authorization to publish.

For dependency or native-binary failures, inspect the current builder hooks,
target architecture, packaged files, and validator result. The retired
Electron Forge/webpack and `beforeBuild.js` flow is not a repair path.

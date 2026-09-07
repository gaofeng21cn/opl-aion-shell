# Desktop Renderer Debugging With CDP

This guide covers the Electron Shell's debugging transport. It does not define
a user-facing Settings feature or a public remote-access service.

Development startup enables CDP by default. The owner is
`packages/desktop/src/process/utils/configureChromium.ts`: it resolves
`--aionui-cdp-port`, `AIONUI_CDP_PORT`, and the local `cdp.config.json`
configuration, then probes the configured port range. The default port is 9230
and the automatic range is 9230-9250. Read startup logs for the selected port.

Start a disposable development instance and inspect its page list:

```bash
bun start
curl http://127.0.0.1:9230/json
```

Use the returned target with the browser/debugging tool already configured for
the task, or add the address in Chrome's `chrome://inspect`. Keep CDP local;
it grants inspection and interaction with the target process.

The old Developer Debug Settings component is not a current routed OPL page.
Do not use its former navigation instructions as a production enablement path.
When debugging an installed App, follow the App owner's exact bundle/runtime
acceptance procedure and use the actual process-bound endpoint.

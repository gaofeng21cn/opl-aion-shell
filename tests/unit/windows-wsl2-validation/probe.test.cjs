'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  READ_ONLY_GUEST_PROBE,
  VALIDATION_DISTRO,
  collectValidationStatus,
  parseInventory,
  requireValidationGate,
} = require('../../../packages/desktop/src/validation/windows-wsl2/probe.cjs');

const validationEnv = { OPL_WINDOWS_WSL2_VALIDATION: '1' };

test('validation gate requires win32 and explicit opt-in', () => {
  assert.throws(() => requireValidationGate({ platform: 'darwin', env: validationEnv }), /only run on Windows/);
  assert.throws(() => requireValidationGate({ platform: 'win32', env: {} }), /OPL_WINDOWS_WSL2_VALIDATION=1/);
  assert.doesNotThrow(() => requireValidationGate({ platform: 'win32', env: validationEnv }));
});

test('inventory preserves the default distribution and recognizes the fixed fixture', () => {
  const inventory = parseInventory({
    quiet: `docker-desktop\n${VALIDATION_DISTRO}\n`,
    verbose: `  * docker-desktop    Running         2\n    ${VALIDATION_DISTRO}    Stopped         2\n`,
  });
  assert.equal(inventory.defaultDistro, 'docker-desktop');
  assert.equal(inventory.fixturePresent, true);
  assert.equal(inventory.fixtureState, 'Stopped');
  assert.equal(inventory.fixtureVersion, 2);
});

test('stopped fixture is reported unavailable without a guest query', async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args.includes('--verbose')) return { stdout: `${VALIDATION_DISTRO}    Stopped         2\n`, exitCode: 0 };
    return { stdout: `${VALIDATION_DISTRO}\n`, exitCode: 0 };
  };
  const status = await collectValidationStatus({ platform: 'win32', env: validationEnv, run });
  assert.equal(status.guest.state, 'unavailable');
  assert.equal(status.aioncore.state, 'unavailable');
  assert.equal(calls.length, 2);
});

test('non-WSL2 fixtures are unavailable without a guest query', async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args.includes('--verbose')) return { stdout: `${VALIDATION_DISTRO}    Running         1\n`, exitCode: 0 };
    return { stdout: `${VALIDATION_DISTRO}\n`, exitCode: 0 };
  };
  const status = await collectValidationStatus({ platform: 'win32', env: validationEnv, run });
  assert.equal(status.guest.state, 'unavailable');
  assert.equal(calls.length, 2);
});

test('failed fixed guest query is unavailable and exposes no inferred runtime state', async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args.includes('--verbose')) return { stdout: `${VALIDATION_DISTRO}    Running         2\n`, exitCode: 0 };
    if (args.includes('--quiet')) return { stdout: `${VALIDATION_DISTRO}\n`, exitCode: 0 };
    return { stdout: '', exitCode: 1, timedOut: false };
  };
  const status = await collectValidationStatus({ platform: 'win32', env: validationEnv, run });
  assert.equal(status.guest.state, 'unavailable');
  assert.equal(status.aioncore.state, 'unavailable');
  assert.equal(status.codex.state, 'unavailable');
  assert.equal(status.framework.state, 'unavailable');
  assert.equal(calls.length, 3);
});

test('running fixture uses only the fixed read-only guest probe', async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args.includes('--verbose'))
      return {
        stdout: `* docker-desktop    Running         2\n  ${VALIDATION_DISTRO}    Running         2\n`,
        exitCode: 0,
      };
    if (args.includes('--quiet')) return { stdout: `docker-desktop\n${VALIDATION_DISTRO}\n`, exitCode: 0 };
    return {
      stdout:
        'guest_arch=x86_64\naioncore_binary=present\naioncore_process=not_running\ncodex_binary=present\nframework_cli=present\n',
      exitCode: 0,
      timedOut: false,
    };
  };
  const status = await collectValidationStatus({ platform: 'win32', env: validationEnv, run });
  assert.equal(status.guest.state, 'observed');
  assert.equal(status.aioncore.state, 'unavailable');
  assert.equal(status.codex.state, 'unverified');
  assert.equal(status.framework.state, 'unverified');
  const guestCall = calls.at(-1);
  assert.deepEqual(guestCall.slice(0, 7), [
    '--distribution',
    VALIDATION_DISTRO,
    '--user',
    'root',
    '--exec',
    'sh',
    '-lc',
  ]);
  assert.equal(guestCall[7], READ_ONLY_GUEST_PROBE);
});

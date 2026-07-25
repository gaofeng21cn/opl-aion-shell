const { spawnSync } = require('child_process');

function isTrue(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function productionTrustRequired(env = process.env) {
  return isTrue(env.OPL_REQUIRE_MACOS_GATEKEEPER) || isTrue(env.OPL_MAC_STRICT_SIGNING_CHECKS);
}

function codesign(args, spawn = spawnSync) {
  const result = spawn('codesign', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `codesign exited ${result.status}`).trim());
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function assertDeveloperIdApplication(appPath, spawn = spawnSync) {
  try {
    codesign(['--verify', '--deep', '--strict', '--verbose=4', appPath], spawn);
    const details = codesign(['-dv', '--verbose=4', appPath], spawn);
    if (!/^Authority=Developer ID Application:/m.test(details) || !/^TeamIdentifier=\S+/m.test(details)) {
      throw new Error('The app is not signed with a Developer ID Application identity.');
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Notarization requires a valid Developer ID Application signature for ${appPath}; refusing ad-hoc fallback. ${details}`
    );
  }
}

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Lazy-load notarize because @electron/notarize is ESM-only
  const { notarize } = await import('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;
  const appBundleId = context.packager.appInfo.id;
  const appPath = `${appOutDir}/${appName}.app`;

  const keychainProfile = process.env.OPL_NOTARYTOOL_KEYCHAIN_PROFILE?.trim();
  const appleId = process.env.appleId?.trim();
  const appleIdPassword = process.env.appleIdPassword?.trim();
  const teamId = process.env.teamId?.trim();
  const hasAppleIdCredentials = Boolean(appleId && appleIdPassword && teamId);
  if (!keychainProfile && !hasAppleIdCredentials) {
    if (productionTrustRequired()) {
      throw new Error('Production macOS packaging requires complete Apple notarization credentials.');
    }
    console.log('Skipping notarization - development build has no Apple notarization credentials');
    return;
  }

  assertDeveloperIdApplication(appPath);
  console.log(`App ${appName} has a valid Developer ID Application signature`);

  console.log(`Starting notarization for ${appName} (${appBundleId})...`);

  try {
    const credentials = keychainProfile ? { keychainProfile } : { appleId, appleIdPassword, teamId };
    await notarize({
      tool: 'notarytool',
      appBundleId,
      appPath,
      ...credentials,
    });
    console.log('Notarization completed successfully');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};

exports.__test = {
  assertDeveloperIdApplication,
  productionTrustRequired,
};

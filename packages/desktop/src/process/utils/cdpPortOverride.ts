export interface CdpPortStartupOverride {
  source: 'argv' | 'env' | null;
  enabled: boolean | undefined;
  port: number | undefined;
}

function parseCdpPortValue(value: string | undefined, source: 'argv' | 'env'): CdpPortStartupOverride {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return { source, enabled: true, port: undefined };
  }
  if (normalized === '0' || normalized === 'false') {
    return { source, enabled: false, port: undefined };
  }

  const parsed = Number(normalized);
  return {
    source,
    enabled: true,
    port: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
  };
}

function findCdpPortArg(argv: readonly string[]): string | undefined {
  let value;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--aionui-cdp-port=')) {
      value = arg.slice('--aionui-cdp-port='.length);
      continue;
    }
    if (arg === '--aionui-cdp-port') {
      value = argv[index + 1] ?? '';
      index += 1;
    }
  }
  return value;
}

export function resolveCdpPortStartupOverride(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): CdpPortStartupOverride {
  const argvValue = findCdpPortArg(argv);
  if (argvValue !== undefined) {
    return parseCdpPortValue(argvValue, 'argv');
  }

  if (env.AIONUI_CDP_PORT !== undefined) {
    return parseCdpPortValue(env.AIONUI_CDP_PORT, 'env');
  }

  return { source: null, enabled: undefined, port: undefined };
}

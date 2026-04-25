import type { Request } from 'express';

export function isNoAuthWebUIMode(): boolean {
  const value = process.env.OPL_WEBUI_AUTH_MODE ?? process.env.AIONUI_WEBUI_AUTH_MODE;
  return value?.trim().toLowerCase() === 'none';
}

export function getNoAuthUser() {
  return {
    id: 'opl-webui-noauth',
    username: process.env.OPL_WEBUI_USERNAME?.trim() || 'admin',
  };
}

export function attachNoAuthUser(req: Request): void {
  req.user = getNoAuthUser();
}

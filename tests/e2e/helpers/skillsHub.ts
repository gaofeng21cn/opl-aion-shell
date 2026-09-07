import type { Page } from '@playwright/test';
import { httpGet, httpPost, httpDelete } from './httpBridge';
import { navigateTo } from './navigation';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/** Skills Hub setup and cleanup use the same HTTP routes as the renderer. */
export interface Skill {
  name: string;
  description?: string;
  source: 'builtin' | 'custom' | 'extension';
  location?: string;
}

/** Open the manual skills surface in the current Capabilities page. */
export async function goToSkillsHub(page: Page): Promise<void> {
  await navigateTo(page, '#/settings/capabilities?tab=manual_and_third_party');
  await page.getByTestId('manual-and-third-party-capabilities').waitFor({ state: 'visible', timeout: 15_000 });
  await httpGet(page, '/api/skills/paths');
}

export async function refreshSkillsHub(page: Page): Promise<void> {
  await navigateTo(page, '#/');
  await goToSkillsHub(page);
}

export async function getMySkills(page: Page): Promise<Skill[]> {
  const skills = await httpGet<Skill[]>(page, '/api/skills');
  return skills ?? [];
}

/** Import a real skill directory for test setup. */
export async function importSkillViaBridge(page: Page, skillPath: string): Promise<{ success: boolean; msg?: string }> {
  try {
    await httpPost(page, '/api/skills/import-symlink', { skillPath });
    return { success: true };
  } catch (err) {
    return { success: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Delete only the named test skill during cleanup. */
export async function deleteSkillViaBridge(page: Page, skillName: string): Promise<{ success: boolean; msg?: string }> {
  try {
    await httpDelete(page, '/api/skills/' + encodeURIComponent(skillName));
    return { success: true };
  } catch (err) {
    return { success: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

export async function searchMySkills(page: Page, query: string): Promise<void> {
  await page.getByTestId('input-search-my-skills').fill(query);
}

export async function refreshMySkills(page: Page): Promise<void> {
  await page.getByTestId('btn-refresh-my-skills').click();
}

export function normalizeTestId(name: string): string {
  return name.replace(/[:/\s<>"'|?*]/g, '-');
}

/** Temporary skill folders are imported directly, without external-source registration. */
export function createTempExternalSource(sourceName: string): {
  path: string;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-' + sourceName + '-'));
  return {
    path: tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

export function createTestSkill(dir: string, skillName: string, description = 'Test skill for E2E'): void {
  const skillDir = path.join(dir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const skillMd = [
    '---',
    'name: ' + skillName,
    'description: "' + description + '"',
    '---',
    '# ' + skillName,
    '',
    'This is a test skill created for E2E testing.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
}

export async function cleanupTestSkills(page: Page): Promise<void> {
  try {
    const skills = await getMySkills(page);
    for (const skill of skills) {
      if (skill.name.startsWith('E2E-Test-')) {
        const result = await deleteSkillViaBridge(page, skill.name);
        if (!result.success) console.warn('Failed to delete skill ' + skill.name + ':', result.msg);
      }
    }
  } catch (err) {
    console.warn('Cleanup failed:', err);
  }
}

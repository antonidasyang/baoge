import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';
const baogeDir = isDev ? '.baoge-dev' : '.baoge';
const SKILLS_ROOT = path.join(os.homedir(), baogeDir, 'skills');

export function getSkillsDir(): string {
  if (!fs.existsSync(SKILLS_ROOT)) {
    fs.mkdirSync(SKILLS_ROOT, { recursive: true });
  }
  return SKILLS_ROOT;
}

export function listSkills(): { name: string }[] {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .filter(e => fs.existsSync(path.join(dir, e.name, 'index.ts')))
      .map(e => ({ name: e.name }));
  } catch {
    return [];
  }
}

function isGitUrl(src: string): boolean {
  return /^(https?:\/\/|git@|git:\/\/)/.test(src.trim());
}

function inferSkillName(src: string): string {
  if (isGitUrl(src)) {
    const m = src.match(/\/([^/]+?)(?:\.git)?\/?$/);
    return m ? m[1].toLowerCase().replace(/[^a-z0-9-_]/g, '-') : `skill-${Date.now()}`;
  }
  return path.basename(path.resolve(src));
}

export async function installSkill(source: string): Promise<{ name: string }> {
  const dir = getSkillsDir();
  const resolved = source.trim();
  let skillName: string;
  let tempPath: string | null = null;

  try {
    if (isGitUrl(resolved)) {
      skillName = inferSkillName(resolved);
      const targetPath = path.join(dir, skillName);
      if (fs.existsSync(targetPath)) {
        throw new Error(`技能 ${skillName} 已存在，请先移除或选用其他来源`);
      }
      execSync(`git clone --depth 1 "${resolved}" "${targetPath}"`, {
        stdio: 'inherit',
        cwd: dir
      });
    } else {
      const srcPath = path.resolve(process.cwd(), resolved);
      if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isDirectory()) {
        throw new Error(`本地路径不存在或不是目录: ${resolved}`);
      }
      const indexPath = path.join(srcPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        throw new Error(`技能目录需包含 index.ts: ${resolved}`);
      }
      skillName = path.basename(srcPath);
      const targetPath = path.join(dir, skillName);
      if (fs.existsSync(targetPath)) {
        throw new Error(`技能 ${skillName} 已存在`);
      }
      fs.cpSync(srcPath, targetPath, { recursive: true });
    }
    return { name: skillName };
  } catch (err: any) {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true });
    }
    throw err;
  }
}

export function removeSkill(name: string): boolean {
  const dir = getSkillsDir();
  const target = path.join(dir, name);
  if (!fs.existsSync(target)) return false;
  if (!fs.statSync(target).isDirectory()) return false;
  fs.rmSync(target, { recursive: true });
  return true;
}

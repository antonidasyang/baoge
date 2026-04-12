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

/** 是否为合法技能目录（SKILL.md 或 index.ts，符合 agentskills.io 标准） */
function isValidSkillDir(dir: string, name: string): boolean {
  return (
    fs.existsSync(path.join(dir, name, 'SKILL.md')) ||
    fs.existsSync(path.join(dir, name, 'index.ts'))
  );
}

export function listSkills(): { name: string }[] {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .filter(e => isValidSkillDir(dir, e.name))
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
      const expanded = resolved.startsWith('~/') ? path.join(os.homedir(), resolved.slice(2)) : resolved;
      const srcPath = path.resolve(process.cwd(), expanded);
      if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isDirectory()) {
        throw new Error(`本地路径不存在或不是目录: ${resolved}`);
      }
      const hasSkillMd = fs.existsSync(path.join(srcPath, 'SKILL.md'));
      const hasIndexTs = fs.existsSync(path.join(srcPath, 'index.ts'));
      if (!hasSkillMd && !hasIndexTs) {
        throw new Error(`技能目录需包含 SKILL.md 或 index.ts（见 agentskills.io 标准）: ${resolved}`);
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
    throw err;
  }
}

/** 解析 SKILL.md frontmatter 中的 description 字段（用于在系统提示中向主智能体说明每个子智能体的能力） */
export function getSkillDescription(name: string): string {
  const data = getSkillData(name);
  if (!data?.skillMd) return '';
  const m = data.skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return '';
  const desc = m[1].match(/^description:\s*(.+)$/m);
  return desc ? desc[1].trim().replace(/^["']|["']$/g, '') : '';
}

/** 返回已加载的 SKILL.md 技能名列表 */
export function getSkillMdNames(): string[] {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
      .map(e => e.name);
  } catch { return []; }
}

/**
 * 加载所有 SKILL.md 技能内容，用于注入 Agent 系统提示（agentskills.io 标准）
 */
export function getSkillsContext(): string {
  const dir = getSkillsDir();
  if (!fs.existsSync(dir)) return '';
  const parts: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillPath = path.join(dir, e.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        if (content.trim()) parts.push(`\n\n---\n【技能: ${e.name}】\n${content.trim()}`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return parts.length ? parts.join('') : '';
}

export function removeSkill(name: string): boolean {
  const dir = getSkillsDir();
  const target = path.join(dir, name);
  if (!fs.existsSync(target)) return false;
  if (!fs.statSync(target).isDirectory()) return false;
  fs.rmSync(target, { recursive: true });
  return true;
}

/** 获取单个技能的数据（SKILL.md 内容和 index.ts 路径） */
export function getSkillData(name: string) {
  const dir = getSkillsDir();
  const skillPath = path.join(dir, name);
  if (!fs.existsSync(skillPath)) return null;

  const skillMdPath = path.join(skillPath, 'SKILL.md');
  const indexTsPath = path.join(skillPath, 'index.ts');

  return {
    name,
    skillMd: fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf8') : null,
    indexTsPath: fs.existsSync(indexTsPath) ? indexTsPath : null,
  };
}

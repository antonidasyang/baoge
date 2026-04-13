import fs from 'fs';
import path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { pathToFileURL, fileURLToPath } from 'url';
import { getSkillsDir } from '../lib/skills';

export interface ToolContext {
  sessionId?: string;
}

export async function loadTools(context?: ToolContext) {
  const tools: any[] = [];
  // 解析内置工具目录：相对于本文件，避免依赖 process.cwd()
  const toolsDir = path.dirname(fileURLToPath(import.meta.url));
  const skillsDir = getSkillsDir();

  // 1. 加载单文件工具 (内置)
  if (fs.existsSync(toolsDir)) {
    const toolFiles = fs.readdirSync(toolsDir).filter(f =>
      f.endsWith('.ts') && f !== 'loader.ts'
    );
    for (const file of toolFiles) {
      const module = await import(`./${file.replace('.ts', '')}`);
      registerExports(module, tools, context);
    }
  }

  // 2. 加载文件夹级技能 (外置)
  if (fs.existsSync(skillsDir)) {
    const skillFolders = fs.readdirSync(skillsDir).filter(f =>
      fs.statSync(path.join(skillsDir, f)).isDirectory()
    );

    for (const folder of skillFolders) {
      const indexPath = path.join(skillsDir, folder, 'index.ts');
      if (fs.existsSync(indexPath)) {
        try {
          const module = await import(pathToFileURL(indexPath).href);
          registerExports(module, tools, context);
        } catch (err: any) {
          console.warn(`⚠️ [豹哥提示] 技能 ${folder} 缺少依赖或加载失败，已跳过。错误: ${err.message}`);
        }
      }
    }
  }

  return tools;
}

export async function loadSkillTools(skillName: string, context?: ToolContext) {
  const tools: any[] = [];
  const skillsDir = getSkillsDir();
  const skillPath = path.join(skillsDir, skillName);
  const indexPath = path.join(skillPath, 'index.ts');

  if (fs.existsSync(indexPath)) {
    try {
      const module = await import(pathToFileURL(indexPath).href);
      registerExports(module, tools, context);
    } catch (err: any) {
      console.warn(`⚠️ [豹哥提示] 技能 ${skillName} 工具加载失败: ${err.message}`);
    }
  }
  return tools;
}

function registerExports(module: any, tools: any[], context?: ToolContext) {
  const allExports = { ...module };
  for (const key in allExports) {
    const skill = allExports[key];
    if (skill && (skill.metadata || skill.name) && skill.parameters && skill.execute) {
      const skillId = skill.metadata?.id || skill.name;
      const skillLabel = skill.metadata?.name || skill.label || skillId;
      tools.push({
        name: skillId,
        label: skillLabel,
        description: skill.metadata?.description || skill.description,
        parameters: zodToJsonSchema(skill.parameters),
        execute: async (toolCallId: string, params: any) => {
          const result = await skill.execute(params, context);
          return {
            content: [{ type: 'text', text: String(result) }],
            details: result
          };
        }
      });
    }
  }
}

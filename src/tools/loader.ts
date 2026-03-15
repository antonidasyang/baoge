import fs from 'fs';
import path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { pathToFileURL } from 'url';
import { getSkillsDir } from '../lib/skills';

export async function loadTools() {
  const tools: any[] = [];
  const rootDir = process.cwd();
  const toolsDir = path.join(rootDir, 'src', 'tools');
  const skillsDir = getSkillsDir();

  // 1. 加载单文件工具 (内置)
  if (fs.existsSync(toolsDir)) {
    const toolFiles = fs.readdirSync(toolsDir).filter(f => 
      f.endsWith('.ts') && f !== 'loader.ts'
    );
    for (const file of toolFiles) {
      // 内置工具还在 src 下，可以用相对导入
      const module = await import(`./${file.replace('.ts', '')}`);
      registerExports(module, tools);
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
          // 关键：使用 pathToFileURL 绕过 Next.js 的静态分析
          const module = await import(pathToFileURL(indexPath).href);
          registerExports(module, tools);
        } catch (err: any) {
          console.warn(`⚠️ [豹哥提示] 技能 ${folder} 缺少依赖或加载失败，已跳过。错误: ${err.message}`);
        }
      }
    }
  }

  return tools;
}

function registerExports(module: any, tools: any[]) {
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
          const result = await skill.execute(params);
          return {
            content: [{ type: 'text', text: String(result) }],
            details: result
          };
        }
      });
    }
  }
}

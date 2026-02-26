import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export type Runtime = 'node' | 'python';

export interface SandboxOptions {
  runtime: Runtime;
  code: string;
  params: any;
  skillPath: string;
}

export class SandboxManager {
  /**
   * 在 Docker 沙盒中运行代码
   */
  static async run({ runtime, skillPath, params }: SandboxOptions) {
    const containerName = `baoge-runner-${Date.now()}`;
    const absoluteSkillPath = path.resolve(process.cwd(), skillPath);
    
    // 我们将参数转换为环境变量或 JSON 文件传入
    const encodedParams = Buffer.from(JSON.stringify(params)).toString('base64');

    console.log(`
📦 [沙盒引擎] 正在拉起隔离容器 (${runtime})...`);

    try {
      // 1. 确定运行命令
      let command = "";
      if (runtime === 'node') {
        // 在 Docker 里运行：挂载技能文件夹，执行 index.ts
        // 使用 npx tsx 来保证支持 TypeScript
        command = `docker run --rm 
          --name ${containerName} 
          -v "${absoluteSkillPath}:/app" 
          -w /app 
          -e BAOGE_PARAMS="${encodedParams}" 
          node:20-slim sh -c "npx -y tsx index.ts"`;
      } else if (runtime === 'python') {
        command = `docker run --rm 
          --name ${containerName} 
          -v "${absoluteSkillPath}:/app" 
          -w /app 
          -e BAOGE_PARAMS="${encodedParams}" 
          continuumio/miniconda3 python main.py`;
      }

      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stdout) {
        console.error(`❌ [沙盒执行报错]: ${stderr}`);
        return { error: stderr };
      }

      return stdout.trim();
    } catch (error: any) {
      console.error(`❌ [沙盒崩溃]: ${error.message}`);
      return { error: error.message };
    }
  }
}

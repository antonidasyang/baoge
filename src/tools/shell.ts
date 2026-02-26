import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default {
  name: 'run_command',
  description: '执行本地终端命令',
  parameters: z.object({
    command: z.string().describe('shell 命令')
  }),
  execute: async (params: { command: string }) => {
    try {
      const { stdout, stderr } = await execAsync(params.command);
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};

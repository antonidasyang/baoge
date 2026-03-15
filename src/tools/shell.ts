import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const RECENT_SIZE = 6;
const recentCommands: string[] = [];

function norm(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function isSimilar(cmd: string): boolean {
  const n = norm(cmd);
  const count = recentCommands.filter((c) => norm(c) === n).length;
  return count >= 2;
}

export default {
  name: 'run_command',
  description: 'Execute a shell command on the local machine. Use param command for the exact command string.',
  parameters: z.object({
    command: z.string().describe('Shell command to run')
  }),
  execute: async (params: { command: string }) => {
    const cmd = params.command;
    const similar = isSimilar(cmd);
    recentCommands.push(cmd);
    if (recentCommands.length > RECENT_SIZE) recentCommands.shift();

    try {
      const { stdout, stderr } = await execAsync(cmd);
      let text = `stdout: ${stdout.trim()}\nstderr: ${stderr.trim()}`;
      if (similar) text = `⚠️ 此命令与近期执行过的命令高度相似，若仍未解决问题请换一种思路或向用户说明。\n\n${text}`;
      return text;
    } catch (error: any) {
      let text = `error: ${error.message}`;
      if (similar) text = `⚠️ 类似命令已多次执行失败，建议尝试其他方式或向用户说明。\n\n${text}`;
      return text;
    }
  }
};

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export default {
  name: 'file_operations',
  description: 'Read, write, list, or delete local files. Use operation to specify action; path for file/dir path; content required for write.',
  parameters: z.object({
    operation: z.enum(['read', 'write', 'list', 'delete']).describe('Action: read file, write file, list directory, or delete file'),
    path: z.string().describe('File or directory path (relative to cwd or absolute)'),
    content: z.string().optional().describe('Required for write: content to write')
  }),
  execute: async (params: { operation: string; path: string; content?: string }) => {
    const targetPath = path.resolve(process.cwd(), params.path);
    try {
      switch (params.operation) {
        case 'read': return fs.readFileSync(targetPath, 'utf8');
        case 'write': fs.writeFileSync(targetPath, params.content || '', 'utf8'); return '成功';
        case 'list': return fs.readdirSync(targetPath);
        case 'delete': fs.unlinkSync(targetPath); return '已删除';
        default: throw new Error('不支持');
      }
    } catch (error: any) { return `错误: ${error.message}`; }
  }
};

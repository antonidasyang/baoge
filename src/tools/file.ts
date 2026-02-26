import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export default {
  name: 'file_operations',
  description: '管理本地文件',
  parameters: z.object({
    operation: z.enum(['read', 'write', 'list', 'delete']),
    path: z.string(),
    content: z.string().optional()
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

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { resolveWorkspacePath, isInWorkspace, isInUploads } from '../lib/workspace';

export default {
  name: 'file_operations',
  description: 'Read, write, list, or delete files in the session workspace. Path is relative to workspace root. Read/list also allowed on uploaded files (absolute path).',
  parameters: z.object({
    operation: z.enum(['read', 'write', 'list', 'delete']).describe('Action: read file, write file, list directory, or delete file'),
    path: z.string().describe('File or directory path (relative to workspace, or absolute for uploaded files)'),
    content: z.string().optional().describe('Required for write: content to write')
  }),
  execute: async (params: { operation: string; path: string; content?: string }, context?: { sessionId?: string }) => {
    if (!context?.sessionId) return '错误: 缺少会话上下文，无法确定工作空间。';

    const sessionId = context.sessionId;
    let targetPath: string;

    try {
      // 绝对路径：只允许读取上传目录
      if (path.isAbsolute(params.path)) {
        targetPath = path.resolve(params.path);
        if (!isInUploads(targetPath) && !isInWorkspace(sessionId, targetPath)) {
          return `错误: 只能访问工作空间或上传目录中的文件。`;
        }
        if (!isInWorkspace(sessionId, targetPath) && (params.operation === 'write' || params.operation === 'delete')) {
          return `错误: 只能在工作空间内写入或删除文件。`;
        }
      } else {
        // 相对路径：解析到工作空间（含路径逃逸检查）
        targetPath = resolveWorkspacePath(sessionId, params.path);
      }
    } catch (err: any) {
      return `错误: ${err.message}`;
    }

    try {
      switch (params.operation) {
        case 'read': return fs.readFileSync(targetPath, 'utf8');
        case 'write': {
          const dir = path.dirname(targetPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(targetPath, params.content || '', 'utf8');
          return '成功';
        }
        case 'list': return fs.readdirSync(targetPath);
        case 'delete': fs.unlinkSync(targetPath); return '已删除';
        default: throw new Error('不支持');
      }
    } catch (error: any) { return `错误: ${error.message}`; }
  }
};

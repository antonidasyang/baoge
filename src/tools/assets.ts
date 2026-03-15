import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default {
  name: 'list_assets',
  label: 'List uploaded files',
  description: 'List mounted assets and their file paths. Use recent_minutes to filter assets uploaded in the last N minutes (e.g. when user says "the one I just uploaded").',
  parameters: z.object({
    query: z.string().optional().describe('Filter by filename keyword'),
    recent_minutes: z.number().optional().describe('Only return assets uploaded in the last N minutes')
  }),
  execute: async (params: { query?: string; recent_minutes?: number }) => {
    const isDev = process.env.NODE_ENV === 'development';
    const assetsPath = path.join(os.homedir(), isDev ? '.baoge-dev' : '.baoge', 'db', 'assets.json');

    if (!fs.existsSync(assetsPath)) return '当前系统中没有已挂载的资产。';

    try {
      const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
      let fileList = Object.values(assets) as { originalName: string; path: string; uploadedAt?: number }[];

      if (params.recent_minutes != null && params.recent_minutes > 0) {
        const cutoff = Date.now() - params.recent_minutes * 60 * 1000;
        fileList = fileList.filter((f: any) => (f.uploadedAt ?? 0) >= cutoff);
      }

      if (params.query) {
        const q = params.query.toLowerCase();
        fileList = fileList.filter((f: any) => f.originalName.toLowerCase().includes(q));
      }

      if (fileList.length === 0) return '未找到匹配的文件资产。';

      return fileList
        .map((f: any) => `[${f.originalName}] 路径: ${f.path}`)
        .join('\n');
    } catch (e) {
      return '读取资产账本失败。';
    }
  }
};

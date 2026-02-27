import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default {
  name: 'list_assets',
  label: '查询已上传文件',
  description: '查询当前系统中已挂载的所有文件/文件夹资产及其物理路径',
  parameters: z.object({
    query: z.string().optional().describe('可选：按文件名搜索关键字')
  }),
  execute: async (params: { query?: string }) => {
    const isDev = process.env.NODE_ENV === 'development';
    const assetsPath = path.join(os.homedir(), isDev ? '.baoge-dev' : '.baoge', 'db', 'assets.json');

    if (!fs.existsSync(assetsPath)) return '当前系统中没有已挂载的资产。';

    try {
      const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
      let fileList = Object.values(assets);

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

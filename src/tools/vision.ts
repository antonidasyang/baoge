import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';
import OpenAI from 'openai';
import { getProviderFor, getModelFor, getChatCompletionExtra } from '../config';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function getVisionClient() {
  const p = getProviderFor('vision');
  return new OpenAI({ apiKey: p.apiKey, baseURL: p.baseUrl, timeout: 120_000 });
}

export default {
  name: 'use_vision',
  description: 'Analyze images with a vision-language model. Use param image_path for image file path (from list_assets or file_operations), question for the analysis prompt. Default question: describe the image.',
  parameters: z.object({
    image_path: z.string().optional().describe('Image file path. Prefer param name image_path. Get paths from list_assets'),
    image: z.string().optional().describe('Alias for image_path (compatibility)'),
    question: z.string().optional().describe('Analysis prompt; defaults to "describe the image" if omitted')
  }),
  execute: async (params: { image_path?: string; image?: string; question?: string }) => {
    const p = getProviderFor('vision');
    const model = getModelFor('vision');
    if (!p.apiKey) return '未配置 API Key，无法调用视觉模型。';

    const imagePath = params.image_path ?? params.image;
    if (!imagePath) return '未提供图片路径，请传入 image_path 参数。';

    const question = params.question ?? '请描述图片内容';

    let absPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
    if (!fs.existsSync(absPath)) {
      const home = os.homedir();
      const alt = path.join(home, '.baoge', 'uploads', path.basename(imagePath));
      if (fs.existsSync(alt)) absPath = alt;
      else if (fs.existsSync(path.join(home, '.baoge-dev', 'uploads', path.basename(imagePath)))) {
        absPath = path.join(home, '.baoge-dev', 'uploads', path.basename(imagePath));
      }
    }

    if (!fs.existsSync(absPath)) return `找不到图片: ${imagePath}`;
    const ext = path.extname(absPath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return `不支持的文件格式: ${ext}，支持 png/jpg/jpeg/gif/webp`;

    try {
      const buffer = fs.readFileSync(absPath);
      const base64 = buffer.toString('base64');
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${base64}`;

      const client = getVisionClient();
      const extra = getChatCompletionExtra('vision');
      const resp = await client.chat.completions.create({
        model,
        ...extra,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ]
      });
      const text = resp.choices[0]?.message?.content;
      return text || '视觉模型未返回有效内容。';
    } catch (err: any) {
      if (err.message?.includes('504') || err.message?.includes('Gateway')) {
        return `视觉模型网关超时(504)。图片可能太大或模型处理时间过长，建议：1) 压缩图片后重试；2) 调大服务端 nginx 的 proxy_read_timeout。`;
      }
      return `视觉模型调用失败: ${err.message}`;
    }
  }
};

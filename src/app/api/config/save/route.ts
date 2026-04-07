import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { CONFIG_FILE_PATH, reloadConfig } from '@/config';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { baseUrl, apiKey, chatModel, embeddingModel, visionModel, codingModel, providerType } = body ?? {};

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'apiKey 必填' }, { status: 400 });
    }
    if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
      return NextResponse.json({ error: 'baseUrl 必填' }, { status: 400 });
    }
    if (!chatModel || typeof chatModel !== 'string' || !chatModel.trim()) {
      return NextResponse.json({ error: 'chatModel 必填' }, { status: 400 });
    }

    const providerName = 'default';
    const config = {
      providers: {
        [providerName]: {
          type: providerType || 'openai',
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          models: Array.from(new Set([chatModel, embeddingModel, visionModel, codingModel].filter(Boolean)))
            .map((name: string) => ({ name })),
        },
      },
      models: {
        chat: `${providerName}/${chatModel}`,
        embedding: `${providerName}/${embeddingModel || chatModel}`,
        vision: `${providerName}/${visionModel || chatModel}`,
        coding: `${providerName}/${codingModel || chatModel}`,
      },
    };

    fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
    reloadConfig();

    return NextResponse.json({ ok: true, configPath: CONFIG_FILE_PATH });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? '保存失败' }, { status: 500 });
  }
}

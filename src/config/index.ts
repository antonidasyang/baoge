import fs from 'fs';
import path from 'path';
import os from 'os';

export interface BaogeConfig {
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  llmEmbeddingModel: string;
  llmEmbeddingBaseUrl: string;
}

const isDev = process.env.NODE_ENV === 'development';
const configDirName = isDev ? '.baoge-dev' : '.baoge';
const CONFIG_PATH = path.join(os.homedir(), configDirName, 'config.json');

function loadConfig(): BaogeConfig {
  console.log(`\n🔍 [Config] Loading from: ${CONFIG_PATH}`);
  
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ [Config] File not found: ${CONFIG_PATH}`);
    return {} as any;
  }

  try {
    let rawData = fs.readFileSync(CONFIG_PATH, 'utf8');
    
    // 核心修复：强力剔除 BOM (Byte Order Mark) 及文件开头的任何空白
    rawData = rawData.trim().replace(/^\uFEFF/, '');
    
    const parsed = JSON.parse(rawData);
    
    const normalized: any = {
      llmApiKey: parsed.llmApiKey || parsed.LLM_API_KEY,
      llmModel: parsed.llmModel || parsed.LLM_MODEL,
      llmBaseUrl: parsed.llmBaseUrl || parsed.LLM_BASE_URL,
      llmEmbeddingModel: parsed.llmEmbeddingModel || parsed.LLM_EMBEDDING_MODEL,
      llmEmbeddingBaseUrl: parsed.llmEmbeddingBaseUrl || parsed.LLM_EMBEDDING_BASE_URL
    };

    if (!normalized.llmApiKey) {
      console.warn('⚠️  [Config] Warning: llmApiKey is missing!');
    } else {
      console.log('✅ [Config] Configuration parsed successfully.');
    }

    return normalized as BaogeConfig;
  } catch (err: any) {
    console.error(`❌ [Config] JSON Parse Failed: ${err.message}`);
    return {} as any;
  }
}

export const config = loadConfig();
export const ENV = isDev ? 'DEV' : 'PROD';

import fs from 'fs';
import path from 'path';
import os from 'os';

/** 单个 model 的配置，可选采样/惩罚等参数；请求时若配了则传入，未配则不传 */
export interface ModelDef {
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

/** Provider 连接配置，可含多个 models */
export interface ProviderDef {
  type?: string;
  apiKey: string;
  baseUrl: string;
  models?: ModelDef[];
}

/** 运行时需要的 apiKey + baseUrl */
export interface ProviderCreds {
  apiKey: string;
  baseUrl: string;
}

export interface BaogeConfig {
  /** 多个 provider，key 为 provider 名称；也支持 array 格式 [{name, ...}] */
  providers: Record<string, ProviderDef>;
  /** 各任务使用的 model，格式：provider_name/model_name 或 modelName（用 default） */
  models: {
    chat: string;
    embedding: string;
    vision: string;
    coding: string;
  };
}

const DEFAULT_MODELS = {
  chat: 'gpt-4o-mini',
  embedding: 'text-embedding-3-small',
  vision: 'gpt-4o',
  coding: 'gpt-4o',
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_PROVIDER = 'default';

type Task = 'chat' | 'embedding' | 'vision' | 'coding';

const isDev = process.env.NODE_ENV === 'development';
const configDirName = isDev ? '.baoge-dev' : '.baoge';
const CONFIG_PATH = path.join(os.homedir(), configDirName, 'config.json');

/** 解析 models.xxx，返回 [providerId, modelName] */
function parseModelSpec(spec: string): [string, string] {
  if (!spec || typeof spec !== 'string') return [DEFAULT_PROVIDER, ''];
  const idx = spec.indexOf('/');
  if (idx > 0) {
    return [spec.slice(0, idx), spec.slice(idx + 1)];
  }
  return [DEFAULT_PROVIDER, spec];
}

/** 将 provider 转为 ProviderCreds */
function toCreds(p: ProviderDef | ProviderCreds): ProviderCreds {
  return { apiKey: p.apiKey, baseUrl: p.baseUrl };
}

/** 标准化 providers：支持 object 或 array 格式 */
function normalizeProviders(raw: any): Record<string, ProviderDef> {
  if (!raw || typeof raw !== 'object') return {};
  if (Array.isArray(raw)) {
    const out: Record<string, ProviderDef> = {};
    for (const item of raw) {
      const name = item?.name;
      if (name) {
        const { name: _, ...rest } = item;
        out[name] = rest;
      }
    }
    return out;
  }
  const out: Record<string, ProviderDef> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      out[k] = {
        apiKey: (o.apiKey as string) ?? '',
        baseUrl: (o.baseUrl as string) ?? DEFAULT_BASE_URL,
        ...(o.type != null ? { type: o.type as string } : {}),
        ...(Array.isArray(o.models) ? { models: o.models as ModelDef[] } : {}),
      };
    }
  }
  return out;
}

function normalizeFromLegacy(parsed: any): BaogeConfig {
  const p = parsed;
  const defaultCreds: ProviderDef = {
    apiKey: p.llmApiKey || p.LLM_API_KEY || '',
    baseUrl: p.llmBaseUrl || p.LLM_BASE_URL || DEFAULT_BASE_URL,
  };
  const providers: Record<string, ProviderDef> = { [DEFAULT_PROVIDER]: defaultCreds };

  const hasEmbeddingOverride = p.llmEmbeddingApiKey || p.LLM_EMBEDDING_API_KEY || p.llmEmbeddingBaseUrl || p.LLM_EMBEDDING_BASE_URL;
  if (hasEmbeddingOverride) {
    providers.embedding = {
      apiKey: p.llmEmbeddingApiKey || p.LLM_EMBEDDING_API_KEY || defaultCreds.apiKey,
      baseUrl: p.llmEmbeddingBaseUrl || p.LLM_EMBEDDING_BASE_URL || defaultCreds.baseUrl,
    };
  }
  const hasVisionOverride = p.llmVlBaseUrl || p.LLM_VL_BASE_URL;
  if (hasVisionOverride) {
    providers.vision = {
      apiKey: defaultCreds.apiKey,
      baseUrl: p.llmVlBaseUrl || p.LLM_VL_BASE_URL || defaultCreds.baseUrl,
    };
  }
  const hasCodingOverride = p.llmCodingBaseUrl || p.LLM_CODING_BASE_URL;
  if (hasCodingOverride) {
    providers.coding = {
      apiKey: defaultCreds.apiKey,
      baseUrl: p.llmCodingBaseUrl || p.LLM_CODING_BASE_URL || defaultCreds.baseUrl,
    };
  }

  const models = {
    chat: p.llmModel || p.LLM_MODEL || DEFAULT_MODELS.chat,
    embedding: hasEmbeddingOverride ? `embedding/${p.llmEmbeddingModel || p.LLM_EMBEDDING_MODEL || DEFAULT_MODELS.embedding}` : (p.llmEmbeddingModel || p.LLM_EMBEDDING_MODEL || DEFAULT_MODELS.embedding),
    vision: hasVisionOverride ? `vision/${p.llmVlModel || p.LLM_VL_MODEL || p.llmModel || p.LLM_MODEL || DEFAULT_MODELS.vision}` : (p.llmVlModel || p.LLM_VL_MODEL || p.llmModel || p.LLM_MODEL || DEFAULT_MODELS.vision),
    coding: hasCodingOverride ? `coding/${p.llmCodingModel || p.LLM_CODING_MODEL || p.llmModel || p.LLM_MODEL || DEFAULT_MODELS.coding}` : (p.llmCodingModel || p.LLM_CODING_MODEL || p.llmModel || p.LLM_MODEL || DEFAULT_MODELS.coding),
  };
  return { providers, models };
}

function loadConfig(): BaogeConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {
      providers: { [DEFAULT_PROVIDER]: { apiKey: '', baseUrl: DEFAULT_BASE_URL } },
      models: { ...DEFAULT_MODELS },
    };
  }

  try {
    let rawData = fs.readFileSync(CONFIG_PATH, 'utf8');
    rawData = rawData.trim().replace(/^\uFEFF/, '');
    const parsed = JSON.parse(rawData);

    if (parsed.providers && typeof parsed.providers === 'object') {
      const providers = normalizeProviders(parsed.providers);
      const taskModels = parsed.models ?? parsed.provider?.models ?? {};
      return {
        providers,
        models: {
          chat: taskModels.chat || DEFAULT_MODELS.chat,
          embedding: taskModels.embedding || DEFAULT_MODELS.embedding,
          vision: taskModels.vision || DEFAULT_MODELS.vision,
          coding: taskModels.coding || DEFAULT_MODELS.coding,
        },
      };
    }

    if (parsed.provider) {
      const m = parsed.provider.models ?? parsed.models ?? {};
      return {
        providers: {
          [DEFAULT_PROVIDER]: {
            apiKey: parsed.provider.apiKey || '',
            baseUrl: parsed.provider.baseUrl || DEFAULT_BASE_URL,
          },
        },
        models: {
          chat: m.chat || DEFAULT_MODELS.chat,
          embedding: m.embedding || DEFAULT_MODELS.embedding,
          vision: m.vision || DEFAULT_MODELS.vision,
          coding: m.coding || DEFAULT_MODELS.coding,
        },
      };
    }

    return normalizeFromLegacy(parsed);
  } catch {
    return {
      providers: { [DEFAULT_PROVIDER]: { apiKey: '', baseUrl: DEFAULT_BASE_URL } },
      models: { ...DEFAULT_MODELS },
    };
  }
}

let _config = loadConfig();

export const config = _config;

/** 重新从磁盘加载配置（写入新 config.json 后调用） */
export function reloadConfig(): BaogeConfig {
  _config = loadConfig();
  return _config;
}

export function getProviderFor(task: Task): ProviderCreds {
  const spec = _config.models[task] || DEFAULT_MODELS[task];
  const [providerId, modelName] = parseModelSpec(spec);
  const def = _config.providers[providerId];
  if (def) return toCreds(def);
  const fallback = _config.providers[DEFAULT_PROVIDER] ?? Object.values(_config.providers)[0];
  return fallback ? toCreds(fallback) : { apiKey: '', baseUrl: DEFAULT_BASE_URL };
}

export function getModelFor(task: Task): string {
  const spec = _config.models[task] || DEFAULT_MODELS[task];
  const [, modelName] = parseModelSpec(spec);
  return modelName || DEFAULT_MODELS[task];
}

export interface ChatParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

/** 获取 model 的额外参数（来自 provider.models 定义），未配的字段不包含 */
export function getModelParams(task: Task): ChatParams | undefined {
  const spec = _config.models[task] || DEFAULT_MODELS[task];
  const [providerId, modelName] = parseModelSpec(spec);
  const def = _config.providers[providerId];
  const modelDef = def?.models?.find((m: ModelDef) => m.name === modelName);
  if (!modelDef) return undefined;
  const out: ChatParams = {};
  if (modelDef.temperature != null) out.temperature = modelDef.temperature;
  if (modelDef.maxTokens != null) out.maxTokens = modelDef.maxTokens;
  if (modelDef.topP != null) out.topP = modelDef.topP;
  if (modelDef.topK != null) out.topK = modelDef.topK;
  if (modelDef.presencePenalty != null) out.presencePenalty = modelDef.presencePenalty;
  if (modelDef.frequencyPenalty != null) out.frequencyPenalty = modelDef.frequencyPenalty;
  return Object.keys(out).length ? out : undefined;
}

/** 将 getModelParams 转为 OpenAI/create 可直接 spread 的参数对象 */
export function getChatCompletionExtra(task: Task): Record<string, number> {
  const p = getModelParams(task);
  if (!p) return {};
  const out: Record<string, number> = {};
  if (p.temperature != null) out.temperature = p.temperature;
  if (p.maxTokens != null) out.max_tokens = p.maxTokens;
  if (p.topP != null) out.top_p = p.topP;
  if (p.topK != null) out.top_k = p.topK;
  if (p.presencePenalty != null) out.presence_penalty = p.presencePenalty;
  if (p.frequencyPenalty != null) out.frequency_penalty = p.frequencyPenalty;
  return out;
}

export const ENV = isDev ? 'DEV' : 'PROD';

/** 配置文件绝对路径（依据 NODE_ENV 区分 dev/prod 目录） */
export const CONFIG_FILE_PATH = CONFIG_PATH;

/** 是否已配置至少一个可用的 provider（含非空 apiKey） */
export function isConfigured(): boolean {
  return Object.values(_config.providers).some(p => p && p.apiKey && p.apiKey.trim().length > 0);
}

import * as lancedb from '@lancedb/lancedb';
import fs from 'fs';
import path from 'path';
import os from 'os';
import OpenAI from 'openai';
import { config } from '../config';
import crypto from 'crypto';

const isDev = process.env.NODE_ENV === 'development';
const baogeDir = isDev ? '.baoge-dev' : '.baoge';
const STORAGE_ROOT = path.join(os.homedir(), baogeDir, 'db');
const UPLOAD_ROOT = path.join(os.homedir(), baogeDir, 'uploads');
const ASSETS_FILE = path.join(STORAGE_ROOT, 'assets.json');

// 初始化
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// 延迟初始化客户端
let embedClientInstance: OpenAI | null = null;
function getEmbedClient() {
  if (!embedClientInstance) {
    embedClientInstance = new OpenAI({
      apiKey: config.llmApiKey,
      baseURL: config.llmEmbeddingBaseUrl || config.llmBaseUrl
    });
  }
  return embedClientInstance;
}

/**
 * 资产登记与防重名保护
 */
export async function registerAsset(file: Buffer, originalName: string, relativePath: string) {
  const hash = crypto.createHash('sha256').update(file).digest('hex');
  let assets: any = {};
  if (fs.existsSync(ASSETS_FILE)) { try { assets = JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8')); } catch {} }
  if (assets[hash]) return assets[hash];

  let finalPath = path.join(UPLOAD_ROOT, relativePath);
  let counter = 1;
  const ext = path.extname(finalPath);
  const base = path.join(path.dirname(finalPath), path.basename(finalPath, ext));
  while (fs.existsSync(finalPath)) { finalPath = `${base}_${counter}${ext}`; counter++; }

  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.promises.writeFile(finalPath, file);

  const assetInfo = { id: hash, name: path.basename(finalPath), originalName, path: finalPath, size: file.length, uploadedAt: Date.now() };
  assets[hash] = assetInfo;
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
  return assetInfo;
}

export async function embed(text: string) {
  const model = config.llmEmbeddingModel || 'text-embedding-v3';
  try {
    const client = getEmbedClient();
    const response = await client.embeddings.create({ model, input: text, encoding_format: "float" });
    return response.data[0].embedding;
  } catch (err: any) {
    console.warn(`⚠️ [Embedding] API Error: ${err.message}`);
    return null;
  }
}

export async function getSessions() {
  const HISTORY_FILE = path.join(STORAGE_ROOT, 'history.json');
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return Object.values(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))).sort((a: any, b: any) => b.updatedAt - a.updatedAt); } catch { return []; }
}

export async function upsertSession(id: string, title: string) {
  const HISTORY_FILE = path.join(STORAGE_ROOT, 'history.json');
  let sessions: any = {};
  if (fs.existsSync(HISTORY_FILE)) { try { sessions = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {} }
  sessions[id] = { id, title: title || sessions[id]?.title || "新任务", updatedAt: Date.now() };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(sessions, null, 2));
}

export async function saveMessage(sessionId: string, role: string, content: string) {
  const CONTENTS_DIR = path.join(STORAGE_ROOT, 'contents');
  if (!fs.existsSync(CONTENTS_DIR)) fs.mkdirSync(CONTENTS_DIR, { recursive: true });
  const filePath = path.join(CONTENTS_DIR, `${sessionId}.json`);
  let history: any[] = [];
  if (fs.existsSync(filePath)) { try { history = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {} }
  history.push({ role, content, timestamp: Date.now() });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

export async function getChatHistory(sessionId: string) {
  const filePath = path.join(STORAGE_ROOT, 'contents', `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
}

let lancedbInstance: any = null;
export async function getVectorDB() {
  if (lancedbInstance) return lancedbInstance;
  lancedbInstance = await lancedb.connect(STORAGE_ROOT);
  return lancedbInstance;
}

export async function saveToMemory(text: string, metadata: any = {}) {
  try {
    const vector = await embed(text);
    if (!vector) return;
    const db = await getVectorDB();
    const data = [{ vector, text, timestamp: Date.now(), ...metadata }];
    const tableNames = await db.tableNames();
    if (!tableNames.includes('memories_v2')) await db.createTable('memories_v2', data);
    else await (await db.openTable('memories_v2')).add(data);
  } catch {}
}

/**
 * 核心修复：找回丢失的 searchMemory 导出
 */
export async function searchMemory(query: string, limit: number = 3) {
  try {
    const vector = await embed(query);
    if (!vector) return [];
    const db = await getVectorDB();
    const tableNames = await db.tableNames();
    if (!tableNames.includes('memories_v2')) return [];
    const table = await db.openTable('memories_v2');
    const results = await table.search(vector).limit(limit).execute();
    return (results as any).toArray ? (results as any).toArray() : Array.from(results);
  } catch { return []; }
}

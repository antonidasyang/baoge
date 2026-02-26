import * as lancedb from '@lancedb/lancedb';
import fs from 'fs';
import path from 'path';
import os from 'os';
import OpenAI from 'openai';
import { config } from '../config';

const isDev = process.env.NODE_ENV === 'development';
const baogeDir = isDev ? '.baoge-dev' : '.baoge';
const STORAGE_ROOT = path.join(os.homedir(), baogeDir, 'db');

const HISTORY_FILE = path.join(STORAGE_ROOT, 'history.json');
const CONTENTS_DIR = path.join(STORAGE_ROOT, 'contents');

if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
if (!fs.existsSync(CONTENTS_DIR)) fs.mkdirSync(CONTENTS_DIR, { recursive: true });

// 核心改进：改为延迟初始化函数
let embedClientInstance: OpenAI | null = null;
function getEmbedClient() {
  if (!embedClientInstance) {
    if (!config.llmApiKey) {
      throw new Error("Critical Error: config.llmApiKey is missing during OpenAI client initialization.");
    }
    embedClientInstance = new OpenAI({
      apiKey: config.llmApiKey,
      baseURL: config.llmEmbeddingBaseUrl || config.llmBaseUrl
    });
  }
  return embedClientInstance;
}

export async function embed(text: string) {
  const model = config.llmEmbeddingModel || 'text-embedding-v3';
  try {
    const client = getEmbedClient();
    const response = await client.embeddings.create({
      model: model, input: text, encoding_format: "float",
    });
    return response.data[0].embedding;
  } catch (err: any) {
    console.warn(`⚠️ [Embedding] Error: ${err.message}`);
    return null;
  }
}

export async function getSessions() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return Object.values(JSON.parse(data)).sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export async function upsertSession(id: string, title: string) {
  let sessions: any = {};
  if (fs.existsSync(HISTORY_FILE)) {
    try { sessions = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {}
  }
  sessions[id] = { id, title: title || sessions[id]?.title || "新对话", updatedAt: Date.now() };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(sessions, null, 2));
}

export async function saveMessage(sessionId: string, role: string, content: string) {
  if (!fs.existsSync(CONTENTS_DIR)) fs.mkdirSync(CONTENTS_DIR, { recursive: true });
  const filePath = path.join(CONTENTS_DIR, `${sessionId}.json`);
  let history: any[] = [];
  if (fs.existsSync(filePath)) {
    try { history = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
  }
  history.push({ role, content, timestamp: Date.now() });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

export async function getChatHistory(sessionId: string) {
  const filePath = path.join(CONTENTS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return []; }
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
    if (!tableNames.includes('memories_v2')) {
      await db.createTable('memories_v2', data);
    } else {
      const table = await db.openTable('memories_v2');
      await table.add(data);
    }
  } catch {}
}

export async function searchMemory(query: string, limit: number = 3) {
  try {
    const vector = await embed(query);
    if (!vector) return [];
    const db = await getVectorDB();
    const tableNames = await db.tableNames();
    if (!tableNames.includes('memories_v2')) return [];
    const table = await db.openTable('memories_v2');
    const results = await table.search(vector).limit(limit).execute();
    return results.map((r: any) => ({ text: r.text, score: r._distance }));
  } catch { return []; }
}

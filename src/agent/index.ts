import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import { loadTools } from '../tools/loader';
import { getChatHistory, saveMessage, upsertSession, saveToMemory } from '../memory';
import { getProviderFor, getModelFor, getChatCompletionExtra, getModelParams } from '../config';
import { getSkillsContext, getSkillMdNames } from '../lib/skills';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DEBUG = process.env.BAOGE_DEBUG === '1' || process.env.BAOGE_DEBUG === 'true';
const isDev = process.env.NODE_ENV === 'development';
const LOG_DIR = path.join(os.homedir(), isDev ? '.baoge-dev' : '.baoge', 'logs');

let logStream: fs.WriteStream | null = null;

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(LOG_DIR, `${date}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  }
  return logStream;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function writeLog(tag: string, message: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}][${tag}] ${stripAnsi(message)}\n`;
  try { getLogStream().write(line); } catch {}
}

function debugLog(tag: string, ...args: any[]) {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  writeLog(tag, message);
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`\x1b[36m[${ts}][${tag}]\x1b[0m`, ...args);
}

const origFetch = globalThis.fetch;
globalThis.fetch = async function patchedFetch(input: any, init?: any) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const method = init?.method ?? 'GET';
  debugLog('HTTP', `\x1b[33m→ ${method} ${url}\x1b[0m`);
  const start = Date.now();
  try {
    const resp = await origFetch(input, init);
    const elapsed = Date.now() - start;
    debugLog('HTTP', `\x1b[${resp.ok ? '32' : '31'}m← ${resp.status} ${resp.statusText} (${elapsed}ms) ${url}\x1b[0m`);
    if (!resp.ok) {
      const clone = resp.clone();
      try {
        const body = await clone.text();
        debugLog('HTTP', `\x1b[31m错误响应体: ${body.slice(0, 1000)}\x1b[0m`);
      } catch {}
    }
    return resp;
  } catch (err: any) {
    const elapsed = Date.now() - start;
    debugLog('HTTP', `\x1b[31m✗ 请求失败 (${elapsed}ms): ${err.message}\x1b[0m  URL: ${url}`);
    throw err;
  }
};

export async function runBaoge(
  prompt: string,
  sessionId: string,
  onEvent: (event: any) => void,
  signal?: AbortSignal
) {
  try {
    const model = getModel('openai', 'gpt-4o-mini' as any);
    if (!model) throw new Error('Model Load Error');

    const provider = getProviderFor('chat');
    const extra = getChatCompletionExtra('chat');
    const chatParams = getModelParams('chat');
    Object.assign(model, {
      api: 'openai-completions',
      id: getModelFor('chat'),
      baseUrl: provider.baseUrl,
      ...(chatParams?.maxTokens != null ? { maxTokens: chatParams.maxTokens } : {}),
      ...(chatParams?.contextWindow != null ? { contextWindow: chatParams.contextWindow } : {}),
      ...extra,
    });

    debugLog('INIT', `模型: ${(model as any).id}  API: ${(model as any).api}  BaseURL: ${(model as any).baseUrl}`);

    const agent = new Agent({
      getApiKey: () => provider.apiKey,
    
    });

    agent.setModel(model);
    const basePrompt = `你是一个助手，叫"豹哥"。

【避免复读】
- 不要重复执行相同或高度相似的命令。若某命令已执行过且结果不理想，应换一种思路或向用户说明情况。
- 若连续多次尝试未能解决问题，请停下来总结现状并询问用户下一步需求，而非继续重复尝试。
- 执行失败时，先分析原因，再决定是换方式重试还是告知用户。`;
    const skillsCtx = getSkillsContext();
    agent.setSystemPrompt(basePrompt + (skillsCtx ? skillsCtx : ''));

    const tools = await loadTools();
    agent.setTools(tools);

    onEvent({ type: 'skills_loaded', skillMd: getSkillMdNames(), tools: tools.map((t: { name: string }) => t.name) });

    const history = await getChatHistory(sessionId);
    if (history.length > 0) {
      const formattedHistory = history.map(h => ({
        role: h.role,
        content: [{ type: 'text', text: h.content }]
      }));
      agent.replaceMessages(formattedHistory as any);
    }

    agent.subscribe((event: any) => {
      if (DEBUG) {
        switch (event.type) {
          case 'message_end': {
            const role = event.message?.role;
            const content = event.message?.content;
            if (role === 'assistant') {
              if (Array.isArray(content)) {
                const text = content.find((c: any) => c.type === 'text')?.text;
                const toolCalls = content.filter((c: any) => c.type === 'tool_call');
                if (text) {
                  debugLog('LLM-RESP', `\x1b[32m模型回复 (前800字):\n${text.slice(0, 800)}\x1b[0m`);
                } else {
                  debugLog('LLM-RESP', `\x1b[31m⚠ 模型回复无文本! content items: ${content.map((c: any) => c.type).join(', ')}\x1b[0m`);
                  debugLog('LLM-RESP', `原始content: ${JSON.stringify(content).slice(0, 1000)}`);
                }
                if (toolCalls.length > 0) {
                  debugLog('LLM-RESP', `模型请求调用 ${toolCalls.length} 个工具: ${toolCalls.map((t: any) => t.name).join(', ')}`);
                }
              } else if (typeof content === 'string') {
                debugLog('LLM-RESP', `\x1b[32m模型回复 (前800字):\n${content.slice(0, 800)}\x1b[0m`);
              } else {
                debugLog('LLM-RESP', `\x1b[31m⚠ 未知content格式: ${JSON.stringify(content).slice(0, 1000)}\x1b[0m`);
              }
            }
            break;
          }
          case 'message_update': {
            const evt = event.assistantMessageEvent;
            if (evt?.type === 'error') {
              debugLog('STREAM', `\x1b[31m❌ 流式错误: ${JSON.stringify(evt).slice(0, 500)}\x1b[0m`);
            } else if (evt?.type === 'done') {
              const r = evt.response;
              debugLog('STREAM', `✅ 流式完成  usage: ${JSON.stringify(r?.usage ?? null)}  error: ${r?.errorMessage ?? 'none'}`);
            }
            break;
          }
          case 'tool_execution_start':
            debugLog('TOOL', `\x1b[35m🔧 执行工具: ${event.toolName}\x1b[0m  参数: ${JSON.stringify(event.args).slice(0, 500)}`);
            break;
          case 'tool_execution_end': {
            const result = event.result;
            let text = result?.content?.[0]?.text ?? (typeof result === 'string' ? result : JSON.stringify(result ?? {}));
            debugLog('TOOL', `\x1b[35m✓ 工具返回: ${event.toolName}\x1b[0m  结果: ${String(text).slice(0, 500)}`);
            break;
          }
        }
      }
      onEvent(event);
    });

    if (signal) {
      signal.addEventListener('abort', () => agent.abort());
    }

    await saveMessage(sessionId, 'user', prompt);
    await saveToMemory(prompt, { source: 'chat', role: 'user', sessionId });

    if (history.length === 0) { await upsertSession(sessionId, prompt.slice(0, 20)); }

    await agent.prompt(prompt);

    const lastMessage = agent.state.messages[agent.state.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content;
      const text = Array.isArray(content)
        ? content.find((c: any) => c.type === 'text')?.text
        : typeof content === 'string' ? content : undefined;
      if (text) {
        await saveMessage(sessionId, 'assistant', text);
        await saveToMemory(text, { source: 'chat', role: 'assistant', sessionId });
      }
    }

    return agent.state.messages;
  } catch (error) {
    console.error('[CRITICAL] 豹哥内核异常:', error);
    throw error;
  }
}

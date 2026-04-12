import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { loadTools, loadSkillTools } from '../tools/loader';
import { getChatHistory, saveMessage, upsertSession, saveToMemory } from '../memory';
import { getProviderFor, getModelFor, getChatCompletionExtra, getModelParams } from '../config';
import { getSkillsContext, getSkillMdNames, getSkillData, listSkills, getSkillDescription } from '../lib/skills';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';

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

/** 从 messages 中向后扫描，取最后一条 assistant 文本 */
function extractLastAssistantText(messages: any[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'assistant') continue;
    const c = m.content;
    if (typeof c === 'string' && c.trim()) return c;
    if (Array.isArray(c)) {
      const t = c.find((p: any) => p.type === 'text' && p.text)?.text;
      if (t) return t;
    }
  }
  return undefined;
}

/**
 * 创建 Agent 实例的核心函数
 */
export async function createAgentInstance(options: {
  name: string,
  systemPrompt: string,
  tools: any[],
  onEvent: (event: any) => void,
  taskType?: 'chat' | 'coding' | 'vision'
}) {
  const task = options.taskType || 'chat';
  const provider = getProviderFor(task);
  const extra = getChatCompletionExtra(task);
  const chatParams = getModelParams(task);

  // 借用 pi-ai 的 model 形状，再覆写为真实 id/baseUrl。
  // 注：未来若 pi-ai 冻结返回对象或在构造时校验 id，此处需改为直接构造。
  const model = getModel('openai', 'gpt-4o-mini' as any);
  if (!model) throw new Error('Model Load Error');

  Object.assign(model, {
    api: 'openai-completions',
    id: getModelFor(task),
    baseUrl: provider.baseUrl,
    ...(chatParams?.maxTokens != null ? { maxTokens: chatParams.maxTokens } : {}),
    ...(chatParams?.contextWindow != null ? { contextWindow: chatParams.contextWindow } : {}),
    ...extra,
  });

  const agent = new Agent({
    getApiKey: () => provider.apiKey,
  });

  agent.setModel(model);
  agent.setSystemPrompt(options.systemPrompt);
  agent.setTools(options.tools);

  agent.subscribe((event: any) => {
    // 注入来源信息，方便 UI 区分
    const enhancedEvent = { ...event, agentName: options.name };
    
    if (DEBUG) {
      switch (event.type) {
        case 'message_end': {
          const role = event.message?.role;
          const content = event.message?.content;
          if (role === 'assistant') {
            const text = Array.isArray(content)
              ? content.find((c: any) => c.type === 'text')?.text
              : typeof content === 'string' ? content : undefined;
            if (text) {
              debugLog(`LLM-RESP-${options.name}`, `\x1b[32m回复 (前800字):\n${text.slice(0, 800)}\x1b[0m`);
            }
          }
          break;
        }
        case 'tool_execution_start':
          debugLog(`TOOL-${options.name}`, `\x1b[35m执行: ${event.toolName}\x1b[0m  参数: ${JSON.stringify(event.args).slice(0, 500)}`);
          break;
      }
    }
    options.onEvent(enhancedEvent);
  });

  return agent;
}

export async function runBaoge(
  prompt: string,
  sessionId: string,
  onEvent: (event: any) => void,
  signal?: AbortSignal
) {
  try {
    const skillList = listSkills().map(s => {
      const desc = getSkillDescription(s.name);
      return desc ? `  - ${s.name}: ${desc}` : `  - ${s.name}`;
    }).join('\n');

    const basePrompt = `你是一个助手，叫"豹哥"。

【避免复读】
- 不要重复执行相同或高度相似的命令。若某命令已执行过且结果不理想，应换一种思路或向用户说明情况。
- 若连续多次尝试未能解决问题，请停下来总结现状并询问用户下一步需求，而非继续重复尝试。
- 执行失败时，先分析原因，再决定是换方式重试还是告知用户。

【子智能体协作 (Subagents)】
- 你可以将复杂的子任务委派给专门的子智能体处理。
- 使用 \`delegate_task\` 工具，传入 agent_name、task，可选 task_type（chat|coding|vision，默认 chat）。
- 可用的子智能体：
${skillList || '  （无）'}
- 只有当任务确实需要专门的技能时，才使用委派；不要嵌套委派。`;

    const skillsCtx = getSkillsContext();
    const systemPrompt = basePrompt + (skillsCtx ? skillsCtx : '');

    const tools = await loadTools();

    // 注入委派工具
    const delegateTool = {
      name: 'delegate_task',
      label: '委派任务',
      description: '将特定任务委派给专门的子智能体执行。',
      parameters: z.object({
        agent_name: z.string().describe('子智能体的名称（对应技能名）'),
        task: z.string().describe('委派给子智能体的具体任务描述'),
        task_type: z.enum(['chat', 'coding', 'vision']).optional().describe('子智能体使用的模型类型，默认 chat')
      }),
      execute: async (params: { agent_name: string; task: string; task_type?: 'chat' | 'coding' | 'vision' }) => {
        debugLog('DELEGATE', `正在委派给 ${params.agent_name} (${params.task_type ?? 'chat'}): ${params.task}`);
        const skillData = getSkillData(params.agent_name);
        if (!skillData) return `错误：找不到名为 ${params.agent_name} 的子智能体。`;

        const subTools = await loadSkillTools(params.agent_name);
        const subagent = await createAgentInstance({
          name: params.agent_name,
          systemPrompt: skillData.skillMd || `你是一个专门负责 ${params.agent_name} 的子智能体。`,
          tools: subTools,
          taskType: params.task_type ?? 'chat',
          onEvent: (ev) => onEvent({ ...ev, parentAgent: 'main' }),
        });

        // 通知 UI 子智能体启动
        onEvent({
          type: 'subagent_start',
          agentName: params.agent_name,
          parentAgent: 'main',
          tools: subTools.map((t: { name: string }) => t.name),
        });

        // 转发主流程的中止信号
        const onAbort = () => subagent.abort();
        if (signal) {
          if (signal.aborted) subagent.abort();
          else signal.addEventListener('abort', onAbort);
        }

        try {
          await subagent.prompt(params.task);
        } finally {
          if (signal) signal.removeEventListener('abort', onAbort);
          onEvent({ type: 'subagent_end', agentName: params.agent_name, parentAgent: 'main' });
        }

        const text = extractLastAssistantText(subagent.state.messages) ?? '子智能体未返回有效内容';
        return `子智能体 ${params.agent_name} 的执行结果：\n\n${text}`;
      }
    };

    // 这里手动转换 zod 模式，因为 loadTools 里用了 zodToJsonSchema
    // 为了简单起见，我们重新走一遍 registerExports 的逻辑或者手动构造
    // 实际上 loadTools 已经处理了 registerExports。
    // 我们直接把这个工具对象推入 tools 数组，但在 loadTools 之后。
    // 注意：Agent 期望的是已经符合其规范的 tool 对象（含有 execute(toolCallId, params)）

    const finalTools = [...tools];
    const { zodToJsonSchema } = await import('zod-to-json-schema');
    finalTools.push({
      name: delegateTool.name,
      label: delegateTool.label,
      description: delegateTool.description,
      parameters: zodToJsonSchema(delegateTool.parameters as any),
      execute: async (toolCallId: string, params: any) => {
        const result = await delegateTool.execute(params);
        return {
          content: [{ type: 'text', text: String(result) }],
          details: result
        };
      }
    });

    const mainAgent = await createAgentInstance({
      name: 'main',
      systemPrompt,
      tools: finalTools,
      onEvent
    });

    onEvent({ type: 'skills_loaded', skillMd: getSkillMdNames(), tools: finalTools.map((t: { name: string }) => t.name) });

    const history = await getChatHistory(sessionId);
    if (history.length > 0) {
      const formattedHistory = history.map(h => ({
        role: h.role,
        content: [{ type: 'text', text: h.content }]
      }));
      mainAgent.replaceMessages(formattedHistory as any);
    }

    if (signal) {
      signal.addEventListener('abort', () => mainAgent.abort());
    }

    await saveMessage(sessionId, 'user', prompt);
    await saveToMemory(prompt, { source: 'chat', role: 'user', sessionId });

    if (history.length === 0) { await upsertSession(sessionId, prompt.slice(0, 20)); }

    await mainAgent.prompt(prompt);

    const text = extractLastAssistantText(mainAgent.state.messages);
    if (text) {
      await saveMessage(sessionId, 'assistant', text);
      await saveToMemory(text, { source: 'chat', role: 'assistant', sessionId });
    }

    return mainAgent.state.messages;
  } catch (error) {
    console.error('[CRITICAL] 豹哥内核异常:', error);
    throw error;
  }
}

import { Agent, AgentSession } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { loadTools } from './loader';
import { getChatHistory, saveMessage, upsertSession, saveToMemory } from '../memory';
import { config } from '../config';

export async function runBaoge(
  prompt: string,
  sessionId: string,
  onEvent: (event: any) => void,
  signal?: AbortSignal
) {
  try {
    const model = getModel('openai', 'gpt-4o-mini' as any);
    if (!model) throw new Error('Model Load Error');

    model.api = 'openai-completions' as any;
    model.id = config.llmModel;
    model.baseUrl = config.llmBaseUrl;

    const agent = new Agent({
      getApiKey: () => config.llmApiKey,
      // 如果 pi-agent-core 版本支持，这里可以注入调试钩子
    });

    agent.setModel(model);
    agent.setSystemPrompt(`你是一个助手，叫"豹哥"。

【避免复读】
- 不要重复执行相同或高度相似的命令。若某命令已执行过且结果不理想，应换一种思路或向用户说明情况。
- 若连续多次尝试未能解决问题，请停下来总结现状并询问用户下一步需求，而非继续重复尝试。
- 执行失败时，先分析原因，再决定是换方式重试还是告知用户。`);

    const tools = await loadTools();
    agent.setTools(tools);

    const history = await getChatHistory(sessionId);
    if (history.length > 0) {
      const formattedHistory = history.map(h => ({
        role: h.role,
        content: [{ type: 'text', text: h.content }]
      }));
      agent.replaceMessages(formattedHistory as any);
    }

    agent.subscribe(onEvent);

    if (signal) {
      signal.addEventListener('abort', () => agent.abort());
    }

    await saveMessage(sessionId, 'user', prompt);
    await saveToMemory(prompt, { source: 'chat', role: 'user', sessionId });

    if (history.length === 0) { await upsertSession(sessionId, prompt.slice(0, 20)); }

    // 这里由于是 Web 环境，我们通常需要处理长时间挂起的请求
    await agent.prompt(prompt);
    
    const lastMessage = agent.state.messages[agent.state.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      const text = (lastMessage.content as any[]).find(c => c.type === 'text')?.text;
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

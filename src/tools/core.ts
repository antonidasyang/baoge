import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { loadTools } from './loader';
import { getChatHistory, saveMessage, upsertSession, saveToMemory } from '../memory';
import { config } from '../config';

export async function runBaoge(prompt: string, sessionId: string, onEvent: (event: any) => void) {
  try {
    // 1. 从官方包获取模型
    const model = getModel('openai', 'gpt-4o-mini' as any);
    if (!model) throw new Error('Model Load Error');

    // 对齐配置
    model.api = 'openai-completions' as any;
    model.id = config.llmModel;
    model.baseUrl = config.llmBaseUrl;

    const agent = new Agent({
      getApiKey: () => config.llmApiKey
    });

    agent.setModel(model);
    agent.setSystemPrompt('你是一个叫“豹哥”的助手。你拥有长期记忆，可以自动记录和搜索历史信息。');

    // 2. 加载技能
    const tools = await loadTools();
    agent.setTools(tools);

    // 3. 历史记录注入
    const history = await getChatHistory(sessionId);
    if (history.length > 0) {
      const formattedHistory = history.map(h => ({
        role: h.role,
        content: [{ type: 'text', text: h.content }]
      }));
      agent.replaceMessages(formattedHistory as any);
    }

    // 4. 事件监听
    agent.subscribe(onEvent);

    // 5. 存储与执行
    await saveMessage(sessionId, 'user', prompt);
    await saveToMemory(prompt, { source: 'chat', role: 'user', sessionId });

    if (history.length === 0) {
      await upsertSession(sessionId, prompt.slice(0, 20));
    }

    await agent.prompt(prompt);
    
    // 6. 结果持久化
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
    console.error('[Baoge] Core Runtime Error:', error);
    throw error;
  }
}

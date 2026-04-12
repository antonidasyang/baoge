import { z } from 'zod';
import OpenAI from 'openai';
import { getProviderFor, getModelFor, getChatCompletionExtra } from '../config';

function getCodingClient() {
  const p = getProviderFor('coding');
  return new OpenAI({ apiKey: p.apiKey, baseURL: p.baseUrl });
}

export default {
  name: 'use_coding_model',
  description: 'Call a coding-specialized model for code generation, review, refactoring, bug fixing, or complex reasoning. Use when the main model needs stronger code capability.',
  parameters: z.object({
    task: z.string().optional().describe('Task description, e.g. "generate a function to...", "review this code", "explain this logic"'),
    prompt: z.string().optional().describe('Alias for task'),
    code_context: z.string().optional().describe('Optional: relevant code or context for the model')
  }),
  execute: async (params: { task?: string; prompt?: string; code_context?: string }) => {
    const p = getProviderFor('coding');
    const model = getModelFor('coding');
    if (!p.apiKey) return '未配置 API Key，无法调用编程模型。';

    const taskContent = params.task || params.prompt;
    if (!taskContent) return '请提供任务描述（task 或 prompt 参数）。';

    const content = params.code_context
      ? `任务：${taskContent}\n\n相关代码或上下文：\n\`\`\`\n${params.code_context}\n\`\`\``
      : taskContent;

    try {
      const client = getCodingClient();
      const extra = getChatCompletionExtra('coding');
      const resp = await client.chat.completions.create({
        model,
        ...extra,
        messages: [
          {
            role: 'system',
            content: '你是一个专注编程的 AI 助手，擅长代码生成、审查、重构和问题诊断。直接给出准确、可执行的回答。'
          },
          { role: 'user', content }
        ]
      });
      const text = resp.choices[0]?.message?.content;
      return text || '编程模型未返回有效内容。';
    } catch (err: any) {
      return `编程模型调用失败: ${err.message}`;
    }
  }
};

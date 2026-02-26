import { z } from 'zod';
import { saveToMemory, searchMemory } from '../memory';

export default {
  name: 'manage_memory',
  description: '记忆管理',
  parameters: z.object({
    action: z.enum(['save', 'search']),
    text: z.string()
  }),
  execute: async (params: { action: string; text: string }) => {
    if (params.action === 'save') {
      await saveToMemory(params.text);
      return '已记下';
    } else {
      const results = await searchMemory(params.text);
      return results.length > 0 ? results.map(r => r.text).join('\n') : '没印象';
    }
  }
};

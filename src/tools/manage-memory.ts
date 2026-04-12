import { z } from 'zod';
import { saveToMemory, searchMemory } from '../memory';

export default {
  name: 'manage_memory',
  description: 'Save text to long-term memory or search memories by semantic similarity. Use action save to store, search to retrieve.',
  parameters: z.object({
    action: z.enum(['save', 'search']).describe('save: store text; search: find similar memories'),
    text: z.string().describe('Text to save or search query')
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

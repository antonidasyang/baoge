import { z } from 'zod';

export const timeSkill = {
  metadata: {
    id: 'get_time',
    name: 'System clock',
    version: '1.0.0',
    description: 'Get current date and time',
    category: 'system',
    icon: 'Clock'
  },
  parameters: z.object({}),
  execute: async () => new Date().toLocaleString()
};

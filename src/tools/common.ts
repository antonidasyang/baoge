import { z } from 'zod';

export const timeSkill = {
  metadata: {
    id: 'get_time',
    name: '系统时钟',
    version: '1.0.0',
    description: '查询当前的日期和时间',
    category: 'system',
    icon: 'Clock'
  },
  parameters: z.object({}),
  execute: async () => new Date().toLocaleString()
};

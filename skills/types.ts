import { z } from 'zod';

export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: 'system' | 'web' | 'productivity' | 'memory';
  icon?: string;
}

export interface BaogeSkill {
  metadata: SkillMetadata;
  parameters: z.ZodObject<any>;
  execute: (params: any, context?: any) => Promise<any>;
}

import { z } from 'zod';
import { embed } from '../memory';
import { getProviderFor, getModelFor } from '../config';

export default {
  name: 'use_embedding',
  description: 'Compute text embeddings for semantic similarity, retrieval, or clustering. Use param text for input; optionally use compare_with to compute cosine similarity between two texts.',
  parameters: z.object({
    text: z.string().describe('Text to embed'),
    compare_with: z.string().optional().describe('Optional: second text to compute cosine similarity with the first')
  }),
  execute: async (params: { text: string; compare_with?: string }) => {
    const provider = getProviderFor('embedding');
    if (!provider.apiKey) {
      return 'Embedding 不可用：未配置 provider.apiKey。请在 ~/.baoge/config.json 的 provider 中设置 apiKey。';
    }
    const vec = await embed(params.text);
    if (!vec) {
      const model = getModelFor('embedding');
      return `Embedding 调用失败。请检查 ~/.baoge/config.json：1) models.embedding 是否正确（当前: ${model}）；2) provider.baseUrl 是否指向支持 embeddings 的 API。`;
    }

    if (params.compare_with) {
      const vec2 = await embed(params.compare_with);
      if (!vec2) return '无法计算第二段文本的嵌入。';
      if (vec.length !== vec2.length) return '两段文本嵌入维度不一致。';
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < vec.length; i++) {
        dot += vec[i] * vec2[i];
        normA += vec[i] * vec[i];
        normB += vec2[i] * vec2[i];
      }
      const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
      return `余弦相似度: ${sim.toFixed(4)}（1 为完全相同，-1 为完全相反）`;
    }

    return `嵌入成功，维度 ${vec.length}。可用于语义检索或相似度计算。`;
  }
};

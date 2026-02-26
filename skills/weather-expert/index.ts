import { z } from 'zod';
// @ts-ignore
import { ProxyAgent } from 'undici';
import { loadPluginConfig } from '../../config';

interface WeatherConfig {
  proxy?: string;
}

export default {
  metadata: {
    id: 'weather-expert',
    name: '气象预报专家',
    version: '2.6.0',
    description: '获取全球指定城市的实时天气。',
    category: 'web',
    icon: 'Cloud'
  },
  parameters: z.object({
    city: z.string().describe('城市名称')
  }),
  execute: async (params: { city: string }) => {
    const url = `https://wttr.in/${encodeURIComponent(params.city)}?format=3`;
    const weatherConfig = loadPluginConfig<WeatherConfig>('weather');
    
    try {
      const fetchOptions: any = { headers: { 'User-Agent': 'curl/7.64.1' } };
      if (weatherConfig?.proxy) {
        fetchOptions.dispatcher = new ProxyAgent(weatherConfig.proxy);
      }
      const res = await fetch(url, fetchOptions);
      return res.ok ? await res.text() : `无法获取 ${params.city} 的天气。`;
    } catch {
      return '天气服务连接失败。';
    }
  }
};

import type { LLMProvider, LLMMessage, LLMOptions } from './types';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { createClaudeProvider } from './claude';

/**
 * 预置的模型配置
 */
const PRESETS: Record<string, { baseUrl: string; model: string }> = {
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'MiniMax-Text-01',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
};

let cachedProvider: LLMProvider | null = null;
let cachedProviderKey: string | null = null;

/**
 * 获取 LLM Provider（自动根据环境变量创建）
 *
 * 环境变量：
 *   LLM_PROVIDER  - 模型提供商：minimax / deepseek / qwen / openai / claude / custom
 *   LLM_API_KEY   - API Key
 *   LLM_MODEL     - 自定义模型名（可选，覆盖预设）
 *   LLM_BASE_URL  - 自定义 API 地址（可选，custom 时必填）
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'minimax';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const baseUrl = process.env.LLM_BASE_URL;

  // 缓存判断
  const cacheKey = `${provider}:${apiKey}:${model}:${baseUrl}`;
  if (cachedProvider && cachedProviderKey === cacheKey) {
    return cachedProvider;
  }

  if (!apiKey) {
    throw new Error('缺少 LLM_API_KEY 环境变量');
  }

  if (provider === 'claude') {
    cachedProvider = createClaudeProvider({
      apiKey,
      model: model || 'claude-sonnet-4-20250514',
    });
  } else {
    // minimax / deepseek / qwen / openai / custom
    const preset = PRESETS[provider];
    const finalBaseUrl = baseUrl || preset?.baseUrl;
    const finalModel = model || preset?.model;

    if (!finalBaseUrl) {
      throw new Error(
        `未知 provider "${provider}"，需要设置 LLM_BASE_URL`,
      );
    }

    cachedProvider = createOpenAICompatibleProvider({
      baseUrl: finalBaseUrl,
      apiKey,
      model: finalModel || 'unknown',
    });
  }

  cachedProviderKey = cacheKey;
  return cachedProvider;
}

export type { LLMProvider, LLMMessage, LLMOptions };

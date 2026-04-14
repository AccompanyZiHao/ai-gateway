import type { LLMProvider, LLMMessage, LLMOptions } from './types';

/**
 * OpenAI 兼容格式 Provider
 * 支持：MiniMax、DeepSeek、通义千问、豆包等国内模型
 * 也支持 OpenAI 本身
 */
export function createOpenAICompatibleProvider(config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): LLMProvider {
  return {
    async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<string> {
      const apiMessages = [];
      if (options.systemPrompt) {
        apiMessages.push({ role: 'system', content: options.systemPrompt });
      }
      apiMessages.push(...messages);

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: options.maxTokens || 4096,
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API 错误 (${response.status}): ${error}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

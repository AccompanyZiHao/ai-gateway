import type { LLMProvider, LLMMessage, LLMOptions } from './types';

/**
 * Anthropic Claude Provider
 */
export function createClaudeProvider(config: {
  apiKey: string;
  model: string;
}): LLMProvider {
  return {
    async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<string> {
      const systemPrompt = options.systemPrompt;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: options.maxTokens || 4096,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API 错误 (${response.status}): ${error}`);
      }

      const data = await response.json();
      return data.content
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text: string }) => block.text)
        .join('');
    },
  };
}

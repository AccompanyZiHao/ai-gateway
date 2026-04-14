import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface ClaudeChatOptions {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
}

export async function chat(
  userMessage: string,
  options: ClaudeChatOptions = {},
): Promise<string> {
  const {
    systemPrompt,
    model = 'claude-sonnet-4-20250514',
    maxTokens = 4096,
  } = options;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

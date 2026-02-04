// AI client that routes through local Clawdbot

const CLAWDBOT_URL = process.env.CLAWDBOT_URL || 'http://127.0.0.1:18789/v1/chat/completions';
const CLAWDBOT_TOKEN = process.env.CLAWDBOT_TOKEN || '9d6589d23b7a19ab10174d2a66bef88cfc94652c4628b0a7';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionOptions {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export async function createCompletion(options: CompletionOptions): Promise<string> {
  const response = await fetch(CLAWDBOT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLAWDBOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'clawdbot:main',
      messages: options.messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Clawdbot API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

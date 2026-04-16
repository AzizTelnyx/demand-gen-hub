// AI client via Telnyx LiteLLM gateway (direct, no OpenClaw proxy)
import OpenAI from "openai";
import dotenv from "dotenv";

// Load env vars before using them
dotenv.config();

const LITELLM_BASE = process.env.LITELLM_BASE_URL || "http://litellm-aiswe.query.prod.telnyx.io:4000/v1";
const LITELLM_KEY = process.env.LITELLM_API_KEY || "";

// Telnyx LiteLLM gateway — fast, no serialization
const litellm = new OpenAI({
  baseURL: LITELLM_BASE,
  apiKey: LITELLM_KEY,
  timeout: 30000,
});

// OpenClaw gateway fallback
const openclaw = new OpenAI({
  baseURL: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || "",
  timeout: 60000,
});

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionOptions {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export async function createCompletion(options: CompletionOptions): Promise<string> {
  const model = options.model || "openai/gpt-4.1-mini";

  // Use LiteLLM if key is configured, otherwise fall back to OpenClaw gateway
  const client = LITELLM_KEY ? litellm : openclaw;
  const finalModel = LITELLM_KEY ? model : "claude-3-5-haiku-latest";

  const completion = await client.chat.completions.create({
    model: finalModel,
    messages: options.messages,
    max_tokens: options.maxTokens || 2048,
    temperature: options.temperature || 0.3,
  });

  return completion.choices[0]?.message?.content || '';
}

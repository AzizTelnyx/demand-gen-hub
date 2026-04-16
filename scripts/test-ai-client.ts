#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config();

console.log("Environment variables:");
console.log("LITELLM_API_KEY:", process.env.LITELLM_API_KEY ? `${process.env.LITELLM_API_KEY.slice(0, 10)}...` : "NOT SET");
console.log("LITELLM_BASE_URL:", process.env.LITELLM_BASE_URL);
console.log("OPENCLAW_GATEWAY_TOKEN:", process.env.OPENCLAW_GATEWAY_TOKEN ? `${process.env.OPENCLAW_GATEWAY_TOKEN.slice(0, 10)}...` : "NOT SET");

import { createCompletion } from "../src/lib/ai-client";

async function test() {
  try {
    const result = await createCompletion({
      messages: [{ role: "user", content: "Say 'test successful'" }],
      maxTokens: 20,
      model: "openai/gpt-4o-mini-search-preview-2025-03-11",
    });
    console.log("\n✅ AI client working!");
    console.log("Response:", result);
  } catch (error) {
    console.error("\n❌ AI client error:");
    console.error(error);
  }
}

test();

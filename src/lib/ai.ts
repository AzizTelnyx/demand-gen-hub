import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Send a message to Claude via OpenClaw gateway and get a response.
 * Falls back to basic response if OpenClaw is unavailable.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  // Try Anthropic SDK first (if API key is set)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: options?.maxTokens || 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      if (response.content[0]?.type === "text") {
        return response.content[0].text;
      }
    } catch (e) {
      console.error("Anthropic SDK error:", e);
    }
  }

  // Try OpenClaw gateway CLI
  try {
    const fullPrompt = `${systemPrompt}\n\nUser message: ${userMessage}`;
    // Escape for shell
    const escaped = fullPrompt.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `openclaw agent --local --json -m '${escaped}' 2>/dev/null || openclaw agent --json -m '${escaped}' 2>/dev/null`,
      { timeout: 30000, env: { ...process.env, PATH: process.env.PATH + ":/opt/homebrew/bin" } }
    );
    
    try {
      const parsed = JSON.parse(stdout);
      return parsed.reply || parsed.response || parsed.message || stdout.trim();
    } catch {
      return stdout.trim();
    }
  } catch (e) {
    console.error("OpenClaw CLI error:", e);
  }

  // Final fallback
  return `I received your message but AI is currently unavailable. Please check that either ANTHROPIC_API_KEY is set or the OpenClaw gateway is running.`;
}

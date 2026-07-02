// Thin wrapper around OpenRouter's OpenAI-compatible chat completions
// endpoint. Swap OPENROUTER_MODEL in .env to point at any model
// OpenRouter serves — nothing else here needs to change.

import type { OpenAIToolDef } from "./mcpClient.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface OpenRouterChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;

export async function callOpenRouter(
  messages: ChatMessage[],
  tools?: OpenAIToolDef[]
): Promise<OpenRouterChoice["message"]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  console.log(`[openrouter] calling ${process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"}...`);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Optional but recommended by OpenRouter for analytics/rate limiting.
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Gift concierge chatbot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  console.log(`[openrouter] responded in ${Date.now() - startedAt}ms (status ${response.status})`);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const choice = data.choices[0];
  if (!choice) {
    throw new Error("OpenRouter returned no choices");
  }
  return choice.message;
}

import { hash } from "./hmac";

export type PromptCacheKeyMode = "session" | "off";

// Stable per-session cache routing key for OpenAI/xAI prompt caching. The
// session id is hashed so the raw id never leaves the client.
export function getPromptCacheKey(
  sessionId?: string,
  mode?: PromptCacheKeyMode,
) {
  if (!sessionId || (mode ?? "session") === "off") return undefined;
  return `neatchat-${hash(sessionId).slice(0, 32)}`;
}

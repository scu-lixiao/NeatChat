import { jest } from "@jest/globals";
import { getPromptCacheKey } from "../prompt-cache";
import { ChatGPTApi } from "../../client/platforms/openai";
import { XAIApi } from "../../client/platforms/xai";
import { useChatStore } from "../../store/chat";
import type { ModelConfig } from "../../store/config";

describe("getPromptCacheKey", () => {
  test("is stable for the same session id", () => {
    const key = getPromptCacheKey("session-a");
    expect(key).toBe(getPromptCacheKey("session-a", "session"));
    expect(key).toMatch(/^neatchat-[0-9a-f]{32}$/);
  });

  test("matches the first 32 hex chars of sha256(sessionId)", () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(getPromptCacheKey("abc")).toBe(
      "neatchat-ba7816bf8f01cfea414140de5dae2223",
    );
  });

  test("differs across session ids", () => {
    expect(getPromptCacheKey("session-a")).not.toBe(
      getPromptCacheKey("session-b"),
    );
  });

  test("is absent when off or without a session id", () => {
    expect(getPromptCacheKey("session-a", "off")).toBeUndefined();
    expect(getPromptCacheKey(undefined)).toBeUndefined();
    expect(getPromptCacheKey("")).toBeUndefined();
  });
});

async function captureResponsesPayload(
  api: { chat: (options: any) => Promise<unknown> },
  model: string,
  providerName: string,
  sessionId: string | undefined,
  modelConfig: Partial<ModelConfig> = {},
) {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockClear();

  // The platforms read the current session's mask config; override it there
  // without writing to the persisted chat store.
  const chatState = useChatStore.getState();
  const session = chatState.currentSession();
  const currentSession = jest.spyOn(chatState, "currentSession");
  currentSession.mockReturnValue({
    ...session,
    mask: {
      ...session.mask,
      modelConfig: { ...session.mask.modelConfig, ...modelConfig },
    },
  });

  try {
    await api.chat({
      messages: [{ role: "user", content: "hello" }],
      config: { model, providerName, stream: false },
      sessionId,
      onFinish: () => {},
      onError: () => {},
    });
  } finally {
    currentSession.mockRestore();
  }

  const chatCall = fetchMock.mock.calls.find(([url]) =>
    String(url).includes("responses"),
  ) as [string, RequestInit] | undefined;
  if (!chatCall) throw new Error(`no Responses request for ${model}`);
  return JSON.parse(chatCall[1].body as string);
}

const responsesProviders = [
  {
    providerName: "OpenAI",
    model: "gpt-5.5",
    createApi: () => new ChatGPTApi(),
  },
  { providerName: "XAI", model: "grok-4.3", createApi: () => new XAIApi() },
];

describe.each(responsesProviders)(
  "$providerName Responses payload",
  ({ providerName, model, createApi }) => {
    test("sends prompt_cache_key derived from the session id", async () => {
      const payload = await captureResponsesPayload(
        createApi(),
        model,
        providerName,
        "session-a",
      );
      expect(payload.prompt_cache_key).toBe(getPromptCacheKey("session-a"));
    });

    test("omits prompt_cache_key when disabled", async () => {
      const payload = await captureResponsesPayload(
        createApi(),
        model,
        providerName,
        "session-a",
        { promptCacheKey: "off" },
      );
      expect(payload).not.toHaveProperty("prompt_cache_key");
    });

    test("omits prompt_cache_key without a session id", async () => {
      const payload = await captureResponsesPayload(
        createApi(),
        model,
        providerName,
        undefined,
      );
      expect(payload).not.toHaveProperty("prompt_cache_key");
    });
  },
);

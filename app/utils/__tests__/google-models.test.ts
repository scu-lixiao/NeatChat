import { jest } from "@jest/globals";
import { DEFAULT_MODELS, KnowledgeCutOffDate } from "../../constant";
import { isVisionModel } from "../../utils";
import {
  GeminiProApi,
  resolveGeminiMaxOutputTokens,
  resolveGeminiThinkingLevel,
} from "../../client/platforms/google";
import { useChatStore } from "../../store/chat";
import { DEFAULT_CONFIG, type ModelConfig } from "../../store/config";
import { getGeminiThinkingLevels } from "../model";

const GLOBAL_DEFAULT_MAX_TOKENS = DEFAULT_CONFIG.modelConfig.max_tokens;

const GEMINI_3_SUPPORTED_THINKING_LEVELS: Record<string, string[]> = {
  "gemini-3-pro-preview": ["low", "high"],
  "gemini-3-flash-preview": ["minimal", "low", "medium", "high"],
  "gemini-3.1-pro-preview": ["low", "medium", "high"],
  "gemini-3.5-pro": ["low", "medium", "high"],
  "gemini-3.6-flash": ["minimal", "low", "medium", "high"],
  "gemini-3.7-flash": ["low", "medium", "high"],
  "gemini-3.8-flash": ["low", "medium", "high"],
};

const GEMINI_3_THINKING_LEVEL_MODELS = Object.keys(
  GEMINI_3_SUPPORTED_THINKING_LEVELS,
);

async function captureGeminiPayload(
  model: string,
  modelConfig: Partial<ModelConfig> = {},
) {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockClear();

  // GeminiProApi reads the current session's mask config; override it there
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
    await new GeminiProApi().chat({
      messages: [{ role: "user", content: "hello" }],
      config: { model, stream: false },
      onFinish: () => {},
      onError: () => {},
    } as any);
  } finally {
    currentSession.mockRestore();
  }

  const chatCall = fetchMock.mock.calls.find(([, init]) =>
    String((init as RequestInit | undefined)?.body ?? "").includes(
      "generationConfig",
    ),
  ) as [string, RequestInit] | undefined;
  if (!chatCall) throw new Error(`no Gemini chat request for ${model}`);
  return JSON.parse(chatCall[1].body as string);
}

describe("Google model registry", () => {
  test("registers gemini-4-argon as the first built-in Google model", () => {
    const googleModels = DEFAULT_MODELS.filter(
      (m) => m.provider.providerType === "google",
    );
    expect(googleModels[0]).toEqual(
      expect.objectContaining({
        name: "gemini-4-argon",
        provider: expect.objectContaining({ providerName: "Google" }),
      }),
    );
  });

  test("leaves the gemini-4-argon knowledge cutoff to the default", () => {
    expect(KnowledgeCutOffDate["gemini-4-argon"]).toBeUndefined();
  });

  test("treats gemini-4-argon as a vision-capable model", () => {
    expect(isVisionModel("gemini-4-argon")).toBe(true);
  });
});

describe("Gemini thinking level", () => {
  test.each(["low", "medium", "high"] as const)(
    "passes %s through for gemini-4-argon",
    (effort) => {
      expect(resolveGeminiThinkingLevel("gemini-4-argon", effort)).toBe(effort);
    },
  );

  test("leaves unsupported efforts on gemini-4-argon to the API default", () => {
    for (const effort of ["auto", "none", "minimal", "xhigh", "max"]) {
      expect(
        resolveGeminiThinkingLevel("gemini-4-argon", effort),
      ).toBeUndefined();
    }
    expect(resolveGeminiThinkingLevel("gemini-4-argon")).toBeUndefined();
  });

  test.each(Object.entries(GEMINI_3_SUPPORTED_THINKING_LEVELS))(
    "passes supported levels through for %s",
    (model, levels) => {
      expect(getGeminiThinkingLevels(model)).toEqual(levels);
      for (const level of levels) {
        expect(resolveGeminiThinkingLevel(model, level)).toBe(level);
      }
    },
  );

  test.each(GEMINI_3_THINKING_LEVEL_MODELS)(
    "falls back to high for %s when effort is auto or unsupported",
    (model) => {
      expect(resolveGeminiThinkingLevel(model)).toBe("high");
      expect(resolveGeminiThinkingLevel(model, "auto")).toBe("high");
      expect(resolveGeminiThinkingLevel(model, "xhigh")).toBe("high");
      expect(resolveGeminiThinkingLevel(model, "none")).toBe("high");
    },
  );

  test("falls back to high for levels a model does not accept", () => {
    expect(resolveGeminiThinkingLevel("gemini-3-pro-preview", "medium")).toBe(
      "high",
    );
    expect(resolveGeminiThinkingLevel("gemini-3.8-flash", "minimal")).toBe(
      "high",
    );
    expect(
      resolveGeminiThinkingLevel("gemini-3.1-pro-preview", "minimal"),
    ).toBe("high");
  });

  test("has no thinking levels for non thinking-level Gemini models", () => {
    for (const model of ["gemini-2.5-pro", "gemini-3-pro-image-preview"]) {
      expect(getGeminiThinkingLevels(model)).toEqual([]);
      expect(resolveGeminiThinkingLevel(model, "low")).toBeUndefined();
    }
  });
});

describe("Gemini max output tokens", () => {
  test("clamps gemini-4-argon to 65536 output tokens", () => {
    expect(resolveGeminiMaxOutputTokens("gemini-4-argon", 128000)).toBe(65536);
    expect(resolveGeminiMaxOutputTokens("gemini-4-argon", 65536)).toBe(65536);
    expect(resolveGeminiMaxOutputTokens("gemini-4-argon", 32768)).toBe(32768);
  });

  test("does not clamp other Gemini models", () => {
    expect(resolveGeminiMaxOutputTokens("gemini-3.5-pro", 128000)).toBe(128000);
  });

  test("uses 32768 for gemini-4-argon when max_tokens is the global default", () => {
    expect(
      resolveGeminiMaxOutputTokens("gemini-4-argon", GLOBAL_DEFAULT_MAX_TOKENS),
    ).toBe(32768);
  });

  test("respects user-set max_tokens for gemini-4-argon", () => {
    expect(resolveGeminiMaxOutputTokens("gemini-4-argon", 1024)).toBe(1024);
    expect(resolveGeminiMaxOutputTokens("gemini-4-argon", 8192)).toBe(8192);
    expect(
      resolveGeminiMaxOutputTokens(
        "gemini-4-argon",
        GLOBAL_DEFAULT_MAX_TOKENS + 1,
      ),
    ).toBe(GLOBAL_DEFAULT_MAX_TOKENS + 1);
  });

  test.each(["gemini-2.5-pro", ...GEMINI_3_THINKING_LEVEL_MODELS])(
    "keeps the global default max_tokens for %s",
    (model) => {
      expect(
        resolveGeminiMaxOutputTokens(model, GLOBAL_DEFAULT_MAX_TOKENS),
      ).toBe(GLOBAL_DEFAULT_MAX_TOKENS);
    },
  );
});

describe("Gemini request payload", () => {
  test("shapes gemini-4-argon tools and media resolution like gemini-3.5-pro", async () => {
    const argon = await captureGeminiPayload("gemini-4-argon");
    const reference = await captureGeminiPayload("gemini-3.5-pro");

    expect(argon.tools).toEqual(reference.tools);
    expect(argon.generationConfig.media_resolution).toBe(
      reference.generationConfig.media_resolution,
    );
    expect(argon.generationConfig.media_resolution).toBe(
      "MEDIA_RESOLUTION_HIGH",
    );
  });

  test.each(["low", "medium", "high"] as const)(
    "sends thinking_level %s for gemini-4-argon",
    async (effort) => {
      const { generationConfig } = await captureGeminiPayload(
        "gemini-4-argon",
        { reasoningEffort: effort },
      );

      expect(generationConfig.thinkingConfig).toEqual({
        includeThoughts: true,
        thinking_level: effort,
      });
    },
  );

  test.each(["auto", "xhigh", "none"] as const)(
    "omits thinking_level for gemini-4-argon when effort is %s",
    async (effort) => {
      const { generationConfig } = await captureGeminiPayload(
        "gemini-4-argon",
        { reasoningEffort: effort },
      );

      expect(generationConfig.thinkingConfig).toEqual({
        includeThoughts: true,
      });
    },
  );

  test.each(GEMINI_3_THINKING_LEVEL_MODELS)(
    "sends the chosen thinking_level for %s",
    async (model) => {
      const { generationConfig } = await captureGeminiPayload(model, {
        reasoningEffort: "low",
      });

      expect(generationConfig.thinkingConfig).toEqual({
        includeThoughts: true,
        thinking_level: "low",
      });
    },
  );

  test.each(GEMINI_3_THINKING_LEVEL_MODELS)(
    "keeps thinking_level high for %s when effort is auto",
    async (model) => {
      const { generationConfig } = await captureGeminiPayload(model, {
        reasoningEffort: "auto",
      });

      expect(generationConfig.thinkingConfig).toEqual({
        includeThoughts: true,
        thinking_level: "high",
      });
    },
  );

  test("sends minimal thinking_level for gemini-3-flash-preview", async () => {
    const { generationConfig } = await captureGeminiPayload(
      "gemini-3-flash-preview",
      { reasoningEffort: "minimal" },
    );

    expect(generationConfig.thinkingConfig.thinking_level).toBe("minimal");
  });

  test("does not send medium to gemini-3-pro-preview", async () => {
    const { generationConfig } = await captureGeminiPayload(
      "gemini-3-pro-preview",
      { reasoningEffort: "medium" },
    );

    expect(generationConfig.thinkingConfig.thinking_level).toBe("high");
  });

  test("clamps maxOutputTokens for gemini-4-argon only", async () => {
    const argon = await captureGeminiPayload("gemini-4-argon", {
      max_tokens: 128000,
    });
    const reference = await captureGeminiPayload("gemini-3.5-pro", {
      max_tokens: 128000,
    });

    expect(argon.generationConfig.maxOutputTokens).toBe(65536);
    expect(reference.generationConfig.maxOutputTokens).toBe(128000);
  });

  test("defaults maxOutputTokens to 32768 for gemini-4-argon only", async () => {
    const argon = await captureGeminiPayload("gemini-4-argon", {
      max_tokens: GLOBAL_DEFAULT_MAX_TOKENS,
    });
    const reference = await captureGeminiPayload("gemini-3.5-pro", {
      max_tokens: GLOBAL_DEFAULT_MAX_TOKENS,
    });

    expect(argon.generationConfig.maxOutputTokens).toBe(32768);
    expect(reference.generationConfig.maxOutputTokens).toBe(
      GLOBAL_DEFAULT_MAX_TOKENS,
    );
  });

  test("sends user-set maxOutputTokens for gemini-4-argon", async () => {
    const { generationConfig } = await captureGeminiPayload("gemini-4-argon", {
      max_tokens: 16384,
    });

    expect(generationConfig.maxOutputTokens).toBe(16384);
  });

  test("omits sampling params for gemini-4-argon", async () => {
    const { generationConfig } = await captureGeminiPayload("gemini-4-argon", {
      temperature: 0.2,
      top_p: 0.8,
    });

    expect(generationConfig).not.toHaveProperty("temperature");
    expect(generationConfig).not.toHaveProperty("topP");
    expect(generationConfig).not.toHaveProperty("topK");
  });

  test("keeps sampling params for gemini-2.5-pro", async () => {
    const { generationConfig } = await captureGeminiPayload("gemini-2.5-pro");

    expect(generationConfig).toHaveProperty("temperature");
    expect(generationConfig).toHaveProperty("topP");
  });
});

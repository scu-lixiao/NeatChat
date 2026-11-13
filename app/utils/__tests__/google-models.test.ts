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
import { getGeminiThinkingLevels, type GeminiThinkingLevel } from "../model";

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

type ReasoningEffort = NonNullable<ModelConfig["reasoningEffort"]>;

const GEMINI_4_SUPPORTED_THINKING_LEVELS: Record<
  string,
  GeminiThinkingLevel[]
> = {
  "gemini-4-argon": ["low", "medium", "high"],
  "gemini-4-carbon": ["low", "medium", "high"],
  "gemini-4-hydrogen": ["low", "medium", "high", "xhigh"],
};

const GEMINI_4_MODELS = Object.keys(GEMINI_4_SUPPORTED_THINKING_LEVELS);

// Argon and Carbon cap non-streaming REST requests at 32768 output tokens;
// Hydrogen allows 65536.
const GEMINI_4_DEFAULT_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "gemini-4-argon": 32768,
  "gemini-4-carbon": 32768,
  "gemini-4-hydrogen": 65536,
};

const GEMINI_4_UNSUPPORTED_EFFORTS = Object.entries(
  GEMINI_4_SUPPORTED_THINKING_LEVELS,
).flatMap(([model, levels]) =>
  (["auto", "none", "minimal", "xhigh", "max"] as ReasoningEffort[])
    .filter((effort) => !(levels as ReasoningEffort[]).includes(effort))
    .map((effort) => [model, effort] as const),
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

  test("registers gemini-4-carbon right after gemini-4-argon", () => {
    const googleModels = DEFAULT_MODELS.filter(
      (m) => m.provider.providerType === "google",
    );
    expect(googleModels[1]).toEqual(
      expect.objectContaining({
        name: "gemini-4-carbon",
        available: true,
        provider: expect.objectContaining({ providerName: "Google" }),
      }),
    );
  });

  test("registers gemini-4-hydrogen right after gemini-4-carbon", () => {
    const googleModels = DEFAULT_MODELS.filter(
      (m) => m.provider.providerType === "google",
    );
    expect(googleModels[2]).toEqual(
      expect.objectContaining({
        name: "gemini-4-hydrogen",
        available: true,
        provider: expect.objectContaining({ providerName: "Google" }),
      }),
    );
  });

  test.each(GEMINI_4_MODELS)(
    "leaves the %s knowledge cutoff to the default",
    (model) => {
      expect(KnowledgeCutOffDate[model]).toBeUndefined();
    },
  );

  test.each(GEMINI_4_MODELS)("treats %s as a vision-capable model", (model) => {
    expect(isVisionModel(model)).toBe(true);
  });
});

describe("Gemini thinking level", () => {
  test.each(Object.entries(GEMINI_4_SUPPORTED_THINKING_LEVELS))(
    "passes supported levels through for %s",
    (model, levels) => {
      expect(getGeminiThinkingLevels(model)).toEqual(levels);
      for (const level of levels) {
        expect(resolveGeminiThinkingLevel(model, level)).toBe(level);
      }
    },
  );

  test.each(GEMINI_4_UNSUPPORTED_EFFORTS)(
    "leaves %s to the API default when effort is %s",
    (model, effort) => {
      expect(resolveGeminiThinkingLevel(model, effort)).toBeUndefined();
    },
  );

  test.each(GEMINI_4_MODELS)(
    "leaves %s to the API default when effort is unset",
    (model) => {
      expect(resolveGeminiThinkingLevel(model)).toBeUndefined();
    },
  );

  test("supports xhigh only on gemini-4-hydrogen", () => {
    expect(getGeminiThinkingLevels("gemini-4-hydrogen")).toContain("xhigh");
    for (const model of [
      ...GEMINI_3_THINKING_LEVEL_MODELS,
      "gemini-4-argon",
      "gemini-4-carbon",
    ]) {
      expect(getGeminiThinkingLevels(model)).not.toContain("xhigh");
    }
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
  test.each(GEMINI_4_MODELS)("clamps %s to 65536 output tokens", (model) => {
    expect(resolveGeminiMaxOutputTokens(model, 128000)).toBe(65536);
    expect(resolveGeminiMaxOutputTokens(model, 65536)).toBe(65536);
    expect(resolveGeminiMaxOutputTokens(model, 32768)).toBe(32768);
  });

  test("does not clamp other Gemini models", () => {
    expect(resolveGeminiMaxOutputTokens("gemini-3.5-pro", 128000)).toBe(128000);
  });

  test.each(Object.entries(GEMINI_4_DEFAULT_MAX_OUTPUT_TOKENS))(
    "uses the %s default (%i) when max_tokens is the global default",
    (model, defaultMaxOutputTokens) => {
      expect(
        resolveGeminiMaxOutputTokens(model, GLOBAL_DEFAULT_MAX_TOKENS),
      ).toBe(defaultMaxOutputTokens);
    },
  );

  test.each(GEMINI_4_MODELS)("respects user-set max_tokens for %s", (model) => {
    expect(resolveGeminiMaxOutputTokens(model, 1024)).toBe(1024);
    expect(resolveGeminiMaxOutputTokens(model, 8192)).toBe(8192);
    expect(
      resolveGeminiMaxOutputTokens(model, GLOBAL_DEFAULT_MAX_TOKENS + 1),
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
  test.each(GEMINI_4_MODELS)(
    "shapes %s tools and media resolution like gemini-3.5-pro",
    async (model) => {
      const gemini4 = await captureGeminiPayload(model);
      const reference = await captureGeminiPayload("gemini-3.5-pro");

      expect(gemini4.tools).toEqual(reference.tools);
      expect(gemini4.generationConfig.media_resolution).toBe(
        reference.generationConfig.media_resolution,
      );
      expect(gemini4.generationConfig.media_resolution).toBe(
        "MEDIA_RESOLUTION_HIGH",
      );
    },
  );

  test.each(["gemini-4-carbon", "gemini-4-hydrogen"])(
    "builds the same %s payload as gemini-4-argon for explicit settings",
    async (model) => {
      const config = { reasoningEffort: "medium", max_tokens: 128000 } as const;
      const argon = await captureGeminiPayload("gemini-4-argon", config);
      const other = await captureGeminiPayload(model, config);

      expect(other).toEqual(argon);
    },
  );

  test.each(
    Object.entries(GEMINI_4_SUPPORTED_THINKING_LEVELS).flatMap(
      ([model, levels]) => levels.map((effort) => [model, effort] as const),
    ),
  )("sends thinking_level for %s when effort is %s", async (model, effort) => {
    const { generationConfig } = await captureGeminiPayload(model, {
      reasoningEffort: effort,
    });

    expect(generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinking_level: effort,
    });
  });

  test.each(
    GEMINI_4_UNSUPPORTED_EFFORTS.filter(([, effort]) =>
      ["auto", "xhigh", "none"].includes(effort),
    ),
  )("omits thinking_level for %s when effort is %s", async (model, effort) => {
    const { generationConfig } = await captureGeminiPayload(model, {
      reasoningEffort: effort,
    });

    expect(generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
    });
  });

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

  test.each(GEMINI_4_MODELS)(
    "clamps maxOutputTokens for %s but not gemini-3.5-pro",
    async (model) => {
      const gemini4 = await captureGeminiPayload(model, {
        max_tokens: 128000,
      });
      const reference = await captureGeminiPayload("gemini-3.5-pro", {
        max_tokens: 128000,
      });

      expect(gemini4.generationConfig.maxOutputTokens).toBe(65536);
      expect(reference.generationConfig.maxOutputTokens).toBe(128000);
    },
  );

  test.each(Object.entries(GEMINI_4_DEFAULT_MAX_OUTPUT_TOKENS))(
    "defaults maxOutputTokens for %s to %i but not gemini-3.5-pro",
    async (model, defaultMaxOutputTokens) => {
      const gemini4 = await captureGeminiPayload(model, {
        max_tokens: GLOBAL_DEFAULT_MAX_TOKENS,
      });
      const reference = await captureGeminiPayload("gemini-3.5-pro", {
        max_tokens: GLOBAL_DEFAULT_MAX_TOKENS,
      });

      expect(gemini4.generationConfig.maxOutputTokens).toBe(
        defaultMaxOutputTokens,
      );
      expect(reference.generationConfig.maxOutputTokens).toBe(
        GLOBAL_DEFAULT_MAX_TOKENS,
      );
    },
  );

  test.each(GEMINI_4_MODELS)(
    "sends user-set maxOutputTokens for %s",
    async (model) => {
      const { generationConfig } = await captureGeminiPayload(model, {
        max_tokens: 16384,
      });

      expect(generationConfig.maxOutputTokens).toBe(16384);
    },
  );

  test.each(GEMINI_4_MODELS)("omits sampling params for %s", async (model) => {
    const { generationConfig } = await captureGeminiPayload(model, {
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

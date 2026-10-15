import { buildSystemPrompt } from "../system-prompt";
import { DEFAULT_CONFIG, useAppConfig } from "../../store/config";

const morning = new Date(2026, 9, 15, 8, 5, 30);
const evening = new Date(2026, 9, 15, 23, 59, 59);
const nextDay = new Date(2026, 9, 16, 0, 0, 1);

const gpt = { model: "gpt-5.5", providerName: "OpenAI" } as const;
const grok = { model: "grok-4.3", providerName: "XAI" } as const;

describe("buildSystemPrompt", () => {
  test("none mode omits the time line and is stable across requests", () => {
    const config = { ...gpt, systemPromptTimeMode: "none" as const };
    const a = buildSystemPrompt(config, morning);
    const b = buildSystemPrompt(config, nextDay);

    expect(a).toBe(b);
    expect(a).not.toContain("Current time");
    expect(a).not.toContain("{{");
  });

  test("defaults to none when the time mode is missing (old sessions)", () => {
    expect(buildSystemPrompt(gpt, morning)).toBe(
      buildSystemPrompt({ ...gpt, systemPromptTimeMode: "none" }, evening),
    );
  });

  test("date mode is stable within a day and contains the local date", () => {
    const config = { ...gpt, systemPromptTimeMode: "date" as const };
    const a = buildSystemPrompt(config, morning);

    expect(a).toBe(buildSystemPrompt(config, evening));
    expect(a).toContain("Current time: 2026-10-15\n");
    expect(buildSystemPrompt(config, nextDay)).toContain("2026-10-16");
  });

  test("full mode contains the full time", () => {
    const prompt = buildSystemPrompt(
      { ...gpt, systemPromptTimeMode: "full" },
      morning,
    );
    expect(prompt).toContain(`Current time: ${morning.toString()}`);
  });

  test("names the model and its provider instead of ChatGPT", () => {
    const prompt = buildSystemPrompt(grok, morning);
    expect(prompt).not.toContain("ChatGPT");
    expect(prompt).toContain(
      "You are grok-4.3, a large language model trained by XAI.",
    );
    expect(buildSystemPrompt(gpt, morning)).toContain(
      "You are gpt-5.5, a large language model trained by OpenAI.",
    );
  });

  test("falls back to the configured provider for unknown models", () => {
    const prompt = buildSystemPrompt(
      { model: "grok-custom", providerName: "XAI" },
      morning,
    );
    expect(prompt).toContain("trained by XAI.");
  });
});

describe("config migration to 4.4", () => {
  test("defaults the cache-related fields for a v4.3 persisted state", () => {
    const { systemPromptTimeMode, promptCacheKey, ...legacyModelConfig } =
      DEFAULT_CONFIG.modelConfig;
    const migrated = useAppConfig.persist.getOptions().migrate!(
      { models: [], modelConfig: { ...legacyModelConfig } },
      4.3,
    ) as typeof DEFAULT_CONFIG;

    expect(migrated.modelConfig.systemPromptTimeMode).toBe("none");
    expect(migrated.modelConfig.promptCacheKey).toBe("session");
  });

  test("keeps values the user already set", () => {
    const migrated = useAppConfig.persist.getOptions().migrate!(
      {
        models: [],
        modelConfig: {
          ...DEFAULT_CONFIG.modelConfig,
          systemPromptTimeMode: "full",
          promptCacheKey: "off",
        },
      },
      4.3,
    ) as typeof DEFAULT_CONFIG;

    expect(migrated.modelConfig.systemPromptTimeMode).toBe("full");
    expect(migrated.modelConfig.promptCacheKey).toBe("off");
  });

  test("ships cache-friendly defaults", () => {
    expect(DEFAULT_CONFIG.modelConfig.systemPromptTimeMode).toBe("none");
    expect(DEFAULT_CONFIG.modelConfig.promptCacheKey).toBe("session");
  });
});

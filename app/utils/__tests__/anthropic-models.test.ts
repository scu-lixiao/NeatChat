import {
  DEFAULT_MODELS,
  ServiceProvider,
  VISION_MODEL_REGEXES,
} from "../../constant";
import {
  buildAnthropicSamplingConfig,
  buildAnthropicThinkingConfig,
  resolveAnthropicMaxTokens,
} from "../../client/platforms/anthropic";

describe("Anthropic current model registry", () => {
  test.each(["claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5"])(
    "registers %s as a built-in Anthropic model",
    (modelName) => {
      const model = DEFAULT_MODELS.find((item) => item.name === modelName);

      expect(model).toBeDefined();
      expect(model?.available).toBe(true);
      expect(model?.provider.providerName).toBe(ServiceProvider.Anthropic);
      expect(model?.provider.providerType).toBe("anthropic");
    },
  );

  test.each(["claude-opus-5-5", "claude-sonnet-5"])(
    "recognizes %s as vision-capable",
    (modelName) => {
      expect(VISION_MODEL_REGEXES.some((regex) => regex.test(modelName))).toBe(
        true,
      );
    },
  );
});

describe("Anthropic current model request configuration", () => {
  test("uses always-on adaptive thinking with the Opus 5.5 default effort", () => {
    expect(
      buildAnthropicThinkingConfig("claude-opus-5-5", 4000, "none"),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "medium" },
    });
    expect(buildAnthropicSamplingConfig("claude-opus-5-5", 0.5)).toEqual({});
    expect(resolveAnthropicMaxTokens("claude-opus-5-5", 256000)).toBe(128000);
  });

  test("uses adaptive thinking for Sonnet 5 and limits Haiku 4.5 output", () => {
    expect(
      buildAnthropicThinkingConfig("claude-sonnet-5", 4000, "high"),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
    });
    expect(buildAnthropicSamplingConfig("claude-sonnet-5", 0.5)).toEqual({});
    expect(resolveAnthropicMaxTokens("claude-haiku-4-5", 128000)).toBe(64000);
  });
});

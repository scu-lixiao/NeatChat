import {
  DEFAULT_MODELS,
  ServiceProvider,
  VISION_MODEL_REGEXES,
} from "../app/constant";
import {
  buildAnthropicSamplingConfig,
  buildAnthropicThinkingConfig,
  createAnthropicResponseContentAccumulator,
  resolveAnthropicMaxTokens,
} from "../app/client/platforms/anthropic";

describe("Anthropic model registry", () => {
  test.each(["claude-opus-4-8", "claude-fable-5", "claude-fable-5-1"])(
    "should register %s as a built-in Anthropic model",
    (modelName) => {
      const model = DEFAULT_MODELS.find((item) => item.name === modelName);

      expect(model).toBeDefined();
      expect(model?.available).toBe(true);
      expect(model?.provider.providerName).toBe(ServiceProvider.Anthropic);
      expect(model?.provider.providerType).toBe("anthropic");
    },
  );

  test("should recognize Claude Fable 5.1 as a vision model", () => {
    expect(
      VISION_MODEL_REGEXES.some((regex) => regex.test("claude-fable-5-1")),
    ).toBe(true);
  });
});

describe("Claude Fable 5.1 request configuration", () => {
  test("uses adaptive thinking and all supported high-effort levels", () => {
    expect(
      buildAnthropicThinkingConfig("claude-fable-5-1", 4000, "xhigh"),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "xhigh" },
    });
    expect(
      buildAnthropicThinkingConfig("claude-fable-5-1", 4000, "max"),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "max" },
    });
  });

  test("keeps always-on thinking enabled and omits incompatible sampling", () => {
    expect(
      buildAnthropicThinkingConfig("claude-fable-5-1", 4000, "none"),
    ).toEqual({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
    });
    expect(buildAnthropicSamplingConfig("claude-fable-5-1", 0.5)).toEqual({});
  });

  test("caps output tokens at the model limit", () => {
    expect(resolveAnthropicMaxTokens("claude-fable-5-1", 256000)).toBe(128000);
    expect(resolveAnthropicMaxTokens("claude-fable-5-1", 4000)).toBe(4000);
  });

  test("preserves signed thinking blocks in tool-call continuations", () => {
    const responseContent = createAnthropicResponseContentAccumulator();

    responseContent.start(0, {
      type: "thinking",
      thinking: "",
      signature: "",
    });
    responseContent.appendDelta(0, {
      type: "thinking_delta",
      thinking: "I need the current weather.",
    });
    responseContent.appendDelta(0, {
      type: "signature_delta",
      signature: "signed-thinking-block",
    });
    responseContent.start(1, {
      type: "tool_use",
      id: "toolu_123",
      name: "get_weather",
      input: {},
    });
    responseContent.appendDelta(1, {
      type: "input_json_delta",
      partial_json: '{"city":"Paris"}',
    });
    responseContent.stop(1);

    expect(responseContent.take()).toEqual([
      {
        type: "thinking",
        thinking: "I need the current weather.",
        signature: "signed-thinking-block",
      },
      {
        type: "tool_use",
        id: "toolu_123",
        name: "get_weather",
        input: { city: "Paris" },
      },
    ]);
  });
});

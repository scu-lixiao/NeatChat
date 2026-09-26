import {
  KnowledgeCutOffDate,
  OPENAI_IMAGE_MODELS,
  OPENAI_REASONING_MODELS,
  REQUEST_TIMEOUT_MS_FOR_THINKING,
} from "../../constant";
import {
  getTimeoutMSByModel,
  isGPT5ImageGenModel,
  isOpenAIImagesApiModel,
  isVisionModel,
} from "../../utils";

describe("OpenAI GPT-5.6 models", () => {
  const gpt56Models = [
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ];

  test("registers the current GPT-5.6 model series", () => {
    expect(OPENAI_REASONING_MODELS).toEqual(
      expect.arrayContaining(gpt56Models),
    );
  });

  test("uses the February 2026 knowledge cutoff", () => {
    for (const model of gpt56Models) {
      expect(KnowledgeCutOffDate[model]).toBe("2026-02");
    }
  });
});

describe("OpenAI GPT-6 flagship models", () => {
  const gpt6Models = ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"];

  test("registers the current GPT-6 model family", () => {
    expect(OPENAI_REASONING_MODELS).toEqual(expect.arrayContaining(gpt6Models));
  });

  test("uses the documented knowledge cutoffs", () => {
    expect(KnowledgeCutOffDate["gpt-6-astra"]).toBe("2026-04");
    expect(KnowledgeCutOffDate["gpt-6-sol"]).toBe("2026-04");
    expect(KnowledgeCutOffDate["gpt-6-luna"]).toBe("2026-05");
  });

  test("supports vision and native image generation", () => {
    for (const model of gpt6Models) {
      expect(isVisionModel(model)).toBe(true);
      expect(isGPT5ImageGenModel(model)).toBe(true);
    }
  });

  test("uses the extended thinking timeout", () => {
    for (const model of gpt6Models) {
      expect(getTimeoutMSByModel(model)).toBe(REQUEST_TIMEOUT_MS_FOR_THINKING);
    }
  });
});

describe("OpenAI GPT Image 2.5", () => {
  const models = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"];

  test("registers all Images API models with image capabilities", () => {
    for (const model of models) {
      expect(OPENAI_IMAGE_MODELS).toContain(model);
      expect(isOpenAIImagesApiModel(model)).toBe(true);
      expect(isVisionModel(model)).toBe(true);
    }
  });
});

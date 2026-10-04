import {
  DEFAULT_MODELS,
  KnowledgeCutOffDate,
  XAI_IMAGE_MODELS,
} from "../../constant";
import { isVisionModel, isXAIImageModel } from "../../utils";
import { resolveXAIReasoningEffort } from "../../client/platforms/xai";

describe("xAI model registry", () => {
  test("registers Grok 4.5 with its current knowledge cutoff", () => {
    expect(DEFAULT_MODELS).toContainEqual(
      expect.objectContaining({
        name: "grok-4.5",
        provider: expect.objectContaining({ providerType: "xai" }),
      }),
    );
    expect(KnowledgeCutOffDate["grok-4.5"]).toBe("2026-01");
  });

  test.each(["grok-4.6", "grok-4.7"])(
    "registers %s as a built-in xAI model",
    (modelName) => {
      expect(DEFAULT_MODELS).toContainEqual(
        expect.objectContaining({
          name: modelName,
          provider: expect.objectContaining({ providerType: "xai" }),
        }),
      );
    },
  );

  test("registers Grok 4.7 and Imagine Image 2.0 capabilities", () => {
    expect(KnowledgeCutOffDate["grok-4.7"]).toBe("2026-05");
    expect(XAI_IMAGE_MODELS).toContain("grok-imagine-image-2.0");
    expect(isXAIImageModel("grok-imagine-image-2.0")).toBe(true);
    expect(isVisionModel("grok-imagine-image-2.0")).toBe(true);
  });

  test("registers Grok 4.6 with its knowledge cutoff", () => {
    expect(KnowledgeCutOffDate["grok-4.6"]).toBe("2026-01");
  });

  test.each(["grok-4.6", "grok-4.7"])(
    "treats %s as a vision-capable model",
    (modelName) => {
      expect(isVisionModel(modelName)).toBe(true);
    },
  );
});

describe("xAI reasoning effort resolution", () => {
  test.each(["grok-4.6", "grok-4.7"])(
    "passes through low/medium/high/xhigh for %s",
    (modelName) => {
      for (const effort of ["low", "medium", "high", "xhigh"] as const) {
        expect(resolveXAIReasoningEffort(modelName, effort)).toBe(effort);
      }
    },
  );

  test.each(["grok-4.6", "grok-4.7"])(
    "falls back to the API default for unsupported efforts on %s",
    (modelName) => {
      for (const effort of ["auto", "none", "minimal", "max"] as const) {
        expect(resolveXAIReasoningEffort(modelName, effort)).toBeUndefined();
      }
      expect(resolveXAIReasoningEffort(modelName)).toBeUndefined();
    },
  );

  test("keeps Grok 4.5 limited to low/medium/high", () => {
    expect(resolveXAIReasoningEffort("grok-4.5", "low")).toBe("low");
    expect(resolveXAIReasoningEffort("grok-4.5", "medium")).toBe("medium");
    expect(resolveXAIReasoningEffort("grok-4.5", "high")).toBe("high");
    expect(resolveXAIReasoningEffort("grok-4.5", "xhigh")).toBeUndefined();
  });

  test("does not send reasoning effort for non-configurable models", () => {
    expect(resolveXAIReasoningEffort("grok-4.3", "high")).toBeUndefined();
    expect(resolveXAIReasoningEffort("grok-4-0709", "xhigh")).toBeUndefined();
  });
});

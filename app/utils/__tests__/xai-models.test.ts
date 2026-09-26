import {
  DEFAULT_MODELS,
  KnowledgeCutOffDate,
  XAI_IMAGE_MODELS,
} from "../../constant";
import { isVisionModel, isXAIImageModel } from "../../utils";

describe("xAI model registry", () => {
  test("registers Grok 4.5 with its current knowledge cutoff", () => {
    expect(DEFAULT_MODELS).toContainEqual(
      expect.objectContaining({
        name: "grok-4.5",
        provider: expect.objectContaining({ providerType: "xai" }),
      }),
    );
    expect(KnowledgeCutOffDate["grok-4.5"]).toBe("2026-02");
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
});

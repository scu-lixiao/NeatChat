import { DEFAULT_MODELS, KnowledgeCutOffDate } from "../../constant";

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
});

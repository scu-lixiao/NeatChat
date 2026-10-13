import { jest } from "@jest/globals";
import { DEFAULT_MODELS, KnowledgeCutOffDate } from "../../constant";
import { isVisionModel } from "../../utils";
import { GeminiProApi } from "../../client/platforms/google";

async function captureGeminiPayload(model: string) {
  const fetchMock = global.fetch as jest.Mock;
  fetchMock.mockClear();

  await new GeminiProApi().chat({
    messages: [{ role: "user", content: "hello" }],
    config: { model, stream: false },
    onFinish: () => {},
    onError: () => {},
  } as any);

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

describe("Gemini request payload", () => {
  test("shapes gemini-4-argon generationConfig and tools like gemini-3.5-pro", async () => {
    const argon = await captureGeminiPayload("gemini-4-argon");
    const reference = await captureGeminiPayload("gemini-3.5-pro");

    expect(argon.generationConfig).toEqual(reference.generationConfig);
    expect(argon.tools).toEqual(reference.tools);
  });

  test("omits sampling params and uses high thinking level for gemini-4-argon", async () => {
    const { generationConfig } = await captureGeminiPayload("gemini-4-argon");

    expect(generationConfig).not.toHaveProperty("temperature");
    expect(generationConfig).not.toHaveProperty("topP");
    expect(generationConfig.thinkingConfig).toEqual({
      includeThoughts: true,
      thinking_level: "high",
    });
    expect(generationConfig.media_resolution).toBe("MEDIA_RESOLUTION_HIGH");
  });

  test("keeps sampling params for gemini-2.5-pro", async () => {
    const { generationConfig } = await captureGeminiPayload("gemini-2.5-pro");

    expect(generationConfig).toHaveProperty("temperature");
    expect(generationConfig).toHaveProperty("topP");
  });
});

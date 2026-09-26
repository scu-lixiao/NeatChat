import {
  DEFAULT_MODELS,
  ServiceProvider,
  VISION_MODEL_REGEXES,
} from "../../constant";

describe("DeepSeek current model registry", () => {
  test.each(["deepseek-flash", "deepseek-v4-pro"])(
    "registers %s as a built-in DeepSeek model",
    (modelName) => {
      const model = DEFAULT_MODELS.find((item) => item.name === modelName);

      expect(model).toBeDefined();
      expect(model?.available).toBe(true);
      expect(model?.provider.providerName).toBe(ServiceProvider.DeepSeek);
      expect(model?.provider.providerType).toBe("deepseek");
    },
  );

  test("recognizes Flash, but not V4 Pro, as vision-capable", () => {
    expect(
      VISION_MODEL_REGEXES.some((regex) => regex.test("deepseek-flash")),
    ).toBe(true);
    expect(
      VISION_MODEL_REGEXES.some((regex) => regex.test("deepseek-v4-pro")),
    ).toBe(false);
  });
});

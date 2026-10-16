import { DEFAULT_CONFIG, useAppConfig } from "../../store/config";

describe("config migration", () => {
  const migrate = useAppConfig.persist.getOptions().migrate!;

  test("removes the retired WebGPU setting and keeps everything else", () => {
    const kept = {
      ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      theme: "dark",
      fontSize: 16,
      enableAutoGenerateTitle: false,
      modelConfig: {
        ...DEFAULT_CONFIG.modelConfig,
        model: "gpt-4o-mini",
        temperature: 0.3,
      },
    };
    const persisted = {
      ...JSON.parse(JSON.stringify(kept)),
      webgpuAcceleration: "force-webgpu",
    };

    const migrated = migrate(persisted, 4.6);

    expect(migrated).not.toHaveProperty("webgpuAcceleration");
    expect(migrated).toEqual(kept);
  });

  test("is at the version that drops the setting", () => {
    expect(useAppConfig.persist.getOptions().version).toBe(4.7);
  });
});

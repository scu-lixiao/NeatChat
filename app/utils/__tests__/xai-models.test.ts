import {
  DEFAULT_MODELS,
  KnowledgeCutOffDate,
  RETIRED_XAI_MODELS,
  XAI_IMAGE_MODELS,
} from "../../constant";
import { isVisionModel, isXAIImageModel } from "../../utils";
import { resolveXAIReasoningEffort } from "../../client/platforms/xai";
import { useAppConfig } from "../../store/config";
import { useChatStore } from "../../store/chat";
import { useMaskStore } from "../../store/mask";
import { replaceRetiredXAIModels } from "../model";

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

describe("retired xAI models", () => {
  const xaiProvider = {
    id: "xai",
    providerName: "XAI",
    providerType: "xai",
    sorted: 11,
  };

  test("are not registered as built-in models", () => {
    const xaiModelNames = DEFAULT_MODELS.filter(
      (m) => m.provider.id === "xai",
    ).map((m) => m.name);

    for (const name of RETIRED_XAI_MODELS) {
      expect(xaiModelNames).not.toContain(name);
    }
    expect(xaiModelNames).toEqual(
      expect.arrayContaining(["grok-4.3", "grok-4.20-multi-agent-0309"]),
    );
  });

  test("are pruned from persisted model lists on migration", () => {
    const persisted = {
      models: [
        { name: "grok-3-latest", available: true, provider: xaiProvider },
        { name: "grok-4-0709", available: true, provider: xaiProvider },
        { name: "grok-4.7", available: true, provider: xaiProvider },
        {
          name: "grok-3-latest",
          available: true,
          provider: { id: "openai", providerName: "OpenAI" },
        },
      ],
    };

    const migrated = useAppConfig.persist.getOptions().migrate!(
      persisted,
      4.1,
    ) as typeof persisted;

    expect(migrated.models.map((m) => `${m.name}@${m.provider.id}`)).toEqual([
      "grok-4.7@xai",
      "grok-3-latest@openai",
    ]);
  });
});

describe("retired xAI model selections", () => {
  const retiredSelection = () => ({
    model: "grok-3-latest",
    providerName: "XAI",
    compressModel: "grok-4-1-fast-non-reasoning",
    compressProviderName: "XAI",
  });

  test("switch to grok-4.3 for the chat and compression model", () => {
    const modelConfig = retiredSelection();
    replaceRetiredXAIModels(modelConfig);
    expect(modelConfig).toEqual({
      model: "grok-4.3",
      providerName: "XAI",
      compressModel: "grok-4.3",
      compressProviderName: "XAI",
    });
  });

  test("leave current models and other providers untouched", () => {
    const current = { model: "grok-4.7", providerName: "XAI" };
    const otherProvider = { model: "grok-3-latest", providerName: "OpenAI" };
    replaceRetiredXAIModels(current);
    replaceRetiredXAIModels(otherProvider);
    replaceRetiredXAIModels(undefined);
    expect(current.model).toBe("grok-4.7");
    expect(otherProvider.model).toBe("grok-3-latest");
  });

  test("are migrated in the global config", () => {
    const migrated = useAppConfig.persist.getOptions().migrate!(
      { models: [], modelConfig: retiredSelection() },
      4.2,
    ) as { modelConfig: ReturnType<typeof retiredSelection> };
    expect(migrated.modelConfig.model).toBe("grok-4.3");
    expect(migrated.modelConfig.compressModel).toBe("grok-4.3");
  });

  test("are migrated in every chat session", () => {
    const migrated = useChatStore.persist.getOptions().migrate!(
      {
        sessions: [
          { mask: { modelConfig: retiredSelection() }, messages: [] },
          {
            mask: { modelConfig: { model: "grok-4.5", providerName: "XAI" } },
            messages: [],
          },
        ],
      },
      3.3,
    ) as { sessions: { mask: { modelConfig: { model: string } } }[] };
    expect(migrated.sessions.map((s) => s.mask.modelConfig.model)).toEqual([
      "grok-4.3",
      "grok-4.5",
    ]);
  });

  test("are migrated in user masks", () => {
    const migrated = useMaskStore.persist.getOptions().migrate!(
      { masks: { a: { id: "a", modelConfig: retiredSelection() } } },
      3.1,
    ) as { masks: Record<string, { modelConfig: { model: string } }> };
    expect(migrated.masks.a.modelConfig.model).toBe("grok-4.3");
  });
});

import { LLMModel } from "../client/api";
import { DalleQuality, DalleStyle, ModelSize } from "../typing";
import { getClientConfig } from "../config/client";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_TTS_ENGINE,
  DEFAULT_TTS_ENGINES,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_MODELS,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_VOICES,
  StoreKey,
  ServiceProvider,
} from "../constant";
import { createPersistStore } from "../utils/store";
import type { Voice } from "rt-client";
import { nanoid } from "nanoid";

export type ModelType = (typeof DEFAULT_MODELS)[number]["name"];
export type TTSModelType = (typeof DEFAULT_TTS_MODELS)[number];
export type TTSVoiceType = (typeof DEFAULT_TTS_VOICES)[number];
export type TTSEngineType = (typeof DEFAULT_TTS_ENGINES)[number];

// {{CHENGQI:
// Action: Added - 自定义模型管理的类型定义
// Timestamp: 2025-06-18 16:30:00 +08:00
// Reason: 为自定义模型管理功能添加类型安全的数据结构
// Principle_Applied: SOLID - 单一职责，类型安全
// Optimization: 结构化的自定义模型存储，替代字符串格式
// Architectural_Note (AR): 扩展配置系统以支持用户友好的模型管理
// Documentation_Note (DW): 自定义模型数据结构，支持按提供商分组管理
// }}
export interface CustomModel {
  id: string;
  name: string;
  displayName?: string;
  provider: ServiceProvider;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CustomModelsByProvider = {
  [key in ServiceProvider]?: CustomModel[];
};

// {{CHENGQI:
// Action: Added - 隐藏模型的类型定义
// Timestamp: 2025-06-18 18:40:00 +08:00
// Reason: 支持隐藏默认模型的功能
// Principle_Applied: SOLID - 单一职责，类型安全
// Optimization: 结构化的隐藏模型存储
// Architectural_Note (AR): 扩展配置系统以支持模型隐藏
// Documentation_Note (DW): 隐藏模型的数据结构定义
// }}
export type HiddenModelsByProvider = {
  [key in ServiceProvider]?: string[]; // 存储隐藏的模型名称
};

export enum SubmitKey {
  Enter = "Enter",
  CtrlEnter = "Ctrl + Enter",
  ShiftEnter = "Shift + Enter",
  AltEnter = "Alt + Enter",
  MetaEnter = "Meta + Enter",
}

export enum Theme {
  Auto = "auto",
  Dark = "dark",
  Light = "light",
}

const config = getClientConfig();

export const DEFAULT_CONFIG = {
  lastUpdate: Date.now(), // timestamp, to merge state

  submitKey: SubmitKey.Enter,
  avatar: "1f603",
  fontSize: 14,
  fontFamily: "",
  theme: Theme.Auto as Theme,
  tightBorder: !!config?.isApp,
  sendPreviewBubble: true,
  enableAutoGenerateTitle: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,

  enableArtifacts: true, // show artifacts config

  enableCodeFold: true, // code fold config

  disablePromptHint: false,

  dontShowMaskSplashScreen: false, // dont show splash screen when create chat
  hideBuiltinMasks: false, // dont add builtin masks

  customModels: "",
  models: DEFAULT_MODELS as any as LLMModel[],

  modelConfig: {
    model: "gpt-4o-mini" as ModelType,
    providerName: "OpenAI" as ServiceProvider,
    temperature: 0.5,
    top_p: 1,
    max_tokens: 4000,
    presence_penalty: 0,
    frequency_penalty: 0,
    sendMemory: true,
    historyMessageCount: 4,
    compressMessageLengthThreshold: 1000,
    compressModel: "",
    compressProviderName: "",
    enableInjectSystemPrompts: true,
    template: config?.template ?? DEFAULT_INPUT_TEMPLATE,
    size: "1024x1024" as ModelSize,
    quality: "standard" as DalleQuality,
    style: "vivid" as DalleStyle,
  },

  ttsConfig: {
    enable: false,
    autoplay: false,
    engine: DEFAULT_TTS_ENGINE,
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
    speed: 1.0,
  },

  realtimeConfig: {
    enable: false,
    provider: "OpenAI" as ServiceProvider,
    model: "gpt-4o-realtime-preview-2024-10-01",
    apiKey: "",
    azure: {
      endpoint: "",
      deployment: "",
    },
    temperature: 0.9,
    voice: "alloy" as Voice,
  },

  // {{CHENGQI:
  // Action: Added - 结构化自定义模型存储
  // Timestamp: 2025-06-18 16:30:00 +08:00
  // Reason: 添加用户友好的自定义模型管理配置
  // Principle_Applied: SOLID - 单一职责，数据结构清晰
  // Optimization: 按提供商分组的结构化存储
  // Architectural_Note (AR): 扩展默认配置以支持自定义模型管理
  // Documentation_Note (DW): 自定义模型按服务提供商分组存储
  // }}
  customModelsByProvider: {} as CustomModelsByProvider,

  // {{CHENGQI:
  // Action: Added - 隐藏模型的默认配置
  // Timestamp: 2025-06-18 18:40:00 +08:00
  // Reason: 添加隐藏模型的配置存储
  // Principle_Applied: SOLID - 单一职责，配置管理
  // Optimization: 按提供商分组的隐藏模型存储
  // Architectural_Note (AR): 扩展默认配置以支持模型隐藏
  // Documentation_Note (DW): 隐藏模型按服务提供商分组存储
  // }}
  hiddenModelsByProvider: {} as HiddenModelsByProvider,

  // WebGPU加速配置 (Task 6 - M4 iPad Pro优化)
  webgpuAcceleration: "auto" as "auto" | "force-webgpu" | "force-css" | "off",
};

export type ChatConfig = typeof DEFAULT_CONFIG;

export type ModelConfig = ChatConfig["modelConfig"];
export type TTSConfig = ChatConfig["ttsConfig"];
export type RealtimeConfig = ChatConfig["realtimeConfig"];

export function limitNumber(
  x: number,
  min: number,
  max: number,
  defaultValue: number,
) {
  if (isNaN(x)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, x));
}

export const TTSConfigValidator = {
  engine(x: string) {
    return x as TTSEngineType;
  },
  model(x: string) {
    return x as TTSModelType;
  },
  voice(x: string) {
    return x as TTSVoiceType;
  },
  speed(x: number) {
    return limitNumber(x, 0.25, 4.0, 1.0);
  },
};

export const ModalConfigValidator = {
  model(x: string) {
    return x as ModelType;
  },
  max_tokens(x: number) {
    return limitNumber(x, 0, 512000, 1024);
  },
  presence_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  frequency_penalty(x: number) {
    return limitNumber(x, -2, 2, 0);
  },
  temperature(x: number) {
    return limitNumber(x, 0, 2, 1);
  },
  top_p(x: number) {
    return limitNumber(x, 0, 1, 1);
  },
};

export const useAppConfig = createPersistStore(
  { ...DEFAULT_CONFIG },
  (set, get) => ({
    reset() {
      set(() => ({ ...DEFAULT_CONFIG }));
    },

    // {{CHENGQI:
    // Action: Added - 初始化自定义模型数据
    // Timestamp: 2025-06-18 17:20:00 +08:00
    // Reason: 在应用启动时从字符串格式导入现有数据
    // Principle_Applied: SOLID - 单一职责，数据迁移
    // Optimization: 自动数据迁移，向后兼容
    // Architectural_Note (AR): 数据格式迁移的最佳实践
    // Documentation_Note (DW): 自动从旧格式迁移到新格式
    // }}
    initialize() {
      const state = get();
      // 如果结构化数据为空但字符串数据存在，则进行迁移
      if (
        Object.keys(state.customModelsByProvider).length === 0 &&
        state.customModels
      ) {
        // 直接调用方法而不是通过 store 变量
        useAppConfig.getState().importFromCustomModelsString();
      }
    },

    mergeModels(newModels: LLMModel[]) {
      if (!newModels || newModels.length === 0) {
        return;
      }

      const oldModels = get().models;
      const modelMap: Record<string, LLMModel> = {};

      for (const model of oldModels) {
        model.available = false;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      for (const model of newModels) {
        model.available = true;
        modelMap[`${model.name}@${model?.provider?.id}`] = model;
      }

      set(() => ({
        models: Object.values(modelMap),
      }));
    },

    allModels() {},

    // {{CHENGQI:
    // Action: Added - 自定义模型管理方法
    // Timestamp: 2025-06-18 16:35:00 +08:00
    // Reason: 为自定义模型管理提供 CRUD 操作方法
    // Principle_Applied: SOLID - 单一职责，封装数据操作
    // Optimization: 类型安全的模型管理操作
    // Architectural_Note (AR): 扩展 store 以支持自定义模型管理
    // Documentation_Note (DW): 提供完整的自定义模型 CRUD 操作接口
    // }}

    // 获取指定提供商的自定义模型列表
    getCustomModelsByProvider(provider: ServiceProvider): CustomModel[] {
      const state = get();
      return state.customModelsByProvider[provider] || [];
    },

    // 添加自定义模型
    addCustomModel(
      provider: ServiceProvider,
      modelData: Omit<CustomModel, "id" | "createdAt" | "updatedAt">,
    ) {
      const now = Date.now();
      const newModel: CustomModel = {
        ...modelData,
        id: nanoid(),
        provider,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const providerModels = state.customModelsByProvider[provider] || [];
        return {
          customModelsByProvider: {
            ...state.customModelsByProvider,
            [provider]: [...providerModels, newModel],
          },
        };
      });

      // 同步更新字符串格式的 customModels 以保持兼容性
      useAppConfig.getState().syncCustomModelsString();
      return newModel;
    },

    // 更新自定义模型
    updateCustomModel(
      provider: ServiceProvider,
      modelId: string,
      updates: Partial<Omit<CustomModel, "id" | "provider" | "createdAt">>,
    ) {
      set((state) => {
        const providerModels = state.customModelsByProvider[provider] || [];
        const updatedModels = providerModels.map((model) =>
          model.id === modelId
            ? { ...model, ...updates, updatedAt: Date.now() }
            : model,
        );

        return {
          customModelsByProvider: {
            ...state.customModelsByProvider,
            [provider]: updatedModels,
          },
        };
      });

      // 同步更新字符串格式的 customModels
      useAppConfig.getState().syncCustomModelsString();
    },

    // 删除自定义模型
    deleteCustomModel(provider: ServiceProvider, modelId: string) {
      set((state) => {
        const providerModels = state.customModelsByProvider[provider] || [];
        const filteredModels = providerModels.filter(
          (model) => model.id !== modelId,
        );

        return {
          customModelsByProvider: {
            ...state.customModelsByProvider,
            [provider]: filteredModels,
          },
        };
      });

      // 同步更新字符串格式的 customModels
      useAppConfig.getState().syncCustomModelsString();
    },

    // 同步结构化数据到字符串格式（保持向后兼容）
    syncCustomModelsString() {
      const state = get();
      const customModelsArray: string[] = [];

      Object.entries(state.customModelsByProvider).forEach(
        ([provider, models]) => {
          if (models && models.length > 0) {
            models.forEach((model) => {
              if (model.enabled) {
                const modelString =
                  model.displayName && model.displayName !== model.name
                    ? `${model.name}=${model.displayName}`
                    : model.name;
                customModelsArray.push(
                  `+${modelString}@${provider.toLowerCase()}`,
                );
              } else {
                customModelsArray.push(
                  `-${model.name}@${provider.toLowerCase()}`,
                );
              }
            });
          }
        },
      );

      set(() => ({
        customModels: customModelsArray.join(","),
      }));
    },

    // 从字符串格式导入到结构化数据（用于迁移现有数据）
    importFromCustomModelsString() {
      const state = get();
      if (!state.customModels) return;

      const newCustomModelsByProvider: CustomModelsByProvider = {
        ...state.customModelsByProvider,
      };

      state.customModels.split(",").forEach((modelStr) => {
        if (!modelStr.trim()) return;

        const enabled = !modelStr.startsWith("-");
        const cleanStr = modelStr.replace(/^[+-]/, "");
        const [nameWithDisplay, providerStr] = cleanStr.split("@");

        if (!nameWithDisplay || !providerStr) return;

        const [name, displayName] = nameWithDisplay.split("=");
        const provider = Object.values(ServiceProvider).find(
          (p) => p.toLowerCase() === providerStr.toLowerCase(),
        );

        if (!provider) return;

        // 检查是否已存在
        const existingModels = newCustomModelsByProvider[provider] || [];
        const exists = existingModels.some((m) => m.name === name);

        if (!exists) {
          const now = Date.now();
          const newModel: CustomModel = {
            id: nanoid(),
            name,
            displayName: displayName || undefined,
            provider,
            enabled,
            createdAt: now,
            updatedAt: now,
          };

          newCustomModelsByProvider[provider] = [...existingModels, newModel];
        }
      });

      set(() => ({ customModelsByProvider: newCustomModelsByProvider }));
    },

    // {{CHENGQI:
    // Action: Added - 隐藏模型管理方法
    // Timestamp: 2025-06-18 18:45:00 +08:00
    // Reason: 为隐藏默认模型提供管理方法
    // Principle_Applied: SOLID - 单一职责，功能封装
    // Optimization: 类型安全的模型隐藏操作
    // Architectural_Note (AR): 扩展 store 以支持模型隐藏管理
    // Documentation_Note (DW): 提供完整的模型隐藏管理接口
    // }}

    // 获取指定提供商的隐藏模型列表
    getHiddenModelsByProvider(provider: ServiceProvider): string[] {
      const state = get();
      return state.hiddenModelsByProvider[provider] || [];
    },

    // 隐藏模型
    hideModel(provider: ServiceProvider, modelName: string) {
      set((state) => {
        const hiddenModels = state.hiddenModelsByProvider[provider] || [];
        if (!hiddenModels.includes(modelName)) {
          return {
            hiddenModelsByProvider: {
              ...state.hiddenModelsByProvider,
              [provider]: [...hiddenModels, modelName],
            },
          };
        }
        return state;
      });
    },

    // 显示模型（取消隐藏）
    showModel(provider: ServiceProvider, modelName: string) {
      set((state) => {
        const hiddenModels = state.hiddenModelsByProvider[provider] || [];
        const filteredModels = hiddenModels.filter(
          (name) => name !== modelName,
        );

        return {
          hiddenModelsByProvider: {
            ...state.hiddenModelsByProvider,
            [provider]: filteredModels,
          },
        };
      });
    },

    // 检查模型是否被隐藏
    isModelHidden(provider: ServiceProvider, modelName: string): boolean {
      const state = get();
      const hiddenModels = state.hiddenModelsByProvider[provider] || [];
      return hiddenModels.includes(modelName);
    },
  }),
  {
    name: StoreKey.Config,
    version: 4.1,

    merge(persistedState, currentState) {
      const state = persistedState as ChatConfig | undefined;
      if (!state) return { ...currentState };
      const models = currentState.models.slice();
      state.models.forEach((pModel) => {
        const idx = models.findIndex(
          (v) => v.name === pModel.name && v.provider === pModel.provider,
        );
        if (idx !== -1) models[idx] = pModel;
        else models.push(pModel);
      });
      return { ...currentState, ...state, models: models };
    },

    migrate(persistedState, version) {
      const state = persistedState as ChatConfig;

      if (version < 3.4) {
        state.modelConfig.sendMemory = true;
        state.modelConfig.historyMessageCount = 4;
        state.modelConfig.compressMessageLengthThreshold = 1000;
        state.modelConfig.frequency_penalty = 0;
        state.modelConfig.top_p = 1;
        state.modelConfig.template = DEFAULT_INPUT_TEMPLATE;
        state.dontShowMaskSplashScreen = false;
        state.hideBuiltinMasks = false;
      }

      if (version < 3.5) {
        state.customModels = "claude,claude-100k";
      }

      if (version < 3.6) {
        state.modelConfig.enableInjectSystemPrompts = true;
      }

      if (version < 3.7) {
        state.enableAutoGenerateTitle = true;
      }

      if (version < 3.8) {
        state.lastUpdate = Date.now();
      }

      if (version < 3.9) {
        state.modelConfig.template =
          state.modelConfig.template !== DEFAULT_INPUT_TEMPLATE
            ? state.modelConfig.template
            : config?.template ?? DEFAULT_INPUT_TEMPLATE;
      }

      if (version < 4.1) {
        state.modelConfig.compressModel =
          DEFAULT_CONFIG.modelConfig.compressModel;
        state.modelConfig.compressProviderName =
          DEFAULT_CONFIG.modelConfig.compressProviderName;
      }

      return state as any;
    },
  },
);

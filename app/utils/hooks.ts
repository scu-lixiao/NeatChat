import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const models = useMemo(() => {
    return collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
  }, [
    accessStore.customModels,
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    // {{CHENGQI:
    // Action: Added - 结构化自定义模型依赖
    // Timestamp: 2025-06-18 17:30:00 +08:00
    // Reason: 确保当结构化自定义模型数据变化时重新计算模型列表
    // Principle_Applied: SOLID - 依赖管理，数据一致性
    // Optimization: 正确的依赖关系，避免过时数据
    // Architectural_Note (AR): React hooks 依赖管理的最佳实践
    // Documentation_Note (DW): 添加结构化自定义模型数据的依赖
    // }}
    configStore.customModelsByProvider,
  ]);

  return models;
}

"use client";

import React, { useState, useMemo } from "react";
import { ServiceProvider } from "../constant";
import { CustomModel, useAppConfig } from "../store/config";
import { LLMModel } from "../client/api";
import { useAllModels } from "../utils/hooks";
import { formatProviderName } from "../utils/provider";
import {
  Input,
  List,
  ListItem,
  Modal,
  showConfirm,
  showToast,
} from "./ui-lib";
import { IconButton } from "./button";
import Locale from "../locales";
import styles from "./custom-model-manager.module.scss";

// Icons
import AddIcon from "../icons/add.svg";
import EditIcon from "../icons/edit.svg";
import DeleteIcon from "../icons/delete.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";
import DownloadIcon from "../icons/download.svg";
import UploadIcon from "../icons/upload.svg";

// {{CHENGQI:
// Action: Created - 自定义模型管理组件
// Timestamp: 2025-06-18 16:40:00 +08:00
// Reason: 为用户提供友好的自定义模型管理界面
// Principle_Applied: SOLID - 单一职责，组件化设计
// Optimization: Apple UI 设计系统，量子流体交互
// Architectural_Note (AR): 模块化的模型管理组件
// Documentation_Note (DW): 完整的自定义模型 CRUD 界面
// }}

interface CustomModelEditorProps {
  provider: ServiceProvider;
  model?: CustomModel;
  onSave: (modelData: Omit<CustomModel, 'id' | 'provider' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function CustomModelEditor({ provider, model, onSave, onCancel }: CustomModelEditorProps) {
  const [name, setName] = useState(model?.name || "");
  const [displayName, setDisplayName] = useState(model?.displayName || "");
  const [enabled, setEnabled] = useState(model?.enabled ?? true);

  const handleSave = () => {
    if (!name.trim()) {
      showToast(Locale.Settings.CustomModelManager.NameRequired);
      return;
    }

    // 验证模型名称格式
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      showToast(Locale.Settings.CustomModelManager.InvalidName);
      return;
    }

    onSave({
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      enabled,
    });
  };

  return (
    <div className={styles["model-editor"]}>
      <List>
        <ListItem title={Locale.Settings.CustomModelManager.ModelName}>
          <Input
            value={name}
            placeholder={Locale.Settings.CustomModelManager.ModelNamePlaceholder}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </ListItem>

        <ListItem
          title={Locale.Settings.CustomModelManager.DisplayName}
          subTitle={Locale.Settings.CustomModelManager.DisplayNameSubTitle}
        >
          <Input
            value={displayName}
            placeholder={Locale.Settings.CustomModelManager.DisplayNamePlaceholder}
            onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
          />
        </ListItem>

        <ListItem
          title={Locale.Settings.CustomModelManager.Enabled}
          subTitle={Locale.Settings.CustomModelManager.EnabledSubTitle}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </ListItem>
      </List>

      <div className={styles["editor-actions"]}>
        <IconButton
          icon={<ConfirmIcon />}
          text={Locale.UI.Confirm}
          onClick={handleSave}
          type="primary"
        />
        <IconButton
          icon={<CancelIcon />}
          text={Locale.UI.Cancel}
          onClick={onCancel}
        />
      </div>
    </div>
  );
}

// {{CHENGQI:
// Action: Modified - 扩展模型项组件以支持所有模型类型
// Timestamp: 2025-06-18 18:30:00 +08:00
// Reason: 支持显示和管理所有模型（默认模型和自定义模型）
// Principle_Applied: SOLID - 单一职责，扩展性设计
// Optimization: 统一的模型管理界面
// Architectural_Note (AR): 扩展组件以支持多种模型类型
// Documentation_Note (DW): 统一的模型项显示组件，支持默认和自定义模型
// }}

interface ModelItemProps {
  model: LLMModel | CustomModel;
  isCustom: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggle?: () => void;
  onHide?: () => void;
}

function ModelItem({ model, isCustom, onEdit, onDelete, onToggle, onHide }: ModelItemProps) {
  const handleDelete = async () => {
    if (await showConfirm(Locale.Settings.CustomModelManager.DeleteConfirm)) {
      onDelete?.();
    }
  };

  const handleHide = async () => {
    if (await showConfirm(`确认隐藏模型 "${model.displayName || model.name}"？`)) {
      onHide?.();
    }
  };

  const getModelStatus = () => {
    if (isCustom) {
      const customModel = model as CustomModel;
      return customModel.enabled ? Locale.Settings.CustomModelManager.Enabled : Locale.Settings.CustomModelManager.Disabled;
    } else {
      const llmModel = model as LLMModel;
      return llmModel.available ? "可用" : "不可用";
    }
  };

  const getModelType = () => {
    return isCustom ? "自定义模型" : "默认模型";
  };

  return (
    <ListItem
      title={model.displayName || model.name}
      subTitle={`${Locale.Settings.CustomModelManager.ModelName}: ${model.name} | 类型: ${getModelType()} | ${Locale.Settings.CustomModelManager.Status}: ${getModelStatus()}`}
    >
      <div className={styles["model-actions"]}>
        {isCustom && (
          <input
            type="checkbox"
            checked={(model as CustomModel).enabled}
            onChange={onToggle}
            title={Locale.Settings.CustomModelManager.ToggleEnabled}
          />
        )}

        {isCustom && onEdit && (
          <IconButton
            icon={<EditIcon />}
            onClick={onEdit}
            title={Locale.UI.Edit}
          />
        )}

        {isCustom && onDelete && (
          <IconButton
            icon={<DeleteIcon />}
            onClick={handleDelete}
            title="删除"
            type="danger"
          />
        )}

        {!isCustom && onHide && (
          <IconButton
            icon={<DeleteIcon />}
            onClick={handleHide}
            title="隐藏模型"
            type="danger"
          />
        )}
      </div>
    </ListItem>
  );
}

interface CustomModelManagerProps {
  provider: ServiceProvider;
  onClose: () => void;
}

export function CustomModelManager({ provider, onClose }: CustomModelManagerProps) {
  const config = useAppConfig();
  const allModels = useAllModels();
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // {{CHENGQI:
  // Action: Modified - 获取所有模型（默认模型和自定义模型）
  // Timestamp: 2025-06-18 18:35:00 +08:00
  // Reason: 显示该供应商的所有模型，支持完整的模型管理
  // Principle_Applied: SOLID - 单一职责，数据聚合
  // Optimization: 统一的模型数据源
  // Architectural_Note (AR): 整合默认模型和自定义模型的数据
  // Documentation_Note (DW): 获取指定供应商的所有模型数据
  // }}
  const { customModels, defaultModels } = useMemo(() => {
    const customModels = config.getCustomModelsByProvider(provider);
    const defaultModels = allModels.filter(model => {
      // 过滤出属于当前供应商的默认模型
      // 注意：allModels 中的模型有 provider 对象，需要检查 provider.providerName
      const modelProviderName = model.provider?.providerName;
      return modelProviderName === provider && !customModels.some(cm => cm.name === model.name);
    });

    console.log("CustomModelManager - provider:", provider);
    console.log("CustomModelManager - allModels:", allModels);
    console.log("CustomModelManager - customModels:", customModels);
    console.log("CustomModelManager - defaultModels:", defaultModels);

    return { customModels, defaultModels };
  }, [config, provider, allModels]);

  const handleAddModel = () => {
    setEditingModel(null);
    setShowEditor(true);
  };

  const handleEditModel = (model: CustomModel) => {
    setEditingModel(model);
    setShowEditor(true);
  };

  const handleSaveModel = (modelData: Omit<CustomModel, 'id' | 'provider' | 'createdAt' | 'updatedAt'>) => {
    if (editingModel) {
      config.updateCustomModel(provider, editingModel.id, modelData);
      showToast(Locale.Settings.CustomModelManager.UpdateSuccess);
    } else {
      // Add provider to modelData for addCustomModel
      const modelWithProvider = { ...modelData, provider };
      config.addCustomModel(provider, modelWithProvider);
      showToast(Locale.Settings.CustomModelManager.AddSuccess);
    }
    setShowEditor(false);
    setEditingModel(null);
  };

  const handleDeleteModel = (modelId: string) => {
    config.deleteCustomModel(provider, modelId);
    showToast(Locale.Settings.CustomModelManager.DeleteSuccess);
  };

  const handleToggleModel = (model: CustomModel) => {
    config.updateCustomModel(provider, model.id, { enabled: !model.enabled });
  };

  const handleHideModel = (modelName: string) => {
    config.hideModel(provider, modelName);
    showToast(`模型 "${modelName}" 已隐藏`);
  };

  const handleExportModels = () => {
    const exportData = {
      provider,
      models: customModels,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-models-${formatProviderName(provider).toLowerCase()}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(Locale.Settings.CustomModelManager.ExportSuccess);
  };

  const handleImportModels = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.provider === provider && Array.isArray(data.models)) {
            data.models.forEach((modelData: any) => {
              if (modelData.name) {
                config.addCustomModel(provider, {
                  name: modelData.name,
                  displayName: modelData.displayName,
                  enabled: modelData.enabled ?? true,
                  provider,
                });
              }
            });
            showToast(Locale.Settings.CustomModelManager.ImportSuccess);
          } else {
            showToast(Locale.Settings.CustomModelManager.ImportError);
          }
        } catch (error) {
          showToast(Locale.Settings.CustomModelManager.ImportError);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <Modal
      title={`${Locale.Settings.CustomModelManager.Title} - ${formatProviderName(provider)}`}
      onClose={onClose}
      actions={[
        <IconButton
          key="export"
          icon={<DownloadIcon />}
          text={Locale.Settings.CustomModelManager.Export}
          onClick={handleExportModels}
        />,
        <IconButton
          key="import"
          icon={<UploadIcon />}
          text={Locale.Settings.CustomModelManager.Import}
          onClick={handleImportModels}
        />,
        <IconButton
          key="add"
          icon={<AddIcon />}
          text={Locale.Settings.CustomModelManager.Add}
          onClick={handleAddModel}
          type="primary"
        />,
      ]}
    >
      {showEditor ? (
        <CustomModelEditor
          provider={provider}
          model={editingModel || undefined}
          onSave={handleSaveModel}
          onCancel={() => {
            setShowEditor(false);
            setEditingModel(null);
          }}
        />
      ) : (
        <div className={styles["model-manager"]}>
          {customModels.length === 0 && defaultModels.length === 0 ? (
            <div className={styles["empty-state"]}>
              <p>{Locale.Settings.CustomModelManager.NoModels}</p>
              <IconButton
                icon={<AddIcon />}
                text={Locale.Settings.CustomModelManager.AddFirst}
                onClick={handleAddModel}
                type="primary"
              />
            </div>
          ) : (
            <List>
              {/* 显示自定义模型 */}
              {customModels.length > 0 && (
                <>
                  <div className={styles["section-header"]}>
                    <h3>自定义模型</h3>
                  </div>
                  {customModels.map((model) => (
                    <ModelItem
                      key={`custom-${model.id}`}
                      model={model}
                      isCustom={true}
                      onEdit={() => handleEditModel(model)}
                      onDelete={() => handleDeleteModel(model.id)}
                      onToggle={() => handleToggleModel(model)}
                    />
                  ))}
                </>
              )}

              {/* 显示默认模型 */}
              {defaultModels.length > 0 && (
                <>
                  <div className={styles["section-header"]}>
                    <h3>默认模型</h3>
                  </div>
                  {defaultModels.map((model) => (
                    <ModelItem
                      key={`default-${model.name}`}
                      model={model as LLMModel}
                      isCustom={false}
                      onHide={() => handleHideModel(model.name)}
                    />
                  ))}
                </>
              )}
            </List>
          )}
        </div>
      )}
    </Modal>
  );
}

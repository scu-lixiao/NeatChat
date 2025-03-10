import { useState, useEffect, useMemo } from "react";
import { Modal, List, ListItem, showToast } from "./ui-lib";
import { IconButton } from "./button";
import LoadingIcon from "../icons/three-dots.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";
import Locale from "../locales";
import { useAccessStore } from "../store";
import { Avatar } from "./emoji";
import AddIcon from "../icons/add.svg";
import CloseIcon from "../icons/close.svg";
import EditIcon from "../icons/edit.svg";

interface ModelInfo {
  id: string;
  selected: boolean;
  isCustom?: boolean;
}

export function ModelSelectorModal(props: {
  onClose: () => void;
  onSelect: (models: string) => void;
  currentModels: string;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const accessStore = useAccessStore();

  // 解析当前已选模型，忽略@及其后面的类别信息
  const currentModelList = useMemo(() => {
    if (!props.currentModels) return [];

    return props.currentModels.split(",").map((m) => {
      const trimmed = m.trim();
      // 如果包含@，则只取@前面的部分
      const atIndex = trimmed.indexOf("@");
      return atIndex >= 0 ? trimmed.substring(0, atIndex) : trimmed;
    });
  }, [props.currentModels]);

  // 添加一个状态来跟踪正在编辑的模型索引
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // 添加一个状态存储编辑中的值
  const [editingValue, setEditingValue] = useState("");

  // 在组件顶部添加搜索状态
  const [searchKeyword, setSearchKeyword] = useState("");

  // 添加模型类别状态
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // 添加自定义类别状态
  const [customCategories, setCustomCategories] = useState<
    Record<string, string>
  >({});
  // 添加编辑类别模态框状态
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);
  // 添加新类别输入状态
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryPattern, setNewCategoryPattern] = useState("");

  // 定义模型类别映射函数，与emoji.tsx保持一致
  const getModelCategory = (modelId: string): string => {
    const lowerModelId = modelId.toLowerCase();

    // 先检查自定义类别
    for (const [pattern, category] of Object.entries(customCategories)) {
      if (lowerModelId.includes(pattern.toLowerCase())) {
        return category;
      }
    }

    // 默认类别，与emoji.tsx保持一致
    // 注意：匹配顺序很重要，先匹配到的类别将被返回

    // 先检查特定的模型系列，这些通常有明确的标识
    if (lowerModelId.includes("claude")) return "Claude";
    if (lowerModelId.includes("dall")) return "DALL-E";
    if (lowerModelId.includes("deepseek")) return "DeepSeek"; // 确保DeepSeek在Qwen之前检查
    if (lowerModelId.includes("grok")) return "Grok";
    if (lowerModelId.includes("gemini")) return "Gemini";
    if (lowerModelId.includes("moonshot") || lowerModelId.includes("kimi"))
      return "MoonShot";
    if (lowerModelId.includes("wenxin") || lowerModelId.includes("ernie"))
      return "WenXin";
    if (lowerModelId.includes("doubao")) return "DouBao";
    if (lowerModelId.includes("hunyuan")) return "HunYuan";
    if (lowerModelId.includes("command")) return "Cohere";
    if (lowerModelId.includes("glm")) return "GLM";

    // 然后检查可能作为基础模型的系列
    if (lowerModelId.includes("llama")) return "Llama";
    if (
      lowerModelId.includes("qwen") ||
      lowerModelId.includes("qwq") ||
      lowerModelId.includes("qvq")
    )
      return "Qwen";

    // 最后检查最通用的模型系列
    // OpenAI/GPT 需要放在最后检查，因为它的匹配规则比较宽泛
    if (
      lowerModelId.includes("gpt") ||
      lowerModelId.startsWith("o1") ||
      lowerModelId.startsWith("o3")
    )
      return "ChatGPT";

    return "Other";
  };

  // 获取可用的模型类别，按字母顺序排序，但"all"在最前，"Other"在最后
  const getAvailableCategories = useMemo(() => {
    const categories = new Set<string>();

    // 收集所有类别
    models.forEach((model) => {
      const category = getModelCategory(model.id);
      categories.add(category);
    });

    // 转换为数组
    const categoriesArray = Array.from(categories);

    // 移除"all"和"Other"（如果存在）
    const filteredCategories = categoriesArray.filter(
      (category) => category !== "all" && category !== "Other",
    );

    // 按字母顺序排序其他类别
    filteredCategories.sort((a, b) => a.localeCompare(b));

    // 构建最终数组：all在最前，排序后的类别在中间，Other在最后
    const result = ["all"];

    // 添加排序后的类别
    result.push(...filteredCategories);

    // 如果有"Other"类别，添加到最后
    if (categoriesArray.includes("Other")) {
      result.push("Other");
    }

    return result;
  }, [models]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      // 先从服务端获取配置
      const configResponse = await fetch("/api/config");
      const configData = await configResponse.json();

      // 检查是否启用了自定义接口
      const useCustomApi = accessStore.useCustomConfig;

      console.log("自定义接口状态:", useCustomApi);
      console.log(
        "客户端API密钥:",
        accessStore.openaiApiKey ? "已设置" : "未设置",
      );

      if (useCustomApi) {
        // 使用客户端配置
        const baseUrl = accessStore.openaiUrl || "https://api.openai.com";
        const apiKey = accessStore.openaiApiKey;

        if (!apiKey) {
          showToast(Locale.Settings.Access.CustomModel.ApiKeyRequired);
          setLoading(false);
          return;
        }

        try {
          // 使用客户端密钥直接请求
          const url = `${baseUrl}/v1/models`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(
              Locale.Settings.Access.CustomModel.RequestFailed(response.status),
            );
          }

          const data = await response.json();

          if (data.data && Array.isArray(data.data)) {
            // 处理模型数据
            const apiModelList = data.data.map((model: any) => ({
              id: model.id,
              selected: currentModelList.includes(model.id),
            }));

            // 按字母顺序排序
            apiModelList.sort((a: ModelInfo, b: ModelInfo) =>
              a.id.localeCompare(b.id),
            );

            // 找出自定义模型名中已有的但不在API返回列表中的模型
            const apiModelIds = apiModelList.map((m: ModelInfo) => m.id);
            const customModels = currentModelList
              .filter(
                (modelId) =>
                  !apiModelIds.includes(modelId) && modelId !== "-all",
              )
              .map((modelId) => ({
                id: modelId,
                selected: true,
                isCustom: true,
              }));

            // 合并API模型和自定义模型
            setModels([...apiModelList, ...customModels]);

            // 显示获取到的模型数量，指明是从客户端获取的
            showToast(
              Locale.Settings.Access.CustomModel.FetchSuccessFromClient(
                apiModelList.length,
              ),
            );
          } else {
            throw new Error(Locale.Settings.Access.CustomModel.InvalidResponse);
          }
        } catch (error) {
          // 客户端错误
          console.error("从客户端获取模型列表失败:", error);
          showToast(
            Locale.Settings.Access.CustomModel.FetchFailedFromClient(
              error instanceof Error ? error.message : String(error),
            ),
          );
          setLoading(false);
          return;
        }
      } else {
        // 使用服务端配置
        const baseUrl = configData.baseUrl || "https://api.openai.com";

        // 检查服务端是否设置了API密钥
        if (configData.apiKey !== "已设置") {
          showToast(Locale.Settings.Access.CustomModel.ApiKeyRequired);
          setLoading(false);
          return;
        }

        try {
          // 通过服务端代理请求
          const response = await fetch("/api/proxy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: `${baseUrl}/v1/models`,
            }),
          });

          if (!response.ok) {
            throw new Error(
              Locale.Settings.Access.CustomModel.RequestFailed(response.status),
            );
          }

          const data = await response.json();

          if (data.data && Array.isArray(data.data)) {
            // 处理模型数据
            const apiModelList = data.data.map((model: any) => ({
              id: model.id,
              selected: currentModelList.includes(model.id),
            }));

            // 按字母顺序排序
            apiModelList.sort((a: ModelInfo, b: ModelInfo) =>
              a.id.localeCompare(b.id),
            );

            // 找出自定义模型名中已有的但不在API返回列表中的模型
            const apiModelIds = apiModelList.map((m: ModelInfo) => m.id);
            const customModels = currentModelList
              .filter(
                (modelId) =>
                  !apiModelIds.includes(modelId) && modelId !== "-all",
              )
              .map((modelId) => ({
                id: modelId,
                selected: true,
                isCustom: true,
              }));

            // 合并API模型和自定义模型
            setModels([...apiModelList, ...customModels]);

            // 显示获取到的模型数量，指明是从服务端获取的
            showToast(
              Locale.Settings.Access.CustomModel.FetchSuccessFromServer(
                apiModelList.length,
              ),
            );
          } else {
            throw new Error(Locale.Settings.Access.CustomModel.InvalidResponse);
          }
        } catch (error) {
          // 服务端错误
          console.error("从服务端获取模型列表失败:", error);
          showToast(
            Locale.Settings.Access.CustomModel.FetchFailedFromServer(
              error instanceof Error ? error.message : String(error),
            ),
          );
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      // 通用错误（如配置获取失败等）
      console.error("获取模型列表失败:", error);
      showToast(
        `获取模型列表失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [accessStore.useCustomConfig]);

  const toggleModelSelection = (index: number) => {
    setModels((prevModels) => {
      const newModels = [...prevModels];
      newModels[index] = {
        ...newModels[index],
        selected: !newModels[index].selected,
      };
      return newModels;
    });
  };

  const handleConfirm = () => {
    const selectedModels = models
      .filter((model) => model.selected)
      .map((model) => {
        // 获取模型类别
        const category = getModelCategory(model.id);
        // 返回格式为 modelId@Category 的字符串
        return `${model.id}@${category}`;
      })
      .join(",");

    props.onSelect(selectedModels);
    props.onClose();
  };

  // 修改全选函数，同时考虑搜索关键字和类别过滤
  const selectAll = () => {
    const filteredModelIds = models
      .filter((model) => {
        // 同时考虑搜索关键字和类别过滤
        const matchesSearch = model.id
          .toLowerCase()
          .includes(searchKeyword.toLowerCase());
        const matchesCategory =
          selectedCategory === "all" ||
          getModelCategory(model.id) === selectedCategory;

        return matchesSearch && matchesCategory;
      })
      .map((model) => model.id);

    setModels((prevModels) =>
      prevModels.map((model) => ({
        ...model,
        selected: filteredModelIds.includes(model.id) ? true : model.selected,
      })),
    );
  };

  // 修改全不选函数，同时考虑搜索关键字和类别过滤
  const selectNone = () => {
    const filteredModelIds = models
      .filter((model) => {
        // 同时考虑搜索关键字和类别过滤
        const matchesSearch = model.id
          .toLowerCase()
          .includes(searchKeyword.toLowerCase());
        const matchesCategory =
          selectedCategory === "all" ||
          getModelCategory(model.id) === selectedCategory;

        return matchesSearch && matchesCategory;
      })
      .map((model) => model.id);

    setModels((prevModels) =>
      prevModels.map((model) => ({
        ...model,
        selected: filteredModelIds.includes(model.id) ? false : model.selected,
      })),
    );
  };

  // 修改添加自定义模型函数
  const addCustomModel = (e?: React.KeyboardEvent) => {
    // 如果是键盘事件且不是回车键，则不处理
    if (e && e.key !== "Enter") {
      return;
    }

    // 检查输入是否为空
    const modelName = customModelInput.trim();
    if (!modelName) {
      return;
    }

    // 检查是否已存在相同名称的模型
    if (models.some((m) => m.id === modelName)) {
      showToast(Locale.Settings.Access.CustomModel.ModelExists);
      return;
    }

    // 添加新模型，并标记为自定义模型
    setModels((prevModels) => [
      ...prevModels,
      {
        id: modelName,
        selected: true,
        isCustom: true, // 确保设置isCustom为true
      },
    ]);

    // 清空输入
    setCustomModelInput("");
  };

  // 修改编辑自定义模型函数
  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(models[index].id);
  };

  const saveEditing = () => {
    if (editingIndex === null) return;

    const newId = editingValue.trim();
    if (!newId) {
      // 如果输入为空，则删除该模型
      deleteCustomModel(editingIndex);
    } else if (newId !== models[editingIndex].id) {
      // 检查是否与其他模型重名
      const exists = models.some(
        (m, i) => i !== editingIndex && m.id === newId,
      );
      if (exists) {
        showToast(Locale.Settings.Access.CustomModel.ModelExists);
      } else {
        // 保存修改
        setModels((prevModels) => {
          const newModels = [...prevModels];
          newModels[editingIndex] = {
            ...newModels[editingIndex],
            id: newId,
          };
          return newModels;
        });
      }
    }

    // 退出编辑模式
    setEditingIndex(null);
  };

  // 添加删除自定义模型函数
  const deleteCustomModel = (index: number) => {
    setModels((prevModels) => prevModels.filter((_, i) => i !== index));
  };

  // 修改类别编辑器模态框的实现
  const addCategory = () => {
    if (!newCategoryName.trim() || !newCategoryPattern.trim()) return;

    setCustomCategories((prev) => ({
      ...prev,
      [newCategoryPattern.trim()]: newCategoryName.trim(),
    }));

    setNewCategoryName("");
    setNewCategoryPattern("");
  };

  const removeCategory = (pattern: string) => {
    setCustomCategories((prev) => {
      const newCategories = { ...prev };
      delete newCategories[pattern];
      return newCategories;
    });
  };

  return (
    <div className="modal-mask">
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                whiteSpace: "nowrap", // 防止标题换行
              }}
            >
              {Locale.Settings.Access.CustomModel.ModelSelector}
            </div>
            <div
              style={{
                display: "flex",
                flex: 1,
                gap: "8px",
                alignItems: "center",
                justifyContent: "space-between", // 使元素分散对齐
              }}
            >
              {/* 搜索框和下拉框放在一起 */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flex: 1, // 占据大部分空间
                }}
              >
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={Locale.UI.Search}
                  style={{
                    width: "100%",
                    padding: "4px 10px",
                    border: "var(--border-in-light)",
                    borderRadius: "10px",
                    background: "var(--white)",
                    boxShadow: "var(--input-shadow)",
                    fontSize: "14px",
                    lineHeight: "1.2",
                    height: "32px",
                    color: "var(--black)",
                  }}
                />

                {/* 添加模型类别下拉框 */}
                {getAvailableCategories.length > 1 && (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{
                      padding: "4px 8px",
                      border: "var(--border-in-light)",
                      borderRadius: "10px",
                      background: "var(--white)",
                      boxShadow: "var(--input-shadow)",
                      fontSize: "14px",
                      height: "32px",
                      lineHeight: "1.2",
                      color: "var(--black)",
                      width: "auto",
                      appearance: "auto",
                      cursor: "pointer",
                      flexShrink: 0, // 防止被压缩
                    }}
                  >
                    {getAvailableCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === "all" ? Locale.UI.All : category}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 全选和全不选按钮放在最右侧 */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexShrink: 0, // 防止被压缩
                }}
              >
                <IconButton
                  text={Locale.Settings.Access.CustomModel.SelectAll}
                  onClick={selectAll}
                  bordered
                />
                <IconButton
                  text={Locale.Settings.Access.CustomModel.SelectNone}
                  onClick={selectNone}
                  bordered
                />
              </div>
            </div>
          </div>
        }
        onClose={props.onClose}
        actions={[
          <IconButton
            key="edit-categories"
            icon={<EditIcon />}
            text="编辑类别"
            onClick={() => setShowCategoryEditor(true)}
          />,
          <div key="spacer" style={{ flex: 1 }}></div>,
          <IconButton
            key="cancel"
            icon={<CancelIcon />}
            bordered
            text={Locale.UI.Cancel}
            onClick={props.onClose}
          />,
          <IconButton
            key="confirm"
            icon={<ConfirmIcon />}
            bordered
            text={Locale.UI.Confirm}
            onClick={handleConfirm}
          />,
        ]}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <LoadingIcon />
          </div>
        ) : (
          <>
            <List>
              {/* 过滤并显示模型列表 */}
              {models
                .filter((model) => {
                  // 先按搜索关键字过滤
                  const matchesSearch = model.id
                    .toLowerCase()
                    .includes(searchKeyword.toLowerCase());

                  // 再按类别过滤
                  const matchesCategory =
                    selectedCategory === "all" ||
                    getModelCategory(model.id) === selectedCategory;

                  return matchesSearch && matchesCategory;
                })
                .map((model, index) => {
                  // 获取模型类别
                  const modelCategory = getModelCategory(model.id);

                  // 根据类别构造头像标识符
                  let avatarId;
                  switch (modelCategory) {
                    case "Claude":
                      avatarId = "claude";
                      break;
                    case "DALL-E":
                      avatarId = "dall-e";
                      break;
                    case "WenXin":
                      avatarId = "wenxin";
                      break;
                    case "DouBao":
                      avatarId = "doubao";
                      break;
                    case "HunYuan":
                      avatarId = "hunyuan";
                      break;
                    case "Gemini":
                      avatarId = "gemini";
                      break;
                    case "Llama":
                      avatarId = "llama";
                      break;
                    case "ChatGPT":
                      // 特殊处理GPT-3.5
                      if (
                        model.id.toLowerCase().includes("gpt-3.5") ||
                        model.id.toLowerCase().includes("gpt3")
                      ) {
                        avatarId = "gpt-3.5";
                      } else {
                        avatarId = "gpt";
                      }
                      break;
                    case "Cohere":
                      avatarId = "command";
                      break;
                    case "DeepSeek":
                      avatarId = "deepseek";
                      break;
                    case "MoonShot":
                      avatarId = "moonshot";
                      break;
                    case "GLM":
                      avatarId = "glm";
                      break;
                    case "Grok":
                      avatarId = "grok";
                      break;
                    case "Qwen":
                      avatarId = "qwen";
                      break;
                    default:
                      avatarId = model.id; // 默认使用模型ID
                  }

                  return (
                    <ListItem
                      key={model.id}
                      title=""
                      icon={<Avatar model={avatarId} />}
                      onClick={undefined}
                    >
                      {model.isCustom && editingIndex === index ? (
                        <div style={{ flex: 1, paddingRight: "10px" }}>
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveEditing}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                saveEditing();
                              } else if (e.key === "Escape") {
                                setEditingIndex(null);
                              }
                            }}
                            autoFocus
                            style={{
                              width: "auto",
                              border: "none",
                              outline: "none",
                              background: "#f0f0f0",
                              fontSize: "inherit",
                              fontFamily: "inherit",
                              padding: "2px 4px",
                              borderRadius: "8px",
                              display: "inline-block",
                              cursor: "text",
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ flex: 1 }}>
                          {model.isCustom ? (
                            <span
                              onClick={() => startEditing(index)}
                              style={{
                                cursor: "text",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "var(--text-color)",
                                padding: "2px 4px",
                                borderRadius: "8px",
                                display: "inline-block",
                                border: "1px solid transparent",
                              }}
                            >
                              {model.id}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "var(--text-color)",
                                display: "block",
                                marginBottom: "4px",
                              }}
                            >
                              {model.id}
                            </span>
                          )}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center" }}>
                        {model.isCustom && (
                          <IconButton
                            icon={<CloseIcon />}
                            onClick={() => deleteCustomModel(index)}
                            style={{
                              marginRight: "8px",
                              padding: "8px",
                            }}
                          />
                        )}
                        <input
                          type="checkbox"
                          checked={model.selected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleModelSelection(index);
                          }}
                        />
                      </div>
                    </ListItem>
                  );
                })}

              {/* 添加新模型的输入行 */}
              <ListItem key="new-model-input" icon={undefined} title="">
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    justifyContent: "center",
                  }}
                >
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder={
                      Locale.Settings.Access.CustomModel.InputPlaceholder
                    }
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: "14px",
                      fontWeight: "bold",
                      textAlign: "center",
                      padding: "0 10px",
                    }}
                  />
                </div>
                <IconButton
                  icon={<AddIcon />}
                  onClick={() => addCustomModel()}
                  style={{
                    padding: "8px",
                  }}
                />
              </ListItem>
            </List>
          </>
        )}
      </Modal>

      {/* 添加类别编辑器模态框 */}
      {showCategoryEditor && (
        <div className="modal-mask">
          <Modal
            title={
              Locale.Settings.Access.CustomModel.EditCategories ||
              "编辑模型类别"
            }
            onClose={() => setShowCategoryEditor(false)}
            actions={[
              <IconButton
                key="close"
                icon={<ConfirmIcon />}
                text={Locale.UI.Close}
                onClick={() => setShowCategoryEditor(false)}
                bordered
              />,
            ]}
          >
            <div className="model-category-editor">
              {/* 添加新类别 */}
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginBottom: "10px",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="类别名称"
                    style={{
                      padding: "8px 12px",
                      border: "var(--border-in-light)",
                      borderRadius: "10px",
                      background: "var(--white)",
                      boxShadow: "var(--input-shadow)",
                      flex: 1,
                    }}
                  />
                  <input
                    type="text"
                    value={newCategoryPattern}
                    onChange={(e) => setNewCategoryPattern(e.target.value)}
                    placeholder="匹配关键词"
                    style={{
                      padding: "8px 12px",
                      border: "var(--border-in-light)",
                      borderRadius: "10px",
                      background: "var(--white)",
                      boxShadow: "var(--input-shadow)",
                      flex: 1,
                    }}
                  />
                  <IconButton
                    icon={<AddIcon />}
                    text="添加"
                    onClick={addCategory}
                    bordered
                  />
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--black-50)",
                    padding: "0 4px",
                  }}
                >
                  提示：匹配关键词将用于识别模型类别，例如&quot;gpt&quot;将匹配所有包含&quot;gpt&quot;的模型
                </div>
              </div>

              {/* 显示现有类别 */}
              <div>
                <div
                  style={{
                    fontWeight: "bold",
                    marginBottom: "10px",
                    fontSize: "14px",
                    borderBottom: "1px solid var(--border-in-light)",
                    paddingBottom: "8px",
                  }}
                >
                  现有自定义类别
                </div>

                {Object.entries(customCategories).length === 0 ? (
                  <div
                    style={{
                      color: "var(--black-50)",
                      padding: "10px 0",
                      textAlign: "center",
                    }}
                  >
                    暂无自定义类别
                  </div>
                ) : (
                  <List>
                    {Object.entries(customCategories).map(
                      ([pattern, category]) => (
                        <ListItem
                          key={pattern}
                          title={category}
                          subTitle={`匹配: ${pattern}`}
                        >
                          <IconButton
                            icon={<CloseIcon />}
                            onClick={() => removeCategory(pattern)}
                            style={{ padding: "8px" }}
                          />
                        </ListItem>
                      ),
                    )}
                  </List>
                )}
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}

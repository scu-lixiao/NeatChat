import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { formatProviderName } from "../utils/provider";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const allModels = useAllModels();
  const groupModels = groupBy(
    allModels.filter((v) => v.available),
    "provider.providerName",
  );
  const value = `${props.modelConfig.model}@${props.modelConfig?.providerName}`;
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;

  return (
    <>
      <ListItem title={Locale.Settings.Model}>
        <Select
          aria-label={Locale.Settings.Model}
          value={value}
          align="left"
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.model = ModalConfigValidator.model(model);
              config.providerName = providerName as ServiceProvider;
            });
          }}
        >
          {Object.keys(groupModels).map((providerName, index) => (
            <optgroup label={formatProviderName(providerName)} key={index}>
              {groupModels[providerName].map((v, i) => (
                <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                  {v.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </ListItem>

      {/* GPT-5.2 系列模型推理级别配置 */}
      {props.modelConfig.model.startsWith("gpt-5.2") &&
        (() => {
          // 根据模型确定支持的推理级别
          const model = props.modelConfig.model;
          const isGPT5_2Pro = model === "gpt-5.2-pro";
          const isGPT5_2Thinking = model === "gpt-5.2-thinking";
          const isGPT5_2ChatLatest = model === "gpt-5.2-chat-latest";

          // 动态生成支持的选项
          // gpt-5.2-instant, gpt-5.2: 支持所有级别
          // gpt-5.2-chat-latest: 不支持 none（API 明确返回错误）
          // gpt-5.2-thinking: 支持 low, medium, high, xhigh（不支持 none）
          // gpt-5.2-pro: 支持 medium, high, xhigh（不支持 none 和 low）
          const supportsNone =
            !isGPT5_2Pro && !isGPT5_2Thinking && !isGPT5_2ChatLatest;
          const supportsLow = !isGPT5_2Pro;
          const supportsXHigh = !isGPT5_2Thinking;

          return (
            <ListItem
              title={Locale.Settings.ReasoningEffort.Title}
              subTitle={Locale.Settings.ReasoningEffort.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ReasoningEffort.Title}
                value={props.modelConfig.reasoningEffort ?? "auto"}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.reasoningEffort = e.currentTarget.value as
                      | "auto"
                      | "none"
                      | "low"
                      | "medium"
                      | "high"
                      | "xhigh";
                  });
                }}
              >
                <option value="auto">
                  {Locale.Settings.ReasoningEffort.Options.Auto}
                </option>
                {supportsNone && (
                  <option value="none">
                    {Locale.Settings.ReasoningEffort.Options.None}
                  </option>
                )}
                {supportsLow && (
                  <option value="low">
                    {Locale.Settings.ReasoningEffort.Options.Low}
                  </option>
                )}
                <option value="medium">
                  {Locale.Settings.ReasoningEffort.Options.Medium}
                </option>
                <option value="high">
                  {Locale.Settings.ReasoningEffort.Options.High}
                </option>
                {supportsXHigh && (
                  <option value="xhigh">
                    {Locale.Settings.ReasoningEffort.Options.XHigh}
                  </option>
                )}
              </Select>
            </ListItem>
          );
        })()}

      {/* GPT-5.2 系列模型内置工具配置 */}
      {props.modelConfig.model.startsWith("gpt-5.2") && (
        <>
          {/* 网络搜索工具 */}
          <ListItem
            title={Locale.Settings.GPT5Tools.EnableWebSearch.Title}
            subTitle={Locale.Settings.GPT5Tools.EnableWebSearch.SubTitle}
          >
            <input
              aria-label={Locale.Settings.GPT5Tools.EnableWebSearch.Title}
              type="checkbox"
              checked={props.modelConfig.enableWebSearch ?? false}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableWebSearch = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          {/* 代码解释器工具 */}
          <ListItem
            title={Locale.Settings.GPT5Tools.EnableCodeInterpreter.Title}
            subTitle={Locale.Settings.GPT5Tools.EnableCodeInterpreter.SubTitle}
          >
            <input
              aria-label={Locale.Settings.GPT5Tools.EnableCodeInterpreter.Title}
              type="checkbox"
              checked={props.modelConfig.enableCodeInterpreter ?? false}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableCodeInterpreter = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          {/* 文件搜索工具 */}
          <ListItem
            title={Locale.Settings.GPT5Tools.EnableFileSearch.Title}
            subTitle={Locale.Settings.GPT5Tools.EnableFileSearch.SubTitle}
          >
            <input
              aria-label={Locale.Settings.GPT5Tools.EnableFileSearch.Title}
              type="checkbox"
              checked={props.modelConfig.enableFileSearch ?? false}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableFileSearch = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          {/* 向量存储 ID（仅当启用文件搜索时显示） */}
          {props.modelConfig.enableFileSearch && (
            <ListItem
              title={Locale.Settings.GPT5Tools.VectorStoreIds.Title}
              subTitle={Locale.Settings.GPT5Tools.VectorStoreIds.SubTitle}
            >
              <input
                aria-label={Locale.Settings.GPT5Tools.VectorStoreIds.Title}
                type="text"
                placeholder={
                  Locale.Settings.GPT5Tools.VectorStoreIds.Placeholder
                }
                value={(props.modelConfig.vectorStoreIds ?? []).join(",")}
                onChange={(e) =>
                  props.updateConfig((config) => {
                    const value = e.currentTarget.value.trim();
                    config.vectorStoreIds = value
                      ? value
                          .split(",")
                          .map((id) => id.trim())
                          .filter((id) => id)
                      : [];
                  })
                }
              ></input>
            </ListItem>
          )}

          {/* 图像背景设置 */}
          <ListItem
            title={Locale.Settings.GPT5Tools.ImageBackground.Title}
            subTitle={Locale.Settings.GPT5Tools.ImageBackground.SubTitle}
          >
            <Select
              aria-label={Locale.Settings.GPT5Tools.ImageBackground.Title}
              value={props.modelConfig.imageBackground ?? "auto"}
              onChange={(e) => {
                props.updateConfig((config) => {
                  config.imageBackground = e.currentTarget.value as
                    | "auto"
                    | "transparent"
                    | "opaque";
                });
              }}
            >
              <option value="auto">
                {Locale.Settings.GPT5Tools.ImageBackground.Options.Auto}
              </option>
              <option value="transparent">
                {Locale.Settings.GPT5Tools.ImageBackground.Options.Transparent}
              </option>
              <option value="opaque">
                {Locale.Settings.GPT5Tools.ImageBackground.Options.Opaque}
              </option>
            </Select>
          </ListItem>

          {/* 工具选择策略 */}
          <ListItem
            title={Locale.Settings.GPT5Tools.ToolChoice.Title}
            subTitle={Locale.Settings.GPT5Tools.ToolChoice.SubTitle}
          >
            <Select
              aria-label={Locale.Settings.GPT5Tools.ToolChoice.Title}
              value={props.modelConfig.toolChoice ?? "auto"}
              onChange={(e) => {
                props.updateConfig((config) => {
                  config.toolChoice = e.currentTarget.value as
                    | "auto"
                    | "none"
                    | "required";
                });
              }}
            >
              <option value="auto">
                {Locale.Settings.GPT5Tools.ToolChoice.Options.Auto}
              </option>
              <option value="none">
                {Locale.Settings.GPT5Tools.ToolChoice.Options.None}
              </option>
              <option value="required">
                {Locale.Settings.GPT5Tools.ToolChoice.Options.Required}
              </option>
            </Select>
          </ListItem>
        </>
      )}

      <ListItem
        title={Locale.Settings.Temperature.Title}
        subTitle={Locale.Settings.Temperature.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.Temperature.Title}
          value={props.modelConfig.temperature?.toFixed(1)}
          min="0"
          max="1" // lets limit it to 0-1
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.temperature = ModalConfigValidator.temperature(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.TopP.Title}
        subTitle={Locale.Settings.TopP.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.TopP.Title}
          value={(props.modelConfig.top_p ?? 1).toFixed(1)}
          min="0"
          max="1"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.top_p = ModalConfigValidator.top_p(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.MaxTokens.Title}
        subTitle={Locale.Settings.MaxTokens.SubTitle}
      >
        <input
          aria-label={Locale.Settings.MaxTokens.Title}
          type="number"
          min={1024}
          max={512000}
          value={props.modelConfig.max_tokens}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.max_tokens = ModalConfigValidator.max_tokens(
                  e.currentTarget.valueAsNumber,
                )),
            )
          }
        ></input>
      </ListItem>

      {props.modelConfig?.providerName == ServiceProvider.Google ? null : (
        <>
          <ListItem
            title={Locale.Settings.PresencePenalty.Title}
            subTitle={Locale.Settings.PresencePenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.PresencePenalty.Title}
              value={props.modelConfig.presence_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.presence_penalty =
                      ModalConfigValidator.presence_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.FrequencyPenalty.Title}
            subTitle={Locale.Settings.FrequencyPenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FrequencyPenalty.Title}
              value={props.modelConfig.frequency_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.frequency_penalty =
                      ModalConfigValidator.frequency_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.InjectSystemPrompts.Title}
            subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InjectSystemPrompts.Title}
              type="checkbox"
              checked={props.modelConfig.enableInjectSystemPrompts}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableInjectSystemPrompts =
                      e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.InputTemplate.Title}
            subTitle={Locale.Settings.InputTemplate.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InputTemplate.Title}
              type="text"
              value={props.modelConfig.template}
              onChange={(e) =>
                props.updateConfig(
                  (config) => (config.template = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </>
      )}
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={4000}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={compressModelValue}
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          {allModels
            .filter((v) => v.available)
            .map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}(
                {formatProviderName(v.provider?.providerName || "")})
              </option>
            ))}
        </Select>
      </ListItem>
    </>
  );
}

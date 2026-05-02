import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";
import {
  getModelSizes,
  isDalle3,
  isGPT5ImageGenModel,
  isOpenAIImagesApiModel,
} from "../utils";
import {
  DalleQuality,
  DalleStyle,
  ImageModeration,
  ModelSize,
  OpenAIImageQuality,
} from "../typing";

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
  const currentModel = props.modelConfig.model;
  const isXAIProvider = props.modelConfig.providerName === ServiceProvider.XAI;
  const isXaiMultiAgentModel =
    isXAIProvider && currentModel.includes("multi-agent");
  const isXaiGrok43Model = isXAIProvider && currentModel.startsWith("grok-4.3");
  const supportsXaiToolControls = isXaiGrok43Model || isXaiMultiAgentModel;
  const isGpt5ReasoningModel =
    currentModel.startsWith("gpt-5.4") || currentModel.startsWith("gpt-5.5");
  const isAnthropicReasoningModel =
    /^claude-3-7-sonnet-20250219(?:-thinking)?$/.test(currentModel) ||
    /^claude-(?:opus|sonnet)-4(?:-|$)/.test(currentModel) ||
    /^claude-haiku-4-5(?:-|$)/.test(currentModel);
  const isLegacyDalle3 = isDalle3(currentModel);
  const supportsGpt5NativeImageGeneration = isGPT5ImageGenModel(currentModel);
  const isOpenAIImageModel = isOpenAIImagesApiModel(currentModel);
  const isModernOpenAIImageModel = isOpenAIImageModel && !isLegacyDalle3;
  const imageSizes = getModelSizes(currentModel);
  const currentImageSize = props.modelConfig.size ?? ("1024x1024" as ModelSize);
  const imageSizeOptions = imageSizes.includes(currentImageSize)
    ? imageSizes
    : [currentImageSize, ...imageSizes];
  const dalleQualityOptions: DalleQuality[] = ["standard", "hd"];
  const gptImageQualityOptions: OpenAIImageQuality[] = [
    "auto",
    "low",
    "medium",
    "high",
  ];
  const gptImageModerationOptions: ImageModeration[] = ["auto", "low"];
  const gpt5ImageGenerationModelOptions = [
    "gpt-image-2",
    "gpt-image-1",
    "gpt-image-1-mini",
    "gpt-image-1.5",
  ] as const;
  const gpt5ImageGenerationActionOptions = [
    "auto",
    "generate",
    "edit",
  ] as const;
  const gpt5ImageGenerationOutputFormatOptions = [
    "png",
    "webp",
    "jpeg",
  ] as const;
  const gpt5ImageGenerationInputFidelityOptions = ["low", "high"] as const;
  const imageQualityOptions = isLegacyDalle3
    ? dalleQualityOptions
    : isModernOpenAIImageModel
    ? gptImageQualityOptions
    : [];
  const currentOpenAIImageQuality = gptImageQualityOptions.includes(
    props.modelConfig.quality as OpenAIImageQuality,
  )
    ? (props.modelConfig.quality as OpenAIImageQuality)
    : "auto";
  const currentImageQuality = isLegacyDalle3
    ? props.modelConfig.quality === "hd"
      ? "hd"
      : "standard"
    : currentOpenAIImageQuality;
  const currentImageBackground =
    props.modelConfig.imageBackground === "transparent" ||
    props.modelConfig.imageBackground === "opaque"
      ? props.modelConfig.imageBackground
      : "auto";
  const currentImageBackgroundForImageModel =
    currentImageBackground === "opaque" ? "opaque" : "auto";
  const currentImageModeration = gptImageModerationOptions.includes(
    props.modelConfig.moderation as ImageModeration,
  )
    ? (props.modelConfig.moderation as ImageModeration)
    : "auto";
  const currentGpt5ImageGenerationModel =
    props.modelConfig.imageGenerationModel === "gpt-image-2" ||
    props.modelConfig.imageGenerationModel === "gpt-image-1-mini" ||
    props.modelConfig.imageGenerationModel === "gpt-image-1.5"
      ? props.modelConfig.imageGenerationModel
      : props.modelConfig.imageGenerationModel === "gpt-image-1"
      ? "gpt-image-1"
      : "gpt-image-2";
  const currentGpt5ImageGenerationAction =
    props.modelConfig.imageGenerationAction === "generate" ||
    props.modelConfig.imageGenerationAction === "edit"
      ? props.modelConfig.imageGenerationAction
      : "auto";
  const currentGpt5ImageGenerationOutputFormat =
    props.modelConfig.imageGenerationOutputFormat === "webp" ||
    props.modelConfig.imageGenerationOutputFormat === "jpeg"
      ? props.modelConfig.imageGenerationOutputFormat
      : "png";
  const currentGpt5ImageGenerationOutputCompression = Math.min(
    100,
    Math.max(0, props.modelConfig.imageGenerationOutputCompression ?? 100),
  );
  const currentGpt5ImageGenerationPartialImages = Math.min(
    3,
    Math.max(0, props.modelConfig.imageGenerationPartialImages ?? 0),
  );
  const currentGpt5ImageGenerationInputFidelity =
    props.modelConfig.imageGenerationInputFidelity === "high" ? "high" : "low";
  const currentReasoningEffort = props.modelConfig.reasoningEffort ?? "auto";
  const normalizedXaiReasoningEffort =
    currentReasoningEffort === "low" ||
    currentReasoningEffort === "medium" ||
    currentReasoningEffort === "high" ||
    currentReasoningEffort === "xhigh"
      ? currentReasoningEffort
      : "auto";
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

      {isOpenAIImageModel && (
        <>
          {imageSizes.length > 0 && (
            <ListItem
              title={Locale.Settings.ImageModel.Size.Title}
              subTitle={Locale.Settings.ImageModel.Size.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ImageModel.Size.Title}
                value={currentImageSize}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.size = e.currentTarget.value as ModelSize;
                  });
                }}
              >
                {imageSizeOptions.map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </ListItem>
          )}

          {imageQualityOptions.length > 0 && (
            <ListItem
              title={Locale.Settings.ImageModel.Quality.Title}
              subTitle={Locale.Settings.ImageModel.Quality.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ImageModel.Quality.Title}
                value={currentImageQuality}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.quality = e.currentTarget.value as
                      | DalleQuality
                      | OpenAIImageQuality;
                  });
                }}
              >
                {imageQualityOptions.map((quality) => (
                  <option value={quality} key={quality}>
                    {quality}
                  </option>
                ))}
              </Select>
            </ListItem>
          )}

          {isLegacyDalle3 && (
            <ListItem
              title={Locale.Settings.ImageModel.Style.Title}
              subTitle={Locale.Settings.ImageModel.Style.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ImageModel.Style.Title}
                value={props.modelConfig.style ?? ("vivid" as DalleStyle)}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.style = e.currentTarget.value as DalleStyle;
                  });
                }}
              >
                <option value="vivid">vivid</option>
                <option value="natural">natural</option>
              </Select>
            </ListItem>
          )}

          {isModernOpenAIImageModel && (
            <ListItem
              title={Locale.Settings.ImageModel.Background.Title}
              subTitle={Locale.Settings.ImageModel.Background.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ImageModel.Background.Title}
                value={currentImageBackgroundForImageModel}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.imageBackground = e.currentTarget.value as
                      | "auto"
                      | "opaque";
                  });
                }}
              >
                <option value="auto">
                  {Locale.Settings.ImageModel.Background.Options.Auto}
                </option>
                <option value="opaque">
                  {Locale.Settings.ImageModel.Background.Options.Opaque}
                </option>
              </Select>
            </ListItem>
          )}

          {isModernOpenAIImageModel && (
            <ListItem
              title={Locale.Settings.ImageModel.Moderation.Title}
              subTitle={Locale.Settings.ImageModel.Moderation.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ImageModel.Moderation.Title}
                value={currentImageModeration}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.moderation = e.currentTarget
                      .value as ImageModeration;
                  });
                }}
              >
                {gptImageModerationOptions.map((moderation) => (
                  <option value={moderation} key={moderation}>
                    {moderation}
                  </option>
                ))}
              </Select>
            </ListItem>
          )}
        </>
      )}

      {/* 推理模型推理级别配置 */}
      {(isGpt5ReasoningModel ||
        isAnthropicReasoningModel ||
        isXaiMultiAgentModel) &&
        (() => {
          const model = currentModel;
          const isGPT5Pro = model === "gpt-5.4-pro" || model === "gpt-5.5-pro";
          const supportsNone = isXaiMultiAgentModel
            ? false
            : !isGpt5ReasoningModel || !isGPT5Pro;
          const supportsLow = isXaiMultiAgentModel
            ? true
            : !isGpt5ReasoningModel || !isGPT5Pro;
          const supportsXHigh = isXaiMultiAgentModel
            ? true
            : isGpt5ReasoningModel || model === "claude-opus-4-7";
          const reasoningEffortValue = isXaiMultiAgentModel
            ? normalizedXaiReasoningEffort
            : currentReasoningEffort;
          const reasoningEffortSubTitle = isXaiMultiAgentModel
            ? Locale.Settings.ReasoningEffort.XAIMultiAgentSubTitle
            : Locale.Settings.ReasoningEffort.SubTitle;

          return (
            <ListItem
              title={Locale.Settings.ReasoningEffort.Title}
              subTitle={reasoningEffortSubTitle}
            >
              <Select
                aria-label={Locale.Settings.ReasoningEffort.Title}
                value={reasoningEffortValue}
                onChange={(e) => {
                  props.updateConfig((config) => {
                    config.reasoningEffort = e.currentTarget.value as
                      | "auto"
                      | "none"
                      | "minimal"
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

      {isGpt5ReasoningModel && (
        <>
          <ListItem
            title={Locale.Settings.ReasoningSummary.Title}
            subTitle={Locale.Settings.ReasoningSummary.SubTitle}
          >
            <Select
              aria-label={Locale.Settings.ReasoningSummary.Title}
              value={props.modelConfig.reasoningSummary ?? "auto"}
              onChange={(e) => {
                props.updateConfig((config) => {
                  config.reasoningSummary = e.currentTarget.value as
                    | "auto"
                    | "none"
                    | "concise"
                    | "detailed";
                });
              }}
            >
              <option value="auto">
                {Locale.Settings.ReasoningSummary.Options.Auto}
              </option>
              <option value="none">
                {Locale.Settings.ReasoningSummary.Options.None}
              </option>
              <option value="concise">
                {Locale.Settings.ReasoningSummary.Options.Concise}
              </option>
              <option value="detailed">
                {Locale.Settings.ReasoningSummary.Options.Detailed}
              </option>
            </Select>
          </ListItem>

          <ListItem
            title={Locale.Settings.TextVerbosity.Title}
            subTitle={Locale.Settings.TextVerbosity.SubTitle}
          >
            <Select
              aria-label={Locale.Settings.TextVerbosity.Title}
              value={props.modelConfig.textVerbosity ?? "medium"}
              onChange={(e) => {
                props.updateConfig((config) => {
                  config.textVerbosity = e.currentTarget.value as
                    | "low"
                    | "medium"
                    | "high";
                });
              }}
            >
              <option value="low">
                {Locale.Settings.TextVerbosity.Options.Low}
              </option>
              <option value="medium">
                {Locale.Settings.TextVerbosity.Options.Medium}
              </option>
              <option value="high">
                {Locale.Settings.TextVerbosity.Options.High}
              </option>
            </Select>
          </ListItem>
        </>
      )}

      {/* Responses API 内置工具配置 */}
      {(currentModel.startsWith("gpt-5.4") ||
        currentModel.startsWith("gpt-5.5") ||
        supportsXaiToolControls) && (
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

          {/* 网络搜索配置（仅当启用时显示） */}
          {isGpt5ReasoningModel && props.modelConfig.enableWebSearch && (
            <>
              {/* 搜索位置国家 */}
              <ListItem
                title={Locale.Settings.GPT5Tools.WebSearchCountry.Title}
                subTitle={Locale.Settings.GPT5Tools.WebSearchCountry.SubTitle}
              >
                <Select
                  aria-label={Locale.Settings.GPT5Tools.WebSearchCountry.Title}
                  value={props.modelConfig.webSearchCountry ?? "US"}
                  onChange={(e) => {
                    props.updateConfig((config) => {
                      config.webSearchCountry = e.currentTarget.value;
                    });
                  }}
                >
                  <option value="US">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.US}
                  </option>
                  <option value="CN">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.CN}
                  </option>
                  <option value="GB">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.GB}
                  </option>
                  <option value="JP">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.JP}
                  </option>
                  <option value="DE">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.DE}
                  </option>
                  <option value="FR">
                    {Locale.Settings.GPT5Tools.WebSearchCountry.Options.FR}
                  </option>
                </Select>
              </ListItem>

              {/* 搜索上下文大小 */}
              <ListItem
                title={Locale.Settings.GPT5Tools.WebSearchContextSize.Title}
                subTitle={
                  Locale.Settings.GPT5Tools.WebSearchContextSize.SubTitle
                }
              >
                <Select
                  aria-label={
                    Locale.Settings.GPT5Tools.WebSearchContextSize.Title
                  }
                  value={props.modelConfig.webSearchContextSize ?? "medium"}
                  onChange={(e) => {
                    props.updateConfig((config) => {
                      config.webSearchContextSize = e.currentTarget.value as
                        | "low"
                        | "medium"
                        | "high";
                    });
                  }}
                >
                  <option value="low">
                    {Locale.Settings.GPT5Tools.WebSearchContextSize.Options.Low}
                  </option>
                  <option value="medium">
                    {
                      Locale.Settings.GPT5Tools.WebSearchContextSize.Options
                        .Medium
                    }
                  </option>
                  <option value="high">
                    {
                      Locale.Settings.GPT5Tools.WebSearchContextSize.Options
                        .High
                    }
                  </option>
                </Select>
              </ListItem>
            </>
          )}

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

          {/* 图像生成工具 */}
          {isGpt5ReasoningModel && supportsGpt5NativeImageGeneration && (
            <ListItem
              title={Locale.Settings.GPT5Tools.EnableImageGeneration.Title}
              subTitle={
                Locale.Settings.GPT5Tools.EnableImageGeneration.SubTitle
              }
            >
              <input
                aria-label={
                  Locale.Settings.GPT5Tools.EnableImageGeneration.Title
                }
                type="checkbox"
                checked={props.modelConfig.enableImageGeneration ?? false}
                onChange={(e) =>
                  props.updateConfig(
                    (config) =>
                      (config.enableImageGeneration = e.currentTarget.checked),
                  )
                }
              ></input>
            </ListItem>
          )}

          {/* 图像背景设置（仅当启用图像生成时显示） */}
          {isGpt5ReasoningModel &&
            supportsGpt5NativeImageGeneration &&
            props.modelConfig.enableImageGeneration && (
              <>
                <ListItem
                  title={Locale.Settings.GPT5Tools.ImageGenerationModel.Title}
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationModel.SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationModel.Title
                    }
                    value={currentGpt5ImageGenerationModel}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationModel = e.currentTarget.value as
                          | "gpt-image-2"
                          | "gpt-image-1"
                          | "gpt-image-1-mini"
                          | "gpt-image-1.5";
                      });
                    }}
                  >
                    {gpt5ImageGenerationModelOptions.map((model) => (
                      <option value={model} key={model}>
                        {model}
                      </option>
                    ))}
                  </Select>
                </ListItem>

                <ListItem
                  title={Locale.Settings.GPT5Tools.ImageGenerationAction.Title}
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationAction.SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationAction.Title
                    }
                    value={currentGpt5ImageGenerationAction}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationAction = e.currentTarget.value as
                          | "auto"
                          | "generate"
                          | "edit";
                      });
                    }}
                  >
                    {gpt5ImageGenerationActionOptions.map((action) => (
                      <option value={action} key={action}>
                        {
                          Locale.Settings.GPT5Tools.ImageGenerationAction
                            .Options[
                            action === "auto"
                              ? "Auto"
                              : action === "generate"
                              ? "Generate"
                              : "Edit"
                          ]
                        }
                      </option>
                    ))}
                  </Select>
                </ListItem>

                {imageSizes.length > 0 && (
                  <ListItem
                    title={Locale.Settings.GPT5Tools.ImageGenerationSize.Title}
                    subTitle={
                      Locale.Settings.GPT5Tools.ImageGenerationSize.SubTitle
                    }
                  >
                    <Select
                      aria-label={
                        Locale.Settings.GPT5Tools.ImageGenerationSize.Title
                      }
                      value={currentImageSize}
                      onChange={(e) => {
                        props.updateConfig((config) => {
                          config.size = e.currentTarget.value as ModelSize;
                        });
                      }}
                    >
                      {imageSizeOptions.map((size) => (
                        <option value={size} key={size}>
                          {size}
                        </option>
                      ))}
                    </Select>
                  </ListItem>
                )}

                <ListItem
                  title={Locale.Settings.GPT5Tools.ImageGenerationQuality.Title}
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationQuality.SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationQuality.Title
                    }
                    value={currentOpenAIImageQuality}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.quality = e.currentTarget.value as
                          | DalleQuality
                          | OpenAIImageQuality;
                      });
                    }}
                  >
                    {gptImageQualityOptions.map((quality) => (
                      <option value={quality} key={quality}>
                        {quality}
                      </option>
                    ))}
                  </Select>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationModeration.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationModeration.SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationModeration.Title
                    }
                    value={currentImageModeration}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.moderation = e.currentTarget
                          .value as ImageModeration;
                      });
                    }}
                  >
                    {gptImageModerationOptions.map((moderation) => (
                      <option value={moderation} key={moderation}>
                        {moderation}
                      </option>
                    ))}
                  </Select>
                </ListItem>

                <ListItem
                  title={Locale.Settings.GPT5Tools.ImageBackground.Title}
                  subTitle={Locale.Settings.GPT5Tools.ImageBackground.SubTitle}
                >
                  <Select
                    aria-label={Locale.Settings.GPT5Tools.ImageBackground.Title}
                    value={currentImageBackground}
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
                      {
                        Locale.Settings.GPT5Tools.ImageBackground.Options
                          .Transparent
                      }
                    </option>
                    <option value="opaque">
                      {Locale.Settings.GPT5Tools.ImageBackground.Options.Opaque}
                    </option>
                  </Select>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationOutputFormat.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationOutputFormat
                      .SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationOutputFormat
                        .Title
                    }
                    value={currentGpt5ImageGenerationOutputFormat}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationOutputFormat = e.currentTarget
                          .value as "png" | "webp" | "jpeg";
                      });
                    }}
                  >
                    {gpt5ImageGenerationOutputFormatOptions.map((format) => (
                      <option value={format} key={format}>
                        {
                          Locale.Settings.GPT5Tools.ImageGenerationOutputFormat
                            .Options[
                            format === "png"
                              ? "Png"
                              : format === "webp"
                              ? "Webp"
                              : "Jpeg"
                          ]
                        }
                      </option>
                    ))}
                  </Select>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationOutputCompression
                      .Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationOutputCompression
                      .SubTitle
                  }
                >
                  <InputRange
                    aria={
                      Locale.Settings.GPT5Tools.ImageGenerationOutputCompression
                        .Title
                    }
                    title={String(currentGpt5ImageGenerationOutputCompression)}
                    value={currentGpt5ImageGenerationOutputCompression}
                    min="0"
                    max="100"
                    step="1"
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationOutputCompression = Math.min(
                          100,
                          Math.max(0, e.currentTarget.valueAsNumber),
                        );
                      });
                    }}
                  ></InputRange>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationPartialImages.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationPartialImages
                      .SubTitle
                  }
                >
                  <InputRange
                    aria={
                      Locale.Settings.GPT5Tools.ImageGenerationPartialImages
                        .Title
                    }
                    title={String(currentGpt5ImageGenerationPartialImages)}
                    value={currentGpt5ImageGenerationPartialImages}
                    min="0"
                    max="3"
                    step="1"
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationPartialImages = Math.min(
                          3,
                          Math.max(0, e.currentTarget.valueAsNumber),
                        );
                      });
                    }}
                  ></InputRange>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationInputFidelity.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationInputFidelity
                      .SubTitle
                  }
                >
                  <Select
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationInputFidelity
                        .Title
                    }
                    value={currentGpt5ImageGenerationInputFidelity}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationInputFidelity = e.currentTarget
                          .value as "low" | "high";
                      });
                    }}
                  >
                    {gpt5ImageGenerationInputFidelityOptions.map((fidelity) => (
                      <option value={fidelity} key={fidelity}>
                        {
                          Locale.Settings.GPT5Tools.ImageGenerationInputFidelity
                            .Options[fidelity === "high" ? "High" : "Low"]
                        }
                      </option>
                    ))}
                  </Select>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationMaskFileId.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationMaskFileId.SubTitle
                  }
                >
                  <input
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationMaskFileId.Title
                    }
                    type="text"
                    placeholder={
                      Locale.Settings.GPT5Tools.ImageGenerationMaskFileId
                        .Placeholder
                    }
                    value={props.modelConfig.imageGenerationMaskFileId ?? ""}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationMaskFileId =
                          e.currentTarget.value;
                      });
                    }}
                  ></input>
                </ListItem>

                <ListItem
                  title={
                    Locale.Settings.GPT5Tools.ImageGenerationMaskImageUrl.Title
                  }
                  subTitle={
                    Locale.Settings.GPT5Tools.ImageGenerationMaskImageUrl
                      .SubTitle
                  }
                >
                  <input
                    aria-label={
                      Locale.Settings.GPT5Tools.ImageGenerationMaskImageUrl
                        .Title
                    }
                    type="text"
                    placeholder={
                      Locale.Settings.GPT5Tools.ImageGenerationMaskImageUrl
                        .Placeholder
                    }
                    value={props.modelConfig.imageGenerationMaskImageUrl ?? ""}
                    onChange={(e) => {
                      props.updateConfig((config) => {
                        config.imageGenerationMaskImageUrl =
                          e.currentTarget.value;
                      });
                    }}
                  ></input>
                </ListItem>
              </>
            )}
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

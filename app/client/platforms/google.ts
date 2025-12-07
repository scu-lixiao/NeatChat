import { ApiPath, Google, REQUEST_TIMEOUT_MS } from "@/app/constant";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  SpeechOptions,
} from "../api";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  // usePluginStore, // 已禁用外部插件支持，如需恢复请取消注释
  ChatMessageTool,
} from "@/app/store";
import {
  streamWithThink,
  parseGoogleResponse,
  wrapSVGInCodeBlock,
  parseImageConfig,
  ImageConfig,
} from "@/app/utils/chat";
import { getClientConfig } from "@/app/config/client";
import { GEMINI_BASE_URL } from "@/app/constant";

import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
} from "@/app/utils";
import { preProcessImageContent } from "@/app/utils/chat";
import { nanoid } from "nanoid";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class GeminiProApi implements LLMApi {
  path(path: string, shouldStream = false): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";
    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.googleUrl;
    }

    const isApp = !!getClientConfig()?.isApp;
    if (baseUrl.length === 0) {
      baseUrl = isApp ? GEMINI_BASE_URL : ApiPath.Google;
    }
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Google)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    let chatPath = [baseUrl, path].join("/");
    if (shouldStream) {
      chatPath += chatPath.includes("?") ? "&alt=sse" : "?alt=sse";
    }

    return chatPath;
  }
  extractMessage(res: any) {
    console.log("[Response] gemini-pro response: ", res);

    // 处理数组形式的响应（多个块）
    if (Array.isArray(res)) {
      // 合并所有文本块
      let fullText = "";
      for (const chunk of res) {
        const textPart = chunk?.candidates?.at(0)?.content?.parts?.at(0)?.text;
        if (textPart) {
          fullText += textPart;
        }
      }
      return fullText || "";
    }

    // 处理单个响应对象
    return (
      res?.candidates?.at(0)?.content?.parts.at(0)?.text ||
      res?.at(0)?.candidates?.at(0)?.content?.parts.at(0)?.text ||
      res?.error?.message ||
      ""
    );
  }
  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions): Promise<void> {
    const apiClient = this;
    let multimodal = false;

    // 添加联网状态日志
    const session = useChatStore.getState().currentSession();
    // console.log(
    //   "[Chat] Web Access:",
    //   session.mask?.plugin?.includes("googleSearch") ? "Enabled" : "Disabled",
    // );

    // {{CHENGQI:
    // Action: Added - 图片配置参数解析与多轮对话支持
    // Timestamp: 2025-11-21 Claude 4.5 sonnet
    // Reason: 支持用户通过输入文本自定义 imageConfig 参数,并在多轮对话中保持配置
    // Principle_Applied:
    //   - SOLID: 单一职责,解析逻辑独立
    //   - DRY: 复用解析函数
    //   - KISS: 简单的状态管理
    // Optimization: 仅针对图片生成模型进行解析,避免性能损耗
    // Architectural_Note (AR):
    //   - 解析后的配置将覆盖默认值
    //   - 多轮对话时保持上一轮的配置,除非用户另外指定
    //   - 配置存储在 session.lastImageConfig 中
    // Documentation_Note (DW):
    //   - 支持格式 "aspectRatio, imageSize" 如 "16:9, 4K"
    //   - 默认值: aspectRatio: "1:1", imageSize: "2K"
    // }}
    let imageConfigOverride: ImageConfig | null = null;

    // 提前获取 modelConfig 以判断模型类型
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    // {{CHENGQI:
    // Action: Enhanced - 图片配置参数解析与多轮对话支持
    // Timestamp: 2025-11-21 Claude 4.5 sonnet
    // Bug_Fixed:
    //   - 避免直接修改 options.messages,改为在创建 _messages 时处理
    //   - 使用 Zustand 的 updateTargetSession 方法更新状态
    // Principle_Applied:
    //   - Immutability: 不修改原始数据
    //   - Proper State Management: 使用 Zustand 的正确方法
    // }}
    let cleanedTextForLastMessage: string | null = null;

    // 检查是否为图片生成模型
    if (modelConfig.model === "gemini-3-pro-image-preview") {
      const lastMessage = options.messages[options.messages.length - 1];

      if (lastMessage && lastMessage.role === "user") {
        const textContent = getMessageTextContent(lastMessage);
        const { config, cleanedText } = parseImageConfig(textContent);

        if (config) {
          // 用户指定了新的配置
          imageConfigOverride = config;
          cleanedTextForLastMessage = cleanedText;

          // 保存配置到 session,供下一轮对话使用
          // 使用 Zustand 的 updateTargetSession 方法更新状态
          useChatStore.getState().updateTargetSession(session, (s) => {
            (s as any).lastImageConfig = config;
          });
        } else {
          // 用户未指定配置,尝试使用上一轮的配置
          imageConfigOverride = (session as any).lastImageConfig || null;
        }
      }
    }

    // try get base64image from local cache image_url
    const _messages: ChatOptions["messages"] = [];
    for (let i = 0; i < options.messages.length; i++) {
      const v = options.messages[i];
      let content = await preProcessImageContent(v.content);

      // 如果是最后一条消息且需要清理文本
      if (
        i === options.messages.length - 1 &&
        cleanedTextForLastMessage !== null
      ) {
        if (typeof content === "string") {
          content = cleanedTextForLastMessage;
        } else if (Array.isArray(content)) {
          // 处理 MultimodalContent[] 格式
          content = content.map((part) =>
            part.type === "text" && part.text
              ? { ...part, text: cleanedTextForLastMessage as string } // 类型断言,因为已检查 !== null
              : part,
          );
        }
      }

      _messages.push({ role: v.role, content });
    }

    // {{CHENGQI:
    // Action: Added - 提取系统消息用于 systemInstruction
    // Timestamp: 2025-12-01 Claude Opus 4.5
    // Reason: Google Gemini API 应该使用 system_instruction 字段传递系统提示词
    //   - 之前错误地将 system 角色转换为 user，放入 contents 数组
    //   - 正确做法是使用顶层的 system_instruction 字段
    // Reference: https://ai.google.dev/gemini-api/docs/system-instructions
    // Principle_Applied: 遵循 Google API 规范，提高系统指令效果
    // Bug_Fixed: 系统提示词被当作普通用户消息而非行为指导
    // }}
    // Step 1: 提取所有系统消息的内容
    const systemMessages = _messages.filter((v) => v.role === "system");
    const systemInstructionTexts = systemMessages
      .map((m) => getMessageTextContent(m))
      .filter((text) => text && text.length > 0);

    // Step 2: 过滤掉系统消息，只保留 user 和 assistant 消息
    const nonSystemMessages = _messages.filter((v) => v.role !== "system");

    // Step 3: 为非系统消息构建 contents 数组
    // 注意：这里的 index 是相对于 nonSystemMessages 的索引
    // 但 originalMessage 需要使用原始 options.messages 的对应消息
    // 创建一个映射来追踪原始索引
    const originalIndices: number[] = [];
    _messages.forEach((m, i) => {
      if (m.role !== "system") {
        originalIndices.push(i);
      }
    });

    const messages = nonSystemMessages.map((v, index) => {
      let parts: any[] = [{ text: getMessageTextContent(v) }];

      // {{CHENGQI:
      // Action: Refactored - 完全基于 googleParts 重建消息结构（方案二）
      // Timestamp: 2025-11-28 Claude Opus 4.5
      // Reason: 支持 Google Gemini API 的 thoughtSignature 多轮对话功能
      // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
      // Rules:
      //   - 图片生成/编辑: 第一个 part 和所有 inlineData parts 都必须有 thoughtSignature
      //   - 文本响应: 签名可选但推荐保留以提高推理质量
      // Principle_Applied: 完全基于 googleParts 重建，精确保持原始响应结构
      // Change_Summary:
      //   - 当有 googleParts 时，完全基于它重建整个 parts 数组
      //   - 对于 hasInlineData 的 parts，从消息 content 获取实际图像数据
      //   - 每个 part 都附加对应的 thoughtSignature
      // }}
      // 类型断言: options.messages 实际上是 ChatMessage[]，包含 googleParts
      // 使用 originalIndices 获取对应的原始消息
      const originalIndex = originalIndices[index];
      const originalMessage = options.messages[originalIndex] as any;

      // 标记是否已通过 googleParts 处理了图像
      let hasProcessedImagesWithGoogleParts = false;

      // {{CHENGQI:
      // Action: Added - 判断是否为 gemini-3-pro-image-preview 模型的历史消息
      // Timestamp: 2025-11-30 Claude Opus 4.5
      // Reason: 针对图像编辑模型的多轮对话，历史消息中不能包含 inline_data
      // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
      // Rules:
      //   - 历史消息：只需要 thoughtSignature，不需要 inline_data
      //   - 当前消息（最后一条用户消息）：正常处理
      //   - 模型通过 thoughtSignature 来"记住"之前生成的图像
      // Principle_Applied: 遵循 Google API 规范，避免上下文过大导致编辑失败
      // }}
      const isImagePreviewModel =
        modelConfig.model === "gemini-3-pro-image-preview";
      // 使用 nonSystemMessages 的长度判断历史消息
      const isHistoryModelMessage =
        index < nonSystemMessages.length - 1 && v.role === "assistant";

      if (v.role === "assistant" && originalMessage?.googleParts?.length > 0) {
        const googleParts = originalMessage.googleParts;

        // 获取消息中的所有图像数据（用于重建 inlineData parts）
        const images = getMessageImages(v);
        let imageIndex = 0;

        // 完全基于 googleParts 重建 parts 数组
        const rebuiltParts: any[] = [];

        googleParts.forEach((gp: any) => {
          // {{CHENGQI:
          // Action: Fixed - 跳过思考内容（thought: true 的 parts）
          // Timestamp: 2025-12-01 Claude Opus 4.5
          // Reason: 思考内容不应该作为上下文发送给 API
          //   - thought: true 的 parts 是模型的"思考摘要"，仅用于 UI 显示
          //   - thoughtSignature 是加密的推理上下文，必须保留
          //   - 发送思考内容会浪费 token 且可能影响模型行为
          // Reference: https://ai.google.dev/gemini-api/docs/thinking
          // Quote: "Thought summaries are synthesized versions of the model's raw thoughts
          //         and offer insights into the model's internal reasoning process."
          // Principle_Applied: 数据最小化，只发送 API 需要的信息
          // }}
          // 跳过思考内容（thought: true），但保留其签名
          if (gp.thought === true) {
            // 如果思考 part 有签名，创建一个只有签名的 part
            if (gp.thoughtSignature) {
              rebuiltParts.push({ thoughtSignature: gp.thoughtSignature });
              if (process.env.NODE_ENV === "development") {
                console.log(
                  "[Google ThoughtSignature] Preserved signature from thought part (skipped content)",
                );
              }
            }
            return; // 跳过思考内容
          }

          const partObj: any = {};

          // 1. 文本内容（非思考内容）
          if (gp.text !== undefined) {
            partObj.text = gp.text;
          }

          // 2. 图像数据处理
          // {{CHENGQI:
          // Action: Fixed - 针对 gemini-3-pro-image-preview 模型的历史消息跳过 inline_data
          // Timestamp: 2025-11-30 Claude Opus 4.5
          // Reason: 根据 Google API 规范，图像编辑模型的多轮对话中：
          //   - 历史消息只需要 thoughtSignature，不能包含 inline_data
          //   - 模型通过 thoughtSignature 来"记住"之前生成的图像
          //   - 包含 inline_data 会导致编辑请求失败
          // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
          // Bug_Fixed: 多轮图片编辑时，历史消息包含完整图像数据导致编辑失败
          // }}
          if (gp.hasInlineData && images.length > imageIndex) {
            // 检查是否应该跳过添加 inline_data
            // 条件：gemini-3-pro-image-preview 模型 + 历史 model 消息
            if (isImagePreviewModel && isHistoryModelMessage) {
              // 跳过添加 inline_data，只保留 thoughtSignature
              // 仍需移动索引以保持同步
              imageIndex++;
              // {{CHENGQI:
              // Action: Fixed - 设置 hasProcessedImagesWithGoogleParts 阻止默认图像添加逻辑
              // Timestamp: 2025-12-01 Claude Opus 4.5
              // Reason: 即使跳过 inline_data，也需要标记图像已处理，防止默认逻辑重新添加
              // Bug_Fixed: 历史消息的 inline_data 被默认的 isVisionModel 逻辑重新添加
              // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
              // }}
              hasProcessedImagesWithGoogleParts = true;
              // thoughtSignature 会在下方的步骤 3 中添加

              if (process.env.NODE_ENV === "development") {
                console.log(
                  "[Google ImagePreview] Skipping inline_data for history message:",
                  {
                    messageIndex: index,
                    hasSignature: !!gp.thoughtSignature,
                  },
                );
              }
            } else {
              // 正常情况：添加完整的图像数据
              const image = images[imageIndex++];
              const imageType = image.split(";")[0].split(":")[1];
              const imageData = image.split(",")[1];
              partObj.inline_data = {
                mime_type: imageType,
                data: imageData,
              };
              hasProcessedImagesWithGoogleParts = true;
            }
          }

          // 3. 签名（必须原样返回）
          if (gp.thoughtSignature) {
            partObj.thoughtSignature = gp.thoughtSignature;
          }

          // {{CHENGQI:
          // Action: Fixed - 修复过滤条件，保留只包含 thoughtSignature 的 parts
          // Timestamp: 2025-11-29 Claude Opus 4.5
          // Reason: 根据 Google API 文档，签名可能出现在空文本 part 中
          // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
          // Quote: "During a model response not containing a FC with a streaming request,
          //         the model may return the thought signature in a part with an empty text content part."
          // Bug_Fixed: 原条件 `partObj.text !== undefined || partObj.inline_data` 会丢弃只有签名的 parts
          // Principle_Applied: API 规范遵循，确保签名不丢失
          // }}
          // 只添加有效的 parts（有文本、有图像数据或有签名）
          if (
            partObj.text !== undefined ||
            partObj.inline_data ||
            partObj.thoughtSignature
          ) {
            rebuiltParts.push(partObj);
          }
        });

        // 如果成功重建了 parts，使用它们
        if (rebuiltParts.length > 0) {
          parts = rebuiltParts;

          if (process.env.NODE_ENV === "development") {
            console.log(
              "[Google ThoughtSignature] Rebuilt parts from googleParts:",
              {
                messageIndex: index,
                partsCount: parts.length,
                partsInfo: parts.map((p) => ({
                  hasText: !!p.text,
                  hasInlineData: !!p.inline_data,
                  hasSignature: !!p.thoughtSignature,
                  signatureLength: p.thoughtSignature?.length || 0,
                })),
              },
            );
          }
        }
      }

      // 只有在没有通过 googleParts 处理图像时，才走默认的图像添加逻辑
      if (
        !hasProcessedImagesWithGoogleParts &&
        isVisionModel(options.config.model)
      ) {
        const images = getMessageImages(v);
        if (images.length > 0) {
          multimodal = true;
          parts = parts.concat(
            images.map((image) => {
              const imageType = image.split(";")[0].split(":")[1];
              const imageData = image.split(",")[1];
              return {
                inline_data: {
                  mime_type: imageType,
                  data: imageData,
                },
              };
            }),
          );
        }
      }
      // {{CHENGQI:
      // Action: Modified - 移除对 system 角色的处理
      // Timestamp: 2025-12-01 Claude Opus 4.5
      // Reason: 系统消息已在上方被过滤并用于 system_instruction
      //   - 这里只需要处理 user 和 assistant 角色
      //   - assistant -> model (Google API 格式)
      //   - user 保持不变
      // Reference: https://ai.google.dev/gemini-api/docs/system-instructions
      // }}
      return {
        role: v.role === "assistant" ? "model" : "user",
        parts: parts,
      };
    });

    // google requires that role in neighboring messages must not be the same
    for (let i = 0; i < messages.length - 1; ) {
      // Check if current and next item both have the role "model"
      if (messages[i].role === messages[i + 1].role) {
        // Concatenate the 'parts' of the current and next item
        messages[i].parts = messages[i].parts.concat(messages[i + 1].parts);
        // Remove the next item
        messages.splice(i + 1, 1);
      } else {
        // Move to the next item
        i++;
      }
    }
    // if (visionModel && messages.length > 1) {
    //   options.onError?.(new Error("Multiturn chat is not enabled for models/gemini-pro-vision"));
    // }

    const accessStore = useAccessStore.getState();

    // {{CHENGQI:
    // Action: Added - 构建 system_instruction 字段
    // Timestamp: 2025-12-01 Claude Opus 4.5
    // Reason: 使用 Google Gemini API 的 system_instruction 传递系统指令
    // Reference: https://ai.google.dev/gemini-api/docs/system-instructions
    // Format: { "parts": [{ "text": "系统指令内容" }] }
    // Principle_Applied: 遵循 Google API 规范
    // }}
    // modelConfig 已在上方定义,此处移除重复定义
    const requestPayload: any = {
      // 如果有系统指令，添加 system_instruction 字段
      ...(systemInstructionTexts.length > 0 && {
        system_instruction: {
          parts: [{ text: systemInstructionTexts.join("\n") }],
        },
      }),
      contents: messages,
      generationConfig: {
        temperature: modelConfig.temperature,
        maxOutputTokens: modelConfig.max_tokens,
        topP: modelConfig.top_p,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_CIVIC_INTEGRITY",
          threshold: accessStore.googleSafetySettings,
        },
      ],
    };

    // 强制添加 tools 参数
    if (modelConfig.model === "gemini-2.5-pro") {
      (requestPayload as any).tools = [
        {
          google_search: {},
        },
      ];
    } else if (modelConfig.model === "gemini-3-pro-preview") {
      // {{CHENGQI:
      // Action: Fixed - 修复 code_execution 不触发的问题
      // Timestamp: 2025-11-27 Claude Opus 4.5
      // Reason: 根据 Google 官方文档，code_execution 只能与 googleSearch 组合使用
      // Bug_Fixed: 移除 urlContext，只保留 googleSearch 和 code_execution
      // Reference: https://ai.google.dev/gemini-api/docs/code-execution#supported-tools-combinations
      // Principle_Applied: 遵循 API 文档规范
      // }}
      (requestPayload as any).tools = [
        {
          googleSearch: {},
        },
        {
          url_context: {},
        },
        {
          code_execution: {},
        },
      ];
    }

    // 添加思考模式配置（仅限支持的模型）
    if (modelConfig.model === "gemini-2.5-flash-preview-05-20") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: 24576,
      };
    } else if (modelConfig.model === "gemini-2.5-pro-preview-06-05") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: 32768,
      };
    } else if (modelConfig.model === "gemini-2.5-pro") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: 32768,
      };
    } else if (modelConfig.model === "gemini-3-pro-preview") {
      (requestPayload as any).generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinking_level: "high",
      };
    }

    // {{CHENGQI:
    // Action: Fixed - 修复 generationConfig 覆盖问题
    // Timestamp: 2025-11-21 Claude 4.5 sonnet
    // Reason: 之前的代码完全覆盖了 generationConfig,导致 thinkingConfig 和基础配置丢失
    // Principle_Applied:
    //   - Immutability: 使用对象展开语法合并配置
    //   - Defensive Programming: 保护现有配置不被意外覆盖
    // Bug_Fixed:
    //   - 思考内容无法提取的根本原因
    //   - temperature, maxOutputTokens, topP 等配置丢失
    // }}
    if (
      modelConfig.model === "gemini-3-pro-preview" ||
      modelConfig.model === "gemini-3-pro-image-preview"
    ) {
      (requestPayload as any).generationConfig = {
        ...(requestPayload as any).generationConfig, // 保留现有配置
        media_resolution: "MEDIA_RESOLUTION_HIGH",
      };
    }

    if (modelConfig.model === "gemini-3-pro-image-preview") {
      (requestPayload as any).tools = [
        {
          googleSearch: {},
        },
      ];

      // {{CHENGQI:
      // Action: Enhanced - 动态 imageConfig 配置
      // Timestamp: 2025-11-21 Claude 4.5 sonnet
      // Reason: 使用解析的配置或默认值 (1:1, 2K)
      // Principle_Applied:
      //   - DRY: 复用解析结果
      //   - KISS: 简单的条件判断
      //   - Immutability: 使用对象展开语法合并配置
      // Optimization: 优先使用用户指定的配置,其次使用上一轮配置,最后使用默认值
      // Architectural_Note (AR):
      //   - 默认值从 16:9, 4K 改为 1:1, 2K
      //   - 支持多轮对话配置保持
      // Documentation_Note (DW):
      //   - imageConfigOverride 来自用户输入解析或上一轮配置
      //   - 默认值: aspectRatio: "1:1", imageSize: "2K"
      // Bug_Fixed:
      //   - 修复 generationConfig 覆盖问题,保留 thinkingConfig 和基础配置
      // }}
      const finalImageConfig = imageConfigOverride || {
        aspectRatio: "1:1",
        imageSize: "2K",
      };

      (requestPayload as any).generationConfig = {
        ...(requestPayload as any).generationConfig, // 保留现有配置
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: finalImageConfig,
      };
    }
    // 其他模型不添加 thinkingConfig 参数

    // 强制非流式的模型判断
    // 1. 图片生成模型 (包含 -image- 或以 -image 结尾)
    const isImageGenerationModel =
      modelConfig.model.includes("-image-") ||
      modelConfig.model.endsWith("-image");

    // 2. 明确指定的非流式模型列表
    const forceNonStreamModels = [
      "gemini-3-pro-image-preview",
      "gemini-2.0-flash-exp-image-generation",
      // 可以在这里添加其他需要强制非流式的模型
    ];

    // 判断是否应该使用流式
    const isForceNonStream =
      isImageGenerationModel ||
      forceNonStreamModels.includes(modelConfig.model);
    let shouldStream = !isForceNonStream && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    // {{CHENGQI:
    // Action: Modified - 将 requestTimeoutId 移到 try 块外部
    // Timestamp: 2025-11-23 Claude 4.5 sonnet
    // Reason: 确保在 finally 块中可以清除超时
    // }}
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // https://github.com/google-gemini/cookbook/blob/main/quickstarts/rest/Streaming_REST.ipynb
      const chatPath = this.path(
        Google.ChatPath(modelConfig.model),
        shouldStream,
      );

      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // {{CHENGQI:
      // Action: Enhanced - 完整的请求体日志用于调试 thoughtSignature
      // Timestamp: 2025-11-28 Claude Opus 4.5
      // Reason: 方便开发者验证 thoughtSignature 是否正确附加到请求中
      // Principle_Applied: 可调试性，便于问题排查
      // Note: 只在开发模式下打印，生产环境不会输出
      // }}
      // DEBUG: 打印请求 payload 以验证 tools 和 thoughtSignature 配置
      if (process.env.NODE_ENV === "development") {
        console.log("[Google API Request] Model:", modelConfig.model);
        // {{CHENGQI:
        // Action: Added - 打印 system_instruction 用于调试
        // Timestamp: 2025-12-01 Claude Opus 4.5
        // Reason: 验证系统指令是否正确传递
        // }}
        if (requestPayload.system_instruction) {
          console.log(
            "[Google API Request] SystemInstruction:",
            JSON.stringify(requestPayload.system_instruction, null, 2),
          );
        }
        console.log(
          "[Google API Request] Tools:",
          JSON.stringify((requestPayload as any).tools, null, 2),
        );
        console.log(
          "[Google API Request] GenerationConfig:",
          JSON.stringify((requestPayload as any).generationConfig, null, 2),
        );

        // 打印完整的请求体（用于调试 thoughtSignature）
        // 为了安全，截断过长的 base64 数据
        const sanitizedPayload = JSON.parse(JSON.stringify(requestPayload));
        if (sanitizedPayload.contents) {
          sanitizedPayload.contents.forEach((content: any, index: number) => {
            if (content.parts) {
              content.parts.forEach((part: any, partIndex: number) => {
                // 截断 inlineData 的 data 字段
                if (
                  part.inline_data?.data &&
                  part.inline_data.data.length > 100
                ) {
                  part.inline_data.data =
                    part.inline_data.data.substring(0, 100) + "...[truncated]";
                }
                if (
                  part.inlineData?.data &&
                  part.inlineData.data.length > 100
                ) {
                  part.inlineData.data =
                    part.inlineData.data.substring(0, 100) + "...[truncated]";
                }
              });
            }
          });
        }
        console.log(
          "[Google API Request] Full RequestBody:",
          JSON.stringify(sanitizedPayload, null, 2),
        );

        // 特别标注包含 thoughtSignature 的 parts
        const partsWithSignatures =
          sanitizedPayload.contents?.flatMap(
            (content: any, contentIndex: number) =>
              content.parts
                ?.filter((part: any) => part.thoughtSignature)
                .map((part: any) => ({
                  contentIndex,
                  role: content.role,
                  hasText: !!part.text,
                  hasInlineData: !!part.inlineData || !!part.inline_data,
                  signatureLength: part.thoughtSignature?.length || 0,
                })) || [],
          ) || [];

        if (partsWithSignatures.length > 0) {
          console.log(
            "[Google API Request] Parts with thoughtSignature:",
            JSON.stringify(partsWithSignatures, null, 2),
          );
        }
      }

      // make a fetch request
      requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      if (shouldStream) {
        // {{CHENGQI:
        // Action: Disabled - 禁用外部插件工具，仅使用 Google 内部工具
        // Timestamp: 2025-11-27 Claude 4.5 sonnet
        // Reason: 外部插件工具可能干扰 Google 内部工具 (googleSearch, code_execution, urlContext) 的使用
        // Principle_Applied:
        //   - KISS: 简单直接地禁用外部工具
        //   - Single Responsibility: Google 供应商专注于使用 Google 内部工具
        // Architectural_Note (AR):
        //   - Google 内部工具已在 requestPayload.tools 中配置
        //   - 传入空的 funcs 对象，确保不会执行任何外部工具
        //   - 如需恢复外部插件支持，取消注释下方代码即可
        // Documentation_Note (DW):
        //   - 原代码: const [tools, funcs] = usePluginStore.getState().getAsTools(...)
        //   - 现在: funcs 为空对象，禁用所有外部插件
        // }}
        // 原外部插件获取代码 (已禁用):
        // const [tools, funcs] = usePluginStore
        //   .getState()
        //   .getAsTools(
        //     useChatStore.getState().currentSession().mask?.plugin || [],
        //   );
        const funcs: Record<string, Function> = {}; // 空对象，禁用外部工具

        // 用于收集引用
        const collectedCitations: Array<{ title: string; url: string }> = [];
        // {{CHENGQI:
        // Action: Added - 收集 Google Parts 用于 thoughtSignature 多轮对话
        // Timestamp: 2025-11-28 Claude Opus 4.5
        // Reason: 支持 Google Gemini API 的 thoughtSignature 多轮对话功能
        // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
        // Principle_Applied: 收集所有包含签名的 parts，在 onFinish 时传递给 store
        // }}
        const collectedGoogleParts: Array<{
          text?: string;
          thought?: boolean;
          thoughtSignature?: string;
          hasInlineData?: boolean;
          inlineData?: { mimeType: string };
        }> = [];

        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          [{ googleSearch: {} }], // 强制使用 google_search tools
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const chunkJson = JSON.parse(text);

            // 提取引用信息
            if (
              chunkJson?.candidates?.[0]?.groundingMetadata?.groundingChunks
            ) {
              const chunks =
                chunkJson.candidates[0].groundingMetadata.groundingChunks;
              // console.log("[Google Citations] Found grounding chunks:", chunks);

              const citations = chunks
                .filter((chunk: any) => chunk.web?.uri)
                .map((chunk: any) => ({
                  title: chunk.web.title || chunk.web.uri,
                  url: chunk.web.uri,
                }))
                .filter(
                  (citation: any) =>
                    citation.url && citation.url.trim().length > 0,
                );

              if (citations.length > 0) {
                // console.log("[Google Citations] Extracted citations:", citations);
                citations.forEach(
                  (citation: { title: string; url: string }) => {
                    if (
                      !collectedCitations.some((c) => c.url === citation.url)
                    ) {
                      collectedCitations.push(citation);
                    }
                  },
                );
                // console.log("[Google Citations] Total collected citations:", collectedCitations);
              }
            }

            // ============================================================
            // 🔥 FIXED: 安全的 FunctionCall 处理逻辑
            // ============================================================
            const candidate = chunkJson?.candidates?.at(0);
            const firstPart = candidate?.content?.parts?.at(0);

            // 分离思考内容和正文内容
            let thinkingContent = "";
            let regularContent = "";
            let hasThinking = false;

            if (chunkJson?.candidates?.[0]?.content?.parts) {
              const parts = chunkJson.candidates[0].content.parts;

              // 调试日志：打印所有 parts 的类型 (更详细的日志)
              if (process.env.NODE_ENV === "development") {
                const partTypes = parts.map((p: any) =>
                  Object.keys(p).filter(
                    (k) => p[k] !== undefined && p[k] !== null,
                  ),
                );
                // 记录所有 part 类型，不只是 code_execution
                console.log(
                  "[Google parseSSE] All parts types:",
                  JSON.stringify(partTypes),
                );
                if (
                  partTypes.some((types: string[]) =>
                    types.includes("functionCall"),
                  )
                ) {
                  console.log(
                    "[Google parseSSE] FunctionCall detected in parts:",
                    JSON.stringify(parts.filter((p: any) => p.functionCall)),
                  );
                }
              }

              parts.forEach((part: any) => {
                // {{CHENGQI:
                // Action: Enhanced - 完整收集所有 parts（方案一）
                // Timestamp: 2025-11-29 Claude Opus 4.5
                // Reason: 根据 Google API 文档，响应中可能包含没有签名的中间 text parts
                // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
                // Bug_Fixed: 原实现只收集有签名的 parts，导致多轮图片编辑时消息结构不完整
                // Change_Summary: 收集所有 parts，无论是否有签名，以保持完整的消息结构
                // Principle_Applied: 完整性优先，符合 Google API 规范
                // }}
                // 检查所有可能的签名字段（驼峰和蛇形命名）
                const signature =
                  part.thoughtSignature || part.thought_signature;

                // 收集所有 parts 信息（不仅仅是有签名的）
                // 这对于图片生成/编辑的多轮对话至关重要
                const googlePart: any = {};

                if (part.text !== undefined) {
                  googlePart.text = part.text;
                }
                if (part.thought !== undefined) {
                  googlePart.thought = part.thought;
                }
                if (part.inlineData) {
                  googlePart.hasInlineData = true;
                  googlePart.inlineData = {
                    mimeType: part.inlineData.mimeType,
                  };
                }
                // 签名可能不存在于某些 parts（如中间的 text parts）
                if (signature) {
                  googlePart.thoughtSignature = signature;
                }

                // 只添加有实质内容的 parts（有文本、有图像或有签名）
                // 使用唯一标识符避免重复添加（基于内容和签名）
                const partKey = `${googlePart.text || ""}_${
                  googlePart.hasInlineData || false
                }_${signature || ""}`;
                if (
                  (googlePart.text !== undefined ||
                    googlePart.hasInlineData ||
                    googlePart.thoughtSignature) &&
                  !collectedGoogleParts.some(
                    (p) =>
                      `${p.text || ""}_${p.hasInlineData || false}_${
                        p.thoughtSignature || ""
                      }` === partKey,
                  )
                ) {
                  collectedGoogleParts.push(googlePart);
                  if (process.env.NODE_ENV === "development") {
                    console.log("[Google ThoughtSignature] Collected part:", {
                      hasText: !!googlePart.text,
                      hasInlineData: !!googlePart.hasInlineData,
                      hasSignature: !!googlePart.thoughtSignature,
                      signatureLength: signature?.length || 0,
                    });
                  }
                }

                // 1. 处理普通文本
                if (part.text) {
                  if (part.thought === true) {
                    thinkingContent += part.text;
                    hasThinking = true;
                  } else {
                    regularContent += part.text;
                  }
                }

                // 🔥 2. 新增: 处理代码执行 (Executable Code) -> 视为思考过程
                // 注意: Google REST API 返回的字段是蛇形命名 (executable_code)
                // 但 JavaScript JSON.parse 后会保持原样，需要使用蛇形命名访问
                if (part.executable_code) {
                  const lang = (
                    part.executable_code.language || "python"
                  ).toLowerCase();
                  const code = part.executable_code.code; // Fixed: 修复拼写错误 eexecutable_code → executable_code
                  if (process.env.NODE_ENV === "development") {
                    console.log(
                      "[Google Code Execution] Executable code detected:",
                      { lang, codeLength: code?.length },
                    );
                  }
                  // 将代码包装成 Markdown 格式，算作思维的一部分
                  thinkingContent += `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
                  hasThinking = true;
                }

                // 🔥 3. 新增: 处理代码执行结果 (Execution Result) -> 视为思考过程
                // 注意: Google REST API 返回的字段是蛇形命名 (code_execution_result)
                if (part.code_execution_result) {
                  const output = part.code_execution_result.output;
                  const outcome = part.code_execution_result.outcome; // Fixed: 修复拼写错误 ccode_execution_result → code_execution_result
                  if (process.env.NODE_ENV === "development") {
                    console.log(
                      "[Google Code Execution] Execution result detected:",
                      { outcome, outputLength: output?.length },
                    );
                  }
                  // 将结果包装显示，体现"观察"过程
                  thinkingContent += `\n> ⚙️ **Execution Output** (${outcome}):\n\`\`\`text\n${output}\n\`\`\`\n`;
                  hasThinking = true;
                }
              });

              // {{CHENGQI:
              // Action: Fixed - 将 functionCall 处理移到 forEach 外部
              // Timestamp: 2025-11-27 Claude 4.5 sonnet
              // Reason: 修复 code_execution 内容被截断的问题
              // Bug_Fixed:
              //   - functionCall 处理逻辑原本错误地放在 parts.forEach 内部
              //   - 导致每次循环都会执行 functionCall 检查，影响 thinkingContent 的收集
              //   - 移到 forEach 外部后，确保所有 parts 都被完整遍历
              // Principle_Applied:
              //   - Separation of Concerns: 不同类型的 part 处理逻辑分离
              //   - Single Responsibility: forEach 只负责遍历和收集内容
              // }}
              // 4. 获取 functionCall (如果存在) - 在 forEach 外部处理
              if (firstPart && firstPart.functionCall) {
                const { name, args } = firstPart.functionCall;
                // {{CHENGQI:
                // Action: Added - 提取 thoughtSignature 用于多步函数调用
                // Timestamp: 2025-11-28 Claude Opus 4.5
                // Reason: 根据 Google Gemini API 文档，thoughtSignature 必须在后续请求中原样返回
                // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
                // Principle_Applied: 遵循 API 规范，确保函数调用链路的完整性
                // }}
                const thoughtSignature = firstPart.thoughtSignature;

                // {{CHENGQI:
                // Action: Fixed - 正确处理 Google 内置工具 (code_execution, google_search)
                // Timestamp: 2025-11-27 Claude Opus 4.5
                // Reason: Google 内置工具会通过 functionCall 触发，但不需要本地实现
                // Bug_Fixed:
                //   - code_execution 返回 functionCall.name = "google:code_execution"
                //   - 但它的结果通过 executable_code/code_execution_result 返回
                //   - 不应该被 Ghost Tool Blocked 逻辑拦截
                // Principle_Applied: 区分内置工具和外部工具
                // }}
                // Google 内置工具名称前缀检查
                const isGoogleBuiltInTool =
                  name.startsWith("google:") ||
                  name === "code_execution" ||
                  name === "google_search" ||
                  name === "googleSearch";

                if (isGoogleBuiltInTool) {
                  // Google 内置工具 - 不需要本地实现，跳过 functionCall 处理
                  // 结果会通过其他字段返回 (executable_code, code_execution_result, groundingMetadata 等)
                  if (process.env.NODE_ENV === "development") {
                    console.log(
                      `[Google Built-in Tool] '${name}' invoked - results will come through dedicated fields`,
                    );
                  }
                } else if (
                  funcs &&
                  name in funcs &&
                  typeof (funcs as Record<string, any>)[name] === "function"
                ) {
                  // 外部工具 - 需要本地实现
                  // {{CHENGQI:
                  // Action: Enhanced - 在 runTools 中保存 thoughtSignature
                  // Timestamp: 2025-11-28 Claude Opus 4.5
                  // Reason: 为 processToolMessage 提供 thoughtSignature 以便传递给后续 API 请求
                  // }}
                  runTools.push({
                    id: nanoid(),
                    type: "function",
                    function: {
                      name,
                      // 兼容处理: Google 有时返回对象有时返回字符串
                      arguments:
                        typeof args === "string" ? args : JSON.stringify(args),
                    },
                    thoughtSignature, // 保存 thoughtSignature 用于后续请求
                  });
                } else {
                  // 🔍 Debug: 未知工具
                  if (process.env.NODE_ENV === "development") {
                    console.warn(
                      `[Ghost Tool Blocked] Model tried to call '${name}' but no local implementation found. Ignoring.`,
                    );
                  }
                }
              }
            }

            // 处理图像数据
            const part = chunkJson?.candidates?.at(0)?.content?.parts?.at(0);
            if (part?.inlineData) {
              // 检查是否有多个部分
              const parts = chunkJson?.candidates?.at(0)?.content?.parts;
              let textContent = "";

              // 查找其他部分中的文本内容
              if (parts && parts.length > 1) {
                for (let i = 1; i < parts.length; i++) {
                  if (parts[i].text) {
                    textContent += parts[i].text;
                  }
                }
              }

              // 返回 MultimodalContent[] 格式 (与 OpenAI DALL-E 3 一致)
              const imageContent: any[] = [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                  },
                },
              ];

              // 如果有文本描述,添加到数组中
              if (textContent) {
                imageContent.push({
                  type: "text",
                  text: textContent,
                });
              }

              return {
                isThinking: false,
                content: imageContent,
              };
            }

            // {{CHENGQI:
            // Action: Fixed - 支持混合内容块返回
            // Timestamp: 2025-11-24 Claude 4.5 sonnet
            // Reason: 修复 Gemini API 在同一块中返回思考和正文内容时，正文内容被丢弃的问题
            // Principle_Applied: Robustness - 返回所有提取的内容
            // }}
            const resultChunks = [];
            if (hasThinking && thinkingContent) {
              if (process.env.NODE_ENV === "development") {
                console.log(
                  "[Google parseSSE] returning thinking content:",
                  thinkingContent.length,
                  "chars",
                );
              }
              resultChunks.push({
                isThinking: true,
                content: thinkingContent,
              });
            }

            if (regularContent) {
              if (process.env.NODE_ENV === "development") {
                console.log(
                  "[Google parseSSE] returning regular content:",
                  regularContent.length,
                  "chars",
                );
              }
              resultChunks.push({
                isThinking: false,
                content: regularContent,
              });
            }

            if (resultChunks.length > 0) {
              // 🔍 调试日志：显示 code_execution 内容
              if (process.env.NODE_ENV === "development") {
                const hasCodeExecution = resultChunks.some(
                  (c) =>
                    c.isThinking &&
                    c.content &&
                    (c.content.includes("```") ||
                      c.content.includes("Execution Output")),
                );
                if (hasCodeExecution) {
                  console.log(
                    "[Google Code Execution] Returning thinking chunks:",
                    resultChunks
                      .filter((c) => c.isThinking)
                      .map((c) => ({
                        length: c.content?.length,
                        preview: c.content?.substring(0, 200),
                      })),
                  );
                }
              }
              return resultChunks;
            }

            // 返回空内容以保持连接或更新状态
            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          // {{CHENGQI:
          // Action: Enhanced - 添加 thoughtSignature 支持到 processToolMessage
          // Timestamp: 2025-11-28 Claude Opus 4.5
          // Reason: 根据 Google Gemini API 文档，thoughtSignature 必须在后续请求中原样返回
          // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
          // Rules:
          //   - 单函数调用：functionCall 部分包含 thoughtSignature，必须返回
          //   - 并行函数调用：只有第一个 functionCall 包含签名
          //   - 多步函数调用：每个步骤的 functionCall 都有签名，必须全部返回
          // Principle_Applied: 遵循 API 规范，确保函数调用链路的完整性
          // }}
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // @ts-ignore
            requestPayload?.contents?.splice(
              // @ts-ignore
              requestPayload?.contents?.length,
              0,
              {
                role: "model",
                parts: toolCallMessage.tool_calls.map(
                  (tool: ChatMessageTool, index: number) => {
                    const partObj: any = {
                      functionCall: {
                        name: tool?.function?.name,
                        args: JSON.parse(tool?.function?.arguments as string),
                      },
                    };
                    // 按照 Google API 规则：只有第一个 functionCall 需要签名（并行调用情况）
                    // 对于顺序调用，每个都有自己的签名
                    if (tool.thoughtSignature) {
                      partObj.thoughtSignature = tool.thoughtSignature;
                    }
                    return partObj;
                  },
                ),
              },
              // @ts-ignore
              ...toolCallResult.map((result) => ({
                role: "function",
                parts: [
                  {
                    functionResponse: {
                      name: result.name,
                      response: {
                        name: result.name,
                        content: result.content, // TODO just text content...
                      },
                    },
                  },
                ],
              })),
            );
          },
          {
            ...options,
            onFinish: (message: string, res: Response) => {
              // Pass citations to the callback if available
              // console.log("[Google Citations] onFinish - collectedCitations:", collectedCitations);
              if (collectedCitations.length > 0 && options.onCitations) {
                // console.log("[Google Citations] Calling onCitations with:", collectedCitations);
                options.onCitations(collectedCitations);
              }
              // {{CHENGQI:
              // Action: Added - 传递 Google Parts 用于 thoughtSignature 多轮对话
              // Timestamp: 2025-11-28 Claude Opus 4.5
              // Reason: 将收集到的 thoughtSignature 传递给 store 保存
              // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
              // }}
              if (collectedGoogleParts.length > 0 && options.onGoogleParts) {
                if (process.env.NODE_ENV === "development") {
                  console.log(
                    "[Google ThoughtSignature] onFinish - collected parts:",
                    collectedGoogleParts.length,
                  );
                }
                options.onGoogleParts(collectedGoogleParts);
              }
              options.onFinish(message, res);
            },
            onThinkingUpdate: options.onThinkingUpdate,
          },
        );
      } else {
        // {{CHENGQI:
        // Action: Enhanced - 非流式响应完整处理
        // Timestamp: 2025-11-20 Claude 4.5 sonnet
        // Reason: 修复非流式响应无法处理思考内容、图像数据和引用信息的问题
        // Principle_Applied:
        //   - SOLID: 使用专门的解析函数处理响应
        //   - DRY: 复用 parseGoogleResponse 统一解析逻辑
        // Optimization: 完整处理所有响应字段,调用所有必要的回调
        // Architectural_Note (AR): 非流式处理与流式处理功能对齐
        // Documentation_Note (DW): 支持思考内容、图像数据、引用信息的完整处理
        // }}
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);
        const resJson = await res.json();

        // {{CHENGQI:
        // Action: Added - 非流式响应详细调试日志
        // Timestamp: 2025-11-28 Claude Opus 4.5
        // Reason: 诊断 gemini-3-pro-image-preview 模型的 thoughtSignature 提取问题
        // Principle_Applied: 可调试性，便于问题排查
        // }}
        if (process.env.NODE_ENV === "development") {
          console.log("[Google Non-Streaming] Raw response structure:");
          console.log(
            "[Google Non-Streaming] Has candidates:",
            !!resJson?.candidates,
          );
          console.log(
            "[Google Non-Streaming] Candidates count:",
            resJson?.candidates?.length || 0,
          );

          const parts = resJson?.candidates?.[0]?.content?.parts || [];
          console.log("[Google Non-Streaming] Total parts:", parts.length);

          parts.forEach((part: any, index: number) => {
            const keys = Object.keys(part);
            console.log(`[Google Non-Streaming] Part[${index}] keys:`, keys);

            // 检查所有可能的签名字段名
            const hasThoughtSignature = !!part.thoughtSignature;
            const hasThoughtSignatureSnake = !!part.thought_signature;
            console.log(
              `[Google Non-Streaming] Part[${index}] thoughtSignature (camelCase):`,
              hasThoughtSignature,
              hasThoughtSignature
                ? `length=${part.thoughtSignature.length}`
                : "",
            );
            console.log(
              `[Google Non-Streaming] Part[${index}] thought_signature (snake_case):`,
              hasThoughtSignatureSnake,
              hasThoughtSignatureSnake
                ? `length=${part.thought_signature.length}`
                : "",
            );

            // 显示其他关键字段
            console.log(
              `[Google Non-Streaming] Part[${index}] has text:`,
              !!part.text,
              part.text ? `length=${part.text.length}` : "",
            );
            console.log(
              `[Google Non-Streaming] Part[${index}] has inlineData:`,
              !!part.inlineData,
              part.inlineData ? `mimeType=${part.inlineData.mimeType}` : "",
            );
          });
        }

        // 检查安全过滤
        if (resJson?.promptFeedback?.blockReason) {
          options.onError?.(
            new Error(
              "Message is being blocked for reason: " +
                resJson.promptFeedback.blockReason,
            ),
          );
          return;
        }

        // 使用统一的解析函数处理响应
        const parsed = parseGoogleResponse(resJson);

        // 调用思考内容回调
        if (parsed.thinkingContent && options.onThinkingUpdate) {
          options.onThinkingUpdate(
            parsed.thinkingContent,
            parsed.thinkingContent,
          );
        }

        // 调用引用信息回调
        if (parsed.citations.length > 0 && options.onCitations) {
          options.onCitations(parsed.citations);
        }

        // {{CHENGQI:
        // Action: Added - 传递 Google Parts 用于 thoughtSignature 多轮对话
        // Timestamp: 2025-11-28 Claude Opus 4.5
        // Reason: 将解析到的 thoughtSignature 传递给 store 保存
        // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
        // }}
        if (
          parsed.googleParts &&
          parsed.googleParts.length > 0 &&
          options.onGoogleParts
        ) {
          if (process.env.NODE_ENV === "development") {
            console.log(
              "[Google ThoughtSignature] Non-streaming - googleParts:",
              parsed.googleParts.length,
            );
          }
          options.onGoogleParts(parsed.googleParts);
        }

        // 处理最终消息内容
        let message: string | any[];
        if (parsed.imageData) {
          // 如果有图像数据,返回 MultimodalContent[] 格式 (与 OpenAI DALL-E 3 一致)
          message = [
            {
              type: "image_url",
              image_url: {
                url: parsed.imageData.data,
              },
            },
          ];

          // 如果有文本描述,添加到数组中
          if (parsed.imageData.text) {
            message.push({
              type: "text",
              text: parsed.imageData.text,
            });
          }
        } else if (parsed.regularContent) {
          // 正文内容 (自动包裹 SVG 为代码块)
          message = wrapSVGInCodeBlock(parsed.regularContent);
        } else if (parsed.error) {
          // 错误信息
          message = parsed.error;
        } else {
          // 空响应
          message = "";
        }

        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    } finally {
      // {{CHENGQI:
      // Action: Added - 确保资源清理的 finally 块
      // Timestamp: 2025-11-23 Claude 4.5 sonnet
      // Reason: 无论成功或失败，都确保控制器被清理
      // Principle_Applied: 防御性编程，资源释放保证
      // }}
      // 清除超时定时器（如果还在运行）
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }
  usage(): Promise<LLMUsage> {
    throw new Error("Method not implemented.");
  }
  async models(): Promise<LLMModel[]> {
    return [];
  }
}

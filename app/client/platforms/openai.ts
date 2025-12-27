"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_BASE_URL,
  DEFAULT_MODELS,
  OpenaiPath,
  Azure,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
  usePluginStore,
} from "@/app/store";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
  streamWithThink,
} from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { ModelSize, DalleQuality, DalleStyle } from "@/app/typing";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  isVisionModel,
  isDalle3 as _isDalle3,
  getTimeoutMSByModel,
  isGPT5ImageGenModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface RequestPayload {
  messages: {
    role: "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  model: string;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

// OpenAI Responses API 类型定义
export interface ResponsesInputItem {
  role: "user" | "assistant" | "developer" | "system";
  content: string | MultimodalContent[];
  type?: "message";
}

export interface ResponsesRequestPayload {
  model: string;
  input: ResponsesInputItem[] | string;
  instructions?: string; // 替代 system message
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  tools?: (ResponsesTool | ResponsesBuiltinTool)[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; name: string };
  previous_response_id?: string; // 用于多轮对话引用
  reasoning?: {
    effort?: "none" | "low" | "medium" | "high" | "xhigh";
    summary?: "auto" | "none" | "concise" | "detailed";
  };
}

export interface ResponsesTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

// GPT-5.2 图像生成工具类型
export interface ResponsesImageGenerationTool {
  type: "image_generation";
  // 可选配置参数
  background?: "transparent" | "opaque" | "auto";
  quality?: "low" | "medium" | "high";
  size?: ModelSize;
}

// OpenAI 内置 web_search 工具类型
// 参考: https://platform.openai.com/docs/guides/tools-web-search
export interface ResponsesWebSearchTool {
  type: "web_search";
  // web_search 工具当前无额外配置参数
}

// OpenAI 内置 code_interpreter 工具类型
// 参考: https://platform.openai.com/docs/guides/tools-code-interpreter
// 代码解释器允许模型执行 Python 代码进行计算、数据分析等
export interface ResponsesCodeInterpreterTool {
  type: "code_interpreter";
  // 可选: 容器配置（默认使用 OpenAI 管理的容器）
  container?: {
    type: "auto" | "custom";
    // 自定义容器配置（可选）
  };
}

// OpenAI 内置 file_search 工具类型
// 参考: https://platform.openai.com/docs/guides/tools-file-search
// 文件搜索允许模型在矢量存储中搜索文档
export interface ResponsesFileSearchTool {
  type: "file_search";
  // 矢量存储 ID 列表（必须先创建 vector store）
  vector_store_ids?: string[];
  // 最大搜索结果数
  max_num_results?: number;
}

// 统一的 Responses API 内置工具类型
export type ResponsesBuiltinTool =
  | ResponsesImageGenerationTool
  | ResponsesWebSearchTool
  | ResponsesCodeInterpreterTool
  | ResponsesFileSearchTool;

// Responses API 流式事件类型
export type ResponsesStreamEventType =
  | "response.created"
  | "response.in_progress"
  | "response.completed"
  | "response.failed"
  | "response.output_item.added"
  | "response.output_item.done"
  | "response.content_part.added"
  | "response.content_part.done"
  | "response.output_text.delta"
  | "response.output_text.done"
  | "response.refusal.delta"
  | "response.refusal.done"
  | "response.function_call_arguments.delta"
  | "response.function_call_arguments.done"
  | "response.reasoning_summary_text.delta"
  | "response.reasoning_summary_text.done"
  | "response.image_generation_call.generating"
  | "response.image_generation_call.done"
  | "error";

export interface ResponsesStreamEvent {
  type: ResponsesStreamEventType;
  delta?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  response?: ResponsesResponse;
  error?: { message: string; type: string; code?: string };
  // GPT-5.2 图像生成相关
  result?: string; // base64 encoded image data for image_generation_call.done
}

export interface ResponsesResponse {
  id: string;
  object: "response";
  status: "completed" | "in_progress" | "failed" | "cancelled";
  output: ResponsesOutputItem[];
  output_text?: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface ResponsesOutputItem {
  type:
    | "message"
    | "function_call"
    | "image_generation_call"
    | "web_search_call"
    | "code_interpreter_call"
    | "file_search_call";
  id?: string;
  role?: "assistant";
  content?: Array<{
    type: "text" | "refusal" | "output_text";
    text?: string;
    refusal?: string;
    // web_search 返回的 annotations (url_citation)
    annotations?: Array<{
      type: "url_citation";
      url: string;
      title?: string;
      start_index?: number;
      end_index?: number;
    }>;
  }>;
  // function call 相关
  name?: string;
  call_id?: string;
  arguments?: string;
  // image_generation_call 相关 - GPT-5.2 原生图像生成
  result?: string; // base64 encoded image data
  // web_search_call 相关 - GPT-5.2 网络搜索结果
  // 搜索结果会直接包含在 output_text 中
  // code_interpreter_call 相关 - GPT-5.2 代码执行结果
  // 包含执行的代码和输出结果
  code?: string; // 执行的代码
  output?: string; // 代码执行输出
  // file_search_call 相关 - GPT-5.2 文件搜索结果
  // 搜索结果会包含文件引用和相关内容
}

export interface DalleRequestPayload {
  model: string;
  prompt: string;
  response_format: "url" | "b64_json";
  n: number;
  size: ModelSize;
  quality: DalleQuality;
  style: DalleStyle;
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      if (isAzure && !accessStore.isValidAzure()) {
        throw Error(
          "incomplete azure config, please check it in your settings page",
        );
      }

      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async extractMessage(res: any) {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // uploadImage
        url = await uploadImage(base64Image2Blob(b64_json, "image/png"));
      }
      return [
        {
          type: "image_url",
          image_url: {
            url,
          },
        },
      ];
    }
    return res.choices?.at(0)?.message?.content ?? res;
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    } finally {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const isDalle3 = _isDalle3(options.config.model);
    const isO1OrO3 =
      options.config.model.startsWith("o1") ||
      options.config.model.startsWith("o3") ||
      options.config.model.startsWith("o4-mini");
    // GPT-5/GPT-5-mini 需要非流式请求（Responses API 限制）
    // GPT-5.2-thinking 也需要特殊处理（支持深度推理）
    const isGPT5OrMini =
      options.config.model === "gpt-5" ||
      options.config.model === "gpt-5-mini" ||
      options.config.model === "gpt-5.2-thinking";

    // GPT-5.2 系列模型
    const isGPT5_2 = options.config.model.startsWith("gpt-5.2");

    // Azure 仍使用 Chat Completions API（Responses API 可能尚不完全支持）
    const isAzure = modelConfig.providerName === ServiceProvider.Azure;
    // 使用 Responses API: 非Azure、非DALL-E图像生成
    const useResponsesApi = !isAzure && !isDalle3;

    if (useResponsesApi) {
      return this.chatWithResponses(
        options,
        modelConfig,
        isO1OrO3,
        isGPT5OrMini,
      );
    } else {
      return this.chatWithCompletions(
        options,
        modelConfig,
        isDalle3,
        isO1OrO3,
        isGPT5OrMini,
      );
    }
  }

  // 使用 OpenAI Responses API 进行对话
  private async chatWithResponses(
    options: ChatOptions,
    modelConfig: any,
    isO1OrO3: boolean,
    isGPT5OrMini: boolean,
  ) {
    const visionModel = isVisionModel(options.config.model);
    const isGPT5ImageGen = isGPT5ImageGenModel(options.config.model);

    // 判断是否为 GPT-5.2 系列模型
    const isGPT5_2 = options.config.model.startsWith("gpt-5.2");
    // GPT-5.2-thinking 和 gpt-5.2-pro 使用深度推理
    const isGPT5_2Thinking =
      options.config.model === "gpt-5.2-thinking" ||
      options.config.model === "gpt-5.2-pro";
    // GPT-5.2-instant 使用快速模式（支持 "none" 推理）
    const isGPT5_2Instant = options.config.model === "gpt-5.2-instant";
    // GPT-5.2-chat-latest 是动态别名，不支持 "none" 推理
    const isGPT5_2ChatLatest = options.config.model === "gpt-5.2-chat-latest";

    // 提取 system message 作为 instructions
    let instructions: string | undefined;
    const inputMessages: ResponsesInputItem[] = [];

    for (const v of options.messages) {
      const content = visionModel
        ? await preProcessImageContent(v.content)
        : getMessageTextContent(v);

      if (v.role === "system") {
        // 将 system message 提取为 instructions
        instructions =
          typeof content === "string" ? content : JSON.stringify(content);
      } else {
        // 转换角色：user/assistant 保持不变
        inputMessages.push({
          role: v.role as "user" | "assistant",
          content,
        });
      }
    }

    // 构建 Responses API 请求
    const requestPayload: ResponsesRequestPayload = {
      model: modelConfig.model,
      input: inputMessages,
      stream: !isGPT5OrMini && options.config.stream,
    };

    // 添加 previous_response_id 用于多轮对话（如果提供）
    if (options.previousOpenAIResponseId) {
      requestPayload.previous_response_id = options.previousOpenAIResponseId;
      console.log(
        "[Responses API] Using previous_response_id:",
        options.previousOpenAIResponseId,
      );
    }

    // 添加 instructions（如果有 system message）
    if (instructions) {
      requestPayload.instructions = instructions;
    }

    // GPT-5.2 系列模型参数设置
    // 重要：temperature 和 top_p 只在 reasoning effort 为 "none" 时支持
    if (isGPT5_2) {
      // 设置 max_output_tokens
      requestPayload.max_output_tokens = modelConfig.max_tokens;

      // 获取用户配置的推理级别，默认为 "auto"
      const userReasoningEffort = modelConfig.reasoningEffort || "auto";

      // 根据用户配置或模型默认值确定最终的推理级别
      let finalReasoningEffort: "none" | "low" | "medium" | "high" | "xhigh";

      // 定义不同模型支持的推理级别
      // gpt-5.2-instant: 支持 none, low, medium（快速模式）
      // gpt-5.2-chat-latest: 不支持 none，支持 low, medium, high（动态别名）
      // gpt-5.2: 支持 none, low, medium, high
      // gpt-5.2-thinking: 支持 low, medium, high, xhigh
      // gpt-5.2-pro: 支持 medium, high, xhigh

      if (userReasoningEffort === "auto") {
        // 自动模式：根据模型类型选择默认值
        if (isGPT5_2Instant) {
          // gpt-5.2-instant 默认使用 "none"
          finalReasoningEffort = "none";
        } else if (isGPT5_2ChatLatest) {
          // gpt-5.2-chat-latest 是动态别名，不支持 none，默认使用 "low"
          finalReasoningEffort = "low";
        } else if (options.config.model === "gpt-5.2-pro") {
          // gpt-5.2-pro 默认使用 "xhigh"
          finalReasoningEffort = "xhigh";
        } else if (options.config.model === "gpt-5.2-thinking") {
          // gpt-5.2-thinking 默认使用 "high"
          finalReasoningEffort = "high";
        } else {
          // gpt-5.2 默认使用 "medium"
          finalReasoningEffort = "medium";
        }
        console.log(
          `[GPT-5.2] Auto reasoning effort for ${options.config.model}: ${finalReasoningEffort}`,
        );
      } else {
        // 用户明确指定了推理级别，需要验证是否支持
        if (options.config.model === "gpt-5.2-pro") {
          // gpt-5.2-pro 不支持 "none" 和 "low"
          if (userReasoningEffort === "none" || userReasoningEffort === "low") {
            finalReasoningEffort = "medium"; // 升级到 medium
            console.warn(
              `[GPT-5.2 Pro] '${userReasoningEffort}' not supported, falling back to 'medium'`,
            );
          } else {
            finalReasoningEffort = userReasoningEffort;
          }
        } else if (options.config.model === "gpt-5.2-thinking") {
          // gpt-5.2-thinking 不支持 "none"
          if (userReasoningEffort === "none") {
            finalReasoningEffort = "low"; // 升级到 low
            console.warn(
              `[GPT-5.2 Thinking] 'none' not supported, falling back to 'low'`,
            );
          } else {
            finalReasoningEffort = userReasoningEffort;
          }
        } else if (isGPT5_2ChatLatest) {
          // gpt-5.2-chat-latest 不支持 "none"（API 明确返回错误）
          if (userReasoningEffort === "none") {
            finalReasoningEffort = "low"; // 升级到 low
            console.warn(
              `[GPT-5.2 Chat Latest] 'none' not supported, falling back to 'low'`,
            );
          } else {
            finalReasoningEffort = userReasoningEffort;
          }
        } else {
          // 其他 GPT-5.2 模型支持所有级别
          finalReasoningEffort = userReasoningEffort;
        }
        console.log(
          `[GPT-5.2] User specified reasoning effort: ${finalReasoningEffort}`,
        );
      }

      // 设置推理参数
      requestPayload.reasoning = {
        effort: finalReasoningEffort,
      };

      // 只有 "none" 级别支持 temperature 和 top_p
      if (finalReasoningEffort === "none") {
        requestPayload.temperature = modelConfig.temperature;
        requestPayload.top_p = modelConfig.top_p;
        console.log(
          "[GPT-5.2] Reasoning effort 'none': temperature and top_p enabled",
        );
      } else {
        // 非 "none" 级别添加 summary 并删除不支持的参数
        requestPayload.reasoning.summary = "auto";
        delete requestPayload.temperature;
        delete requestPayload.top_p;
        console.log(
          `[GPT-5.2] Reasoning effort '${finalReasoningEffort}': temperature and top_p disabled`,
        );
      }
    }
    // O1/O3 模型设置 reasoning 参数
    else if (isO1OrO3) {
      requestPayload.max_output_tokens = modelConfig.max_tokens;
      requestPayload.reasoning = {
        effort: "medium",
        summary: "auto",
      };
      // O1/O3 不支持 temperature 和 top_p
      delete requestPayload.temperature;
      delete requestPayload.top_p;
    }
    // 其他模型（非推理模型）设置温度等参数
    else {
      requestPayload.temperature = modelConfig.temperature;
      requestPayload.top_p = modelConfig.top_p;

      // Vision 模型设置 max_output_tokens
      if (visionModel) {
        requestPayload.max_output_tokens = Math.max(
          modelConfig.max_tokens,
          4000,
        );
      }
    }

    // 获取工具配置
    const [tools, funcs] = usePluginStore
      .getState()
      .getAsTools(useChatStore.getState().currentSession().mask?.plugin || []);

    // 转换工具格式为 Responses API 格式
    if (tools && Array.isArray(tools) && tools.length > 0) {
      requestPayload.tools = (tools as any[]).map((tool: any) => ({
        type: "function" as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));
    }

    // GPT-5.2 系列模型添加 image_generation 工具支持
    // 当启用 enableImageGeneration 时，模型可以生成图像
    if (isGPT5ImageGen && modelConfig.enableImageGeneration) {
      const imageGenTool: ResponsesImageGenerationTool = {
        type: "image_generation",
        quality:
          (options.config?.quality as "low" | "medium" | "high") || "high",
        size: options.config?.size || "1024x1024",
        // 支持透明背景图像生成（根据模型配置）
        background: modelConfig.imageBackground || "auto",
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(imageGenTool);
      console.log(
        "[GPT-5.2] Added image_generation tool with config:",
        imageGenTool,
      );
    }

    // GPT-5.2 系列模型添加 web_search 内置工具支持
    // 当启用 web_search 时，模型可以自动搜索网络获取最新信息
    if (isGPT5_2 && modelConfig.enableWebSearch) {
      const webSearchTool: ResponsesWebSearchTool = {
        type: "web_search",
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(webSearchTool);
      console.log("[GPT-5.2] Added web_search tool");
    }

    // GPT-5.2 系列模型添加 code_interpreter 内置工具支持
    // 当启用 code_interpreter 时，模型可以执行 Python 代码进行计算和数据分析
    if (isGPT5_2 && modelConfig.enableCodeInterpreter) {
      const codeInterpreterTool: ResponsesCodeInterpreterTool = {
        type: "code_interpreter",
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(codeInterpreterTool);
      console.log("[GPT-5.2] Added code_interpreter tool");
    }

    // GPT-5.2 系列模型添加 file_search 内置工具支持
    // 当启用 file_search 时，模型可以在矢量存储中搜索文档
    // 注意: 需要先创建 vector store 并配置 vectorStoreIds
    if (
      isGPT5_2 &&
      modelConfig.enableFileSearch &&
      modelConfig.vectorStoreIds?.length
    ) {
      const fileSearchTool: ResponsesFileSearchTool = {
        type: "file_search",
        vector_store_ids: modelConfig.vectorStoreIds,
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(fileSearchTool);
      console.log(
        "[GPT-5.2] Added file_search tool with vector stores:",
        modelConfig.vectorStoreIds,
      );
    }

    // GPT-5.2 系列模型设置 tool_choice 为 "auto"
    // 当配置了任何工具时，设置 tool_choice 让模型自动决定何时使用工具
    // tool_choice 可选值: "auto" | "none" | "required" | { type: "function"; name: string }
    // - "auto": 模型自动决定是否调用工具（推荐用于内置工具）
    // - "none": 禁止模型调用任何工具
    // - "required": 强制模型必须调用工具
    if (isGPT5_2 && requestPayload.tools && requestPayload.tools.length > 0) {
      // 使用用户配置的 toolChoice，默认为 "auto"
      requestPayload.tool_choice = modelConfig.toolChoice || "auto";
      console.log(
        "[GPT-5.2] Set tool_choice:",
        requestPayload.tool_choice,
        "for",
        requestPayload.tools.length,
        "tools",
      );
    }

    // 开发者模式下输出完整请求体JSON
    if (process.env.NODE_ENV === "development") {
      console.log("[Responses API] Full request payload:");
      console.log(JSON.stringify(requestPayload, null, 2));
    } else {
      console.log("[Request] openai responses payload: ", requestPayload);
    }

    const shouldStream = !isGPT5OrMini && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const chatPath = this.path(OpenaiPath.ResponsesPath);

      if (shouldStream) {
        let toolIndex = -1;
        // 使用 streamWithThink 处理流式响应
        streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          // parseSSE - 解析 Responses API 流式事件
          (text: string, runTools: ChatMessageTool[]) => {
            try {
              const event = JSON.parse(text) as ResponsesStreamEvent;

              // 处理文本增量
              if (event.type === "response.output_text.delta") {
                return {
                  isThinking: false,
                  content: event.delta || "",
                };
              }

              // 处理推理/思考内容增量
              if (event.type === "response.reasoning_summary_text.delta") {
                return {
                  isThinking: true,
                  content: event.delta || "",
                };
              }

              // 处理 function call 参数增量
              if (event.type === "response.function_call_arguments.delta") {
                if (runTools.length > 0 && toolIndex >= 0) {
                  const currentTool = runTools[toolIndex];
                  if (currentTool?.function) {
                    currentTool.function.arguments =
                      (currentTool.function.arguments || "") +
                      (event.delta || "");
                  }
                }
                return { isThinking: false, content: "" };
              }

              // 处理新的 output item（可能是 function call）
              if (event.type === "response.output_item.added") {
                // Function call 会在这里添加
                return { isThinking: false, content: "" };
              }

              // 处理 output item 完成（用于解析 function call 和 image_generation_call）
              if (event.type === "response.output_item.done") {
                const response = event.response;
                if (response?.output) {
                  for (const item of response.output) {
                    if (
                      item.type === "function_call" &&
                      item.name &&
                      item.call_id
                    ) {
                      toolIndex += 1;
                      runTools.push({
                        id: item.call_id,
                        type: "function",
                        function: {
                          name: item.name,
                          arguments: item.arguments || "",
                        },
                      });
                    }
                    // 处理图像生成完成 - 在流式模式下也可能通过这里返回
                    if (item.type === "image_generation_call" && item.result) {
                      console.log(
                        "[GPT-5.2] Image generation completed in stream",
                      );
                      // 图像将在 response.completed 时统一处理
                    }
                  }
                }
                return { isThinking: false, content: "" };
              }

              // 处理图像生成进行中事件
              if (event.type === "response.image_generation_call.generating") {
                console.log("[GPT-5.2] Image generation in progress...");
                return {
                  isThinking: false,
                  content: "\n🎨 正在生成图像...\n",
                };
              }

              // 处理图像生成完成事件
              if (
                event.type === "response.image_generation_call.done" &&
                event.result
              ) {
                console.log("[GPT-5.2] Image generation completed");
                // 返回标记，实际图像处理在 response.completed 中进行
                return {
                  isThinking: false,
                  content: "\n✅ 图像生成完成\n",
                };
              }

              // 处理 response 完成事件 - 捕获 response id 用于多轮对话
              if (event.type === "response.completed" && event.response?.id) {
                const responseId = event.response.id;
                console.log(
                  "[Responses API] Response completed, id:",
                  responseId,
                );
                // 通过回调传递 response id
                options.onOpenAIResponseId?.(responseId);

                // 提取 web_search 返回的 citations (url_citation annotations)
                // citations 位于 response.output[].content[].annotations[]
                const collectedCitations: Array<{
                  title: string;
                  url: string;
                }> = [];
                if (event.response?.output) {
                  for (const item of event.response.output) {
                    if (item.type === "message" && item.content) {
                      for (const part of item.content) {
                        if (
                          part.annotations &&
                          Array.isArray(part.annotations)
                        ) {
                          for (const annotation of part.annotations) {
                            if (
                              annotation.type === "url_citation" &&
                              annotation.url
                            ) {
                              // 去重检查
                              if (
                                !collectedCitations.some(
                                  (c) => c.url === annotation.url,
                                )
                              ) {
                                collectedCitations.push({
                                  title: annotation.title || annotation.url,
                                  url: annotation.url,
                                });
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }

                // 如果有 citations，通过回调传递给 UI
                if (collectedCitations.length > 0 && options.onCitations) {
                  console.log(
                    "[GPT-5.2 web_search] Extracted citations:",
                    collectedCitations,
                  );
                  options.onCitations(collectedCitations);
                }

                return { isThinking: false, content: "" };
              }

              // 处理 response 创建事件 - 也可以捕获 response id
              if (event.type === "response.created" && event.response?.id) {
                const responseId = event.response.id;
                console.log(
                  "[Responses API] Response created, id:",
                  responseId,
                );
                // 提前传递 response id（创建时就有）
                options.onOpenAIResponseId?.(responseId);
                return { isThinking: false, content: "" };
              }

              // 处理错误
              if (event.type === "error") {
                console.error("[Responses API] Stream error:", event.error);
                return { isThinking: false, content: "" };
              }

              // 其他事件类型忽略
              return { isThinking: false, content: "" };
            } catch (e) {
              // 解析失败，可能是旧格式，尝试兼容处理
              console.warn("[Responses API] Failed to parse event:", text, e);
              return { isThinking: false, content: "" };
            }
          },
          // processToolMessage - 处理工具调用结果
          (payload: any, toolCallMessage: any, toolCallResult: any[]) => {
            toolIndex = -1;
            // Responses API 的工具调用结果需要通过 input 传递
            // 将工具调用结果转换为 input 格式追加
            const toolResults = toolCallResult.map((result: any) => ({
              role: "user" as const,
              content: JSON.stringify({
                type: "function_call_output",
                call_id: result.tool_call_id,
                output: result.content,
              }),
            }));

            if (payload.input && Array.isArray(payload.input)) {
              payload.input.push(...toolResults);
            }
          },
          options,
        );
      } else {
        // 非流式请求
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };

        requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = (await res.json()) as ResponsesResponse;
        // 非流式请求也要回调 response id
        if (resJson.id) {
          console.log("[Responses API] Non-stream response id:", resJson.id);
          options.onOpenAIResponseId?.(resJson.id);
        }

        // 提取 web_search 返回的 citations (url_citation annotations)
        const collectedCitations: Array<{ title: string; url: string }> = [];
        if (resJson.output && Array.isArray(resJson.output)) {
          for (const item of resJson.output) {
            if (item.type === "message" && item.content) {
              for (const part of item.content) {
                if (part.annotations && Array.isArray(part.annotations)) {
                  for (const annotation of part.annotations) {
                    if (annotation.type === "url_citation" && annotation.url) {
                      // 去重检查
                      if (
                        !collectedCitations.some(
                          (c) => c.url === annotation.url,
                        )
                      ) {
                        collectedCitations.push({
                          title: annotation.title || annotation.url,
                          url: annotation.url,
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // 如果有 citations，通过回调传递给 UI
        if (collectedCitations.length > 0 && options.onCitations) {
          console.log(
            "[GPT-5.2 web_search] Extracted citations (non-stream):",
            collectedCitations,
          );
          options.onCitations(collectedCitations);
        }

        const message = await this.extractResponsesMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a responses request", e);
      options.onError?.(e as Error);
    } finally {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }

  // 从 Responses API 响应中提取消息
  private async extractResponsesMessage(
    res: ResponsesResponse | any,
  ): Promise<string | MultimodalContent[]> {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }

    // 检查是否有图像生成结果
    const imageResults: MultimodalContent[] = [];
    const textParts: string[] = [];

    // 从 output 数组中提取内容
    if (res.output && Array.isArray(res.output)) {
      for (const item of res.output) {
        // 处理图像生成结果
        if (item.type === "image_generation_call" && item.result) {
          try {
            // 将 base64 图像数据转换为可显示的格式
            const imageUrl = await uploadImage(
              base64Image2Blob(item.result, "image/png"),
            );
            imageResults.push({
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            });
            console.log("[GPT-5.2] Image generated and uploaded:", imageUrl);
          } catch (e) {
            console.error("[GPT-5.2] Failed to process generated image:", e);
            // 如果上传失败，使用 data URL
            imageResults.push({
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${item.result}`,
              },
            });
          }
        }
        // 处理文本消息
        if (item.type === "message" && item.content) {
          for (const part of item.content) {
            if (part.type === "text" && part.text) {
              textParts.push(part.text);
            }
          }
        }
      }
    }

    // 如果有图像结果，返回多模态内容
    if (imageResults.length > 0) {
      const result: MultimodalContent[] = [];
      // 先添加文本内容
      if (textParts.length > 0) {
        result.push({
          type: "text",
          text: textParts.join(""),
        });
      }
      // 再添加图像
      result.push(...imageResults);
      return result;
    }

    // 优先使用 output_text
    if (res.output_text) {
      return res.output_text;
    }

    // 返回纯文本
    if (textParts.length > 0) {
      return textParts.join("");
    }

    return "";
  }

  // 使用传统 Chat Completions API（用于 Azure 和 DALL-E）
  private async chatWithCompletions(
    options: ChatOptions,
    modelConfig: any,
    isDalle3: boolean,
    isO1OrO3: boolean,
    isGPT5OrMini: boolean,
  ) {
    let requestPayload: RequestPayload | DalleRequestPayload;

    if (isDalle3) {
      const prompt = getMessageTextContent(
        options.messages.slice(-1)?.pop() as any,
      );
      requestPayload = {
        model: options.config.model,
        prompt,
        response_format: "b64_json",
        n: 1,
        size: options.config?.size ?? "1024x1024",
        quality: options.config?.quality ?? "standard",
        style: options.config?.style ?? "vivid",
      };
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        if (!(isO1OrO3 && v.role === "system"))
          messages.push({ role: v.role, content });
      }

      requestPayload = {
        messages,
        stream: !isGPT5OrMini && options.config.stream,
        model: modelConfig.model,
        temperature: !isO1OrO3 ? modelConfig.temperature : 1,
        presence_penalty: !isO1OrO3 ? modelConfig.presence_penalty : 0,
        frequency_penalty: !isO1OrO3 ? modelConfig.frequency_penalty : 0,
        top_p: !isO1OrO3 ? modelConfig.top_p : 1,
      };

      if (isO1OrO3) {
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      }

      if (visionModel && !isO1OrO3) {
        requestPayload["max_tokens"] = Math.max(modelConfig.max_tokens, 4000);
      }
    }

    console.log("[Request] openai completions payload: ", requestPayload);

    const shouldStream = !isDalle3 && !isGPT5OrMini && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (isDalle3 ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        chatPath = this.path(
          isDalle3 ? OpenaiPath.ImagePath : OpenaiPath.ChatPath,
        );
      }

      if (shouldStream) {
        let index = -1;
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          (text: string, runTools: ChatMessageTool[]) => {
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;

            if (!choices?.length) return { isThinking: false, content: "" };

            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning = choices[0]?.delta?.reasoning_content;
            const content = choices[0]?.delta?.content;

            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return { isThinking: false, content: "" };
            }

            if (reasoning && reasoning.length > 0) {
              return { isThinking: true, content: reasoning };
            } else if (content && content.length > 0) {
              return { isThinking: false, content: content };
            }

            return { isThinking: false, content: "" };
          },
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };

        requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = await this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    } finally {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter(
      (m) => m.id.startsWith("gpt-") || m.id.startsWith("chatgpt-"),
    );
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    //由于目前 OpenAI 的 disableListModels 默认为 true，所以当前实际不会运行到这场
    let seq = 1000; //同 Constant.ts 中的排序保持一致
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));
  }
}
export { OpenaiPath };

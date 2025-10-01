"use client";
import { ApiPath, Alibaba, ALIBABA_BASE_URL } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import {
  preProcessImageContentForAlibabaDashScope,
  streamWithThink,
} from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
  MultimodalContent,
  MultimodalContentForAlibaba,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
  isVisionModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

// {{CHENGQI:
// Action: Added - 工具函数提取，提高代码可维护性
// Timestamp: 2025-10-01 14:30:00 +08:00
// Reason: 优化类型安全和代码复用
// Principle_Applied: DRY原则，单一职责
// Optimization: 提取通用逻辑为独立函数
// Architectural_Note (AR): 改善代码组织结构
// Documentation_Note (DW): 添加工具函数以提高可读性
// }}

// {{CHENGQI:
// Action: Added - 类型定义增强
// Timestamp: 2025-10-01 14:30:00 +08:00
// Reason: 提供完整的响应类型定义，提高类型安全
// Principle_Applied: 类型安全，可维护性
// Optimization: 完整的类型定义避免运行时错误
// }}

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

interface RequestInput {
  messages: {
    role: "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
}

interface RequestParam {
  result_format: string;
  incremental_output?: boolean;
  temperature: number;
  repetition_penalty?: number;
  top_p: number;
  max_tokens?: number;
}

interface RequestPayload {
  model: string;
  input: RequestInput;
  parameters: RequestParam;
}

// {{CHENGQI:
// Action: Added - 阿里云响应类型定义
// Timestamp: 2025-10-01 14:32:00 +08:00
// Reason: 提供完整的SSE响应结构类型定义
// Principle_Applied: 类型安全第一
// Optimization: 明确的类型定义避免类型错误
// }}
interface AlibabaStreamResponse {
  output: {
    choices: Array<{
      message: {
        content: string | null | MultimodalContentForAlibaba[];
        tool_calls?: ChatMessageTool[];
        reasoning_content?: string | null;
      };
    }>;
  };
}

// {{CHENGQI:
// Action: Added - 工具函数：安全的top_p值标准化
// Timestamp: 2025-10-01 14:35:00 +08:00
// Reason: Qwen要求top_p < 1，需要健壮的边界处理
// Principle_Applied: 防御性编程
// Optimization: 统一的参数校验逻辑
// }}
function normalizeTopP(topP: number): number {
  // Qwen要求top_p必须 < 1，处理所有边界情况
  if (topP >= 1) return 0.99;
  if (topP <= 0) return 0.01;
  return topP;
}

// {{CHENGQI:
// Action: Added - 工具函数：安全提取内容
// Timestamp: 2025-10-01 14:36:00 +08:00
// Reason: 统一处理文本和多模态内容
// Principle_Applied: DRY原则，单一职责
// Optimization: 避免重复逻辑，提高可维护性
// }}
function extractContentFromChoice(
  content: string | null | MultimodalContentForAlibaba[]
): string {
  if (!content) return "";
  
  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || "")
      .filter(Boolean)
      .join("");
  }
  
  return content;
}


export class QwenApi implements LLMApi {
  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.alibabaUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? ALIBABA_BASE_URL : ApiPath.Alibaba;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Alibaba)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res?.output?.choices?.at(0)?.message?.content ?? "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Alibaba TTS not implemented yet.");
  }

  // {{CHENGQI:
  // Action: Enhanced - 改进chat方法，添加完整错误处理
  // Timestamp: 2025-10-01 14:40:00 +08:00
  // Reason: 提高健壮性和错误恢复能力
  // Principle_Applied: 防御性编程，优雅降级
  // Optimization: 完整的try-finally清理，避免资源泄漏
  // }}
  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const visionModel = isVisionModel(options.config.model);

    // 消息内容预处理
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = (
        visionModel
          ? await preProcessImageContentForAlibabaDashScope(v.content)
          : v.role === "assistant"
          ? getMessageTextContentWithoutThinking(v)
          : getMessageTextContent(v)
      ) as any;

      messages.push({ role: v.role, content });
    }

    const shouldStream = !!options.config.stream;
    const requestPayload: RequestPayload = {
      model: modelConfig.model,
      input: {
        messages,
      },
      parameters: {
        result_format: "message",
        incremental_output: shouldStream,
        temperature: modelConfig.temperature,
        // max_tokens: modelConfig.max_tokens,
        top_p: normalizeTopP(modelConfig.top_p), // 使用安全的标准化函数
      },
    };

    const controller = new AbortController();
    options.onController?.(controller);

    // {{CHENGQI:
    // Action: Added - 超时清理标志
    // Timestamp: 2025-10-01 14:42:00 +08:00
    // Reason: 确保所有路径都清理定时器，避免内存泄漏
    // Principle_Applied: 资源管理
    // Optimization: 使用finally块保证清理
    // }}
    let requestTimeoutId: NodeJS.Timeout | null = null;

    try {
      const headers = {
        ...getHeaders(),
        "X-DashScope-SSE": shouldStream ? "enable" : "disable",
      };

      const chatPath = this.path(Alibaba.ChatPath(modelConfig.model));
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: headers,
      };

      // 设置超时控制
      requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        
        // 流式响应处理
        return streamWithThink(
          chatPath,
          requestPayload,
          headers,
          tools as any,
          funcs,
          controller,
          // {{CHENGQI:
          // Action: Enhanced - 改进SSE解析器，添加完整错误处理
          // Timestamp: 2025-10-01 14:45:00 +08:00
          // Reason: 提高解析健壮性，避免运行时错误
          // Principle_Applied: 防御性编程
          // Optimization: 完整的null检查和类型守卫
          // }}
          (text: string, runTools: ChatMessageTool[]) => {
            try {
              const json: AlibabaStreamResponse = JSON.parse(text);
              const choices = json?.output?.choices;

              // 验证响应结构
              if (!choices || choices.length === 0) {
                return { isThinking: false, content: "" };
              }

              const firstChoice = choices[0];
              if (!firstChoice?.message) {
                return { isThinking: false, content: "" };
              }

              // 处理工具调用
              const tool_calls = firstChoice.message.tool_calls;
              if (tool_calls && tool_calls.length > 0) {
                const toolCall = tool_calls[0];
                const index = toolCall?.index;
                const id = toolCall?.id;
                const args = toolCall?.function?.arguments || "";

                if (id) {
                  // 新工具调用
                  runTools.push({
                    id,
                    type: toolCall.type,
                    function: {
                      name: toolCall.function?.name as string,
                      arguments: args,
                    },
                  });
                } else if (typeof index === "number" && runTools[index]) {
                  // 增量更新已存在的工具
                  const existingTool = runTools[index];
                  if (existingTool?.function) {
                    existingTool.function.arguments = 
                      (existingTool.function.arguments || "") + args;
                  }
                }
              }

              // 处理推理内容（思考模式）
              const reasoning = firstChoice.message.reasoning_content;
              if (reasoning && reasoning.length > 0) {
                return {
                  isThinking: true,
                  content: reasoning,
                };
              }

              // 处理普通内容
              const content = firstChoice.message.content;
              if (content) {
                const extractedContent = extractContentFromChoice(content);
                if (extractedContent.length > 0) {
                  return {
                    isThinking: false,
                    content: extractedContent,
                  };
                }
              }

              // 空内容
              return {
                isThinking: false,
                content: "",
              };
            } catch (parseError) {
              console.error("[Alibaba] SSE parse error:", parseError, "Text:", text);
              return { isThinking: false, content: "" };
            }
          },
          // 工具调用消息处理器
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            requestPayload?.input?.messages?.splice(
              requestPayload.input.messages.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        // 非流式响应
        const res = await fetch(chatPath, chatPayload);
        
        if (requestTimeoutId) {
          clearTimeout(requestTimeoutId);
          requestTimeoutId = null;
        }

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.error("[Alibaba] Failed to make chat request:", e);
      options.onError?.(e as Error);
    } finally {
      // {{CHENGQI:
      // Action: Added - 确保清理定时器
      // Timestamp: 2025-10-01 14:48:00 +08:00
      // Reason: 避免内存泄漏和悬空定时器
      // Principle_Applied: 资源管理最佳实践
      // Optimization: finally块保证所有路径都清理
      // }}
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
export { Alibaba };

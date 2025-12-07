"use client";
// azure and openai, using same models. so using same LLMApi.
import { ApiPath, XAI_BASE_URL, XAI } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import { streamWithThink } from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import { getTimeoutMSByModel } from "@/app/utils";
import { preProcessImageContent } from "@/app/utils/chat";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class XAIApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.xaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = ApiPath.XAI;
      baseUrl = isApp ? XAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.XAI)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res.choices?.at(0)?.message?.content ?? "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      messages.push({ role: v.role, content });
    }

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const requestPayload: RequestPayload = {
      messages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
    };

    // {{CHENGQI:
    // Action: Added - XAI思考模式配置
    // Timestamp: 2025-01-02 12:00:00 +08:00
    // Reason: 启用XAI的思考模式和搜索功能
    // Principle_Applied: YAGNI - 仅添加当前需要的功能
    // Optimization: 为特定模型启用高质量推理
    // }}
    // 删除 presence_penalty
    delete (requestPayload as any).presence_penalty;
    delete (requestPayload as any).frequency_penalty;

    // 动态添加 search_parameters
    (requestPayload as any).search_parameters = {
      mode: "on",
      max_search_results: 30,
      return_citations: true,
      sources: [
        { type: "web", safe_search: false },
        { type: "x" },
        { type: "news", safe_search: false },
      ],
    };

    if (
      modelConfig.model === "grok-3-mini-latest" ||
      modelConfig.model === "grok-3-mini"
    ) {
      delete (requestPayload as any).frequency_penalty;
      (requestPayload as any).reasoning_effort = "high";
    }

    console.log("[Request] xai payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(XAI.ChatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );

        // {{CHENGQI:
        // Action: Added - Citations数据收集变量
        // Timestamp: 2025-01-02 16:15:00 +08:00
        // Reason: 为XAI平台添加citations数据收集和处理功能
        // Principle_Applied: SOLID - 单一职责的citations数据管理
        // Optimization: 收集所有citations，去重后一次性传递给UI
        // Architectural_Note (AR): Citations数据与现有流式系统集成
        // Documentation_Note (DW): Citations数据的收集和处理逻辑
        // }}
        let collectedCitations: any[] = [];

        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);

            // {{CHENGQI:
            // Action: Added - Citations数据处理
            // Timestamp: 2025-01-02 16:15:00 +08:00
            // Reason: 解析XAI返回的citations数据，转换为标准格式
            // Principle_Applied: SOLID - 数据转换的单一职责
            // Optimization: 自动生成title，支持去重
            // Architectural_Note (AR): Citations数据标准化处理
            // Documentation_Note (DW): Citations数据的解析和格式化逻辑
            // }}
            // Process citations if present
            if (json.citations && Array.isArray(json.citations)) {
              const newCitations = json.citations
                .map((citation: any) => {
                  // Handle different citation formats
                  let url = "";
                  let title = "";

                  if (typeof citation === "string") {
                    url = citation;
                    title = citation;
                  } else if (citation.url) {
                    url = citation.url;
                    title = citation.title || citation.url;
                  } else {
                    // Skip invalid citations
                    return null;
                  }

                  return url ? { title, url } : null;
                })
                .filter(Boolean);

              // Add new citations, avoiding duplicates
              newCitations.forEach((newCitation: any) => {
                if (
                  !collectedCitations.some(
                    (existing) => existing.url === newCitation.url,
                  )
                ) {
                  collectedCitations.push(newCitation);
                }
              });
            }

            const choices = json.choices as Array<{
              delta: {
                content: string | null;
                tool_calls: ChatMessageTool[];
                reasoning_content?: string | null;
              };
            }>;
            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const index = tool_calls[0]?.index;
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
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

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          {
            ...options,
            // {{CHENGQI:
            // Action: Modified - 添加citations回调处理
            // Timestamp: 2025-01-02 16:15:00 +08:00
            // Reason: 在响应完成时传递citations数据给UI组件
            // Principle_Applied: SOLID - 数据传递的职责分离
            // Optimization: 在完成时一次性传递所有citations
            // Architectural_Note (AR): Citations数据通过回调系统传递
            // Documentation_Note (DW): Citations数据的回调传递机制
            // }}
            onFinish: (message: string, res: Response) => {
              // Pass citations to the callback if available
              if (collectedCitations.length > 0 && options.onCitations) {
                options.onCitations(collectedCitations);
              }
              options.onFinish(message, res);
            },
            // {{CHENGQI:
            // Action: Added - 思考内容回调传递
            // Timestamp: 2025-06-12 08:49:57 +08:00
            // Reason: P1-LD-006任务 - 确保XAI平台正确传递onThinkingUpdate回调
            // Principle_Applied: SOLID - 责任传递，保持回调链的完整性
            // Optimization: 思考内容的实时流式更新支持
            // Architectural_Note (AR): XAI平台与思考窗口系统的集成
            // Documentation_Note (DW): 思考内容通过onThinkingUpdate回调实时传递给UI
            // }}
            onThinkingUpdate: options.onThinkingUpdate,
          },
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      // Enhanced error handling for XAI streaming interruptions
      const error = e as Error;
      const isTimeout =
        error.name === "AbortError" || error.message.includes("timeout");
      const isNetworkError =
        error.message.includes("network") || error.message.includes("fetch");

      if (isTimeout) {
        options.onError?.(
          new Error(
            "XAI request timed out. This may happen with complex searches or high reasoning tasks. Please try again or reduce the search scope.",
          ),
        );
      } else if (isNetworkError) {
        options.onError?.(
          new Error(
            "Network error occurred while communicating with XAI. Please check your connection and try again.",
          ),
        );
      } else {
        options.onError?.(error);
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

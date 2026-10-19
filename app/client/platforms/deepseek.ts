"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  DEEPSEEK_BASE_URL,
  DeepSeek,
  ServiceProvider,
} from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import {
  detectOpenAICompatibleStreamTermination,
  streamWithThink,
} from "@/app/utils/chat";
import type { Citation } from "@/app/store/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  RequestMessage,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
} from "@/app/utils";
import {
  addSearchCitations,
  citeSource,
  clampSearchQuery,
  DEEPSEEK_WEB_FETCH_TOOL,
  DEEPSEEK_WEB_FETCH_TOOL_NAME,
  DEEPSEEK_WEB_SEARCH_TOOL,
  DEEPSEEK_WEB_SEARCH_TOOL_NAME,
  formatFetchedPage,
  formatSearchResults,
  getDeepSeekErrorMessage,
  getFetchableUrl,
  getSearchQuestion,
  type DeepSeekBalance,
  type DeepSeekFetchResult,
  type DeepSeekSearchResult,
} from "@/app/utils/deepseek";
import {
  resolveDeepSeekReasoningEffort,
  type DeepSeekReasoningEffort,
} from "@/app/utils/model";
import {
  extractChatCompletionsStreamUsage,
  fromChatCompletionsUsage,
  shouldRequestStreamUsage,
} from "@/app/utils/token-usage";
import type { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

type DeepSeekRequestPayload = RequestPayload & {
  reasoning_effort?: DeepSeekReasoningEffort;
};

// The chat store keeps an assistant message's reasoning for DeepSeek
type DeepSeekHistoryMessage = RequestMessage & { thinkingContent?: string };

// Stands in for reasoning DeepSeek requires but a message doesn't have (from
// another model, say). An empty string is rejected by some models.
const MISSING_REASONING = " ";

export class DeepSeekApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.deepseekUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = ApiPath.DeepSeek;
      baseUrl = isApp ? DEEPSEEK_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.DeepSeek)) {
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
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const reasoningEffort = resolveDeepSeekReasoningEffort(
      modelConfig.model,
      modelConfig.reasoningEffort,
    );

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    // Tools only run in the streaming tool loop (streamWithThink)
    const [tools, funcs]: [any[], Record<string, Function>] = shouldStream
      ? this.getTools(options, !!modelConfig.enableWebSearch, controller)
      : [[], {}];

    // In thinking mode, a request with tools must send the reasoning of every
    // assistant message back, or the API answers 400
    // https://api-docs.deepseek.com/guides/thinking_mode
    const passBackReasoning = tools.length > 0 && reasoningEffort !== "none";

    const messages: Array<RequestMessage & { reasoning_content?: string }> = [];
    for (const v of options.messages as DeepSeekHistoryMessage[]) {
      if (v.role === "assistant") {
        const content = getMessageTextContentWithoutThinking(v);
        messages.push({
          role: v.role,
          content,
          ...(passBackReasoning
            ? { reasoning_content: v.thinkingContent || MISSING_REASONING }
            : {}),
        });
      } else {
        const content = getMessageTextContent(v);
        messages.push({ role: v.role, content });
      }
    }

    // 检测并修复消息顺序，确保除system外的第一个消息是user
    const filteredMessages: typeof messages = [];
    let hasFoundFirstUser = false;

    for (const msg of messages) {
      if (msg.role === "system") {
        // Keep all system messages
        filteredMessages.push(msg);
      } else if (msg.role === "user") {
        // User message directly added
        filteredMessages.push(msg);
        hasFoundFirstUser = true;
      } else if (hasFoundFirstUser) {
        // After finding the first user message, all subsequent non-system messages are retained.
        filteredMessages.push(msg);
      }
      // If hasFoundFirstUser is false and it is not a system message, it will be skipped.
    }

    const requestPayload: DeepSeekRequestPayload = {
      messages: filteredMessages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      // max_tokens: Math.max(modelConfig.max_tokens, 1024),
      // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
    };

    console.log("[Request] openai payload: ", requestPayload);

    try {
      const chatPath = this.path(DeepSeek.ChatPath);
      // DeepSeek only reports streaming usage (incl. cache hits) on request
      if (
        shouldStream &&
        shouldRequestStreamUsage(ServiceProvider.DeepSeek, chatPath)
      ) {
        requestPayload.stream_options = { include_usage: true };
      }
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
        // This request's reasoning and text, sent back with its tool calls
        let roundReasoning = "";
        let roundContent = "";
        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string | null;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
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
              roundReasoning += reasoning;
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              roundContent += content;
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
            if (roundContent) {
              toolCallMessage.content = roundContent;
            }
            if (passBackReasoning) {
              toolCallMessage.reasoning_content =
                roundReasoning || MISSING_REASONING;
            }
            roundReasoning = "";
            roundContent = "";
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
            // Action: Added - 思考内容回调传递
            // Timestamp: 2025-06-12 08:49:57 +08:00
            // Reason: P1-LD-006任务 - 确保DeepSeek平台正确传递onThinkingUpdate回调
            // Principle_Applied: SOLID - 责任传递，保持回调链的完整性
            // Optimization: 思考内容的实时流式更新支持
            // Architectural_Note (AR): DeepSeek平台与思考窗口系统的集成
            // Documentation_Note (DW): 思考内容通过onThinkingUpdate回调实时传递给UI
            // }}
            onThinkingUpdate: options.onThinkingUpdate,
          },
          detectOpenAICompatibleStreamTermination,
          extractChatCompletionsStreamUsage,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(
          message,
          res,
          fromChatCompletionsUsage(resJson?.usage),
        );
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }

  // Mask plugins, plus web search and page reading through DeepSeek's Search
  // and Fetch APIs
  private getTools(
    options: ChatOptions,
    enableWebSearch: boolean,
    controller: AbortController,
  ): [any[], Record<string, Function>] {
    const [pluginTools, pluginFuncs] = usePluginStore
      .getState()
      .getAsTools(useChatStore.getState().currentSession().mask?.plugin || []);
    const tools: any[] = [...(pluginTools as any[])];
    const funcs: Record<string, Function> = { ...pluginFuncs };

    if (!enableWebSearch) {
      return [tools, funcs];
    }

    // Every search and fetch of this reply adds to the same numbered sources
    const citations: Citation[] = [];
    const lastUserMessage = [...options.messages]
      .reverse()
      .find((m) => m.role === "user");
    const question = lastUserMessage
      ? getSearchQuestion(getMessageTextContent(lastUserMessage))
      : undefined;

    // The tool functions resolve like a plugin call: status >= 300 marks the
    // tool as failed and hands the message to the model
    const post = async <T>(path: string, body: object) => {
      const res = await fetch(this.path(path), {
        method: "POST",
        headers: getHeaders(false, ServiceProvider.DeepSeek),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      return res.ok
        ? { json: JSON.parse(text) as T }
        : {
            error: {
              status: res.status,
              data: getDeepSeekErrorMessage(text) || res.statusText,
            },
          };
    };

    tools.push(DEEPSEEK_WEB_SEARCH_TOOL, DEEPSEEK_WEB_FETCH_TOOL);

    funcs[DEEPSEEK_WEB_SEARCH_TOOL_NAME] = async (args: { query?: string }) => {
      const query = clampSearchQuery(String(args?.query ?? ""));
      if (!query) {
        return { status: 400, data: "query must not be empty" };
      }

      const res = await post<{ results?: DeepSeekSearchResult[] }>(
        DeepSeek.SearchPath,
        { query, ...(question ? { ori_question: question } : {}) },
      );
      if (res.error) return res.error;

      const numbered = addSearchCitations(citations, res.json.results ?? []);
      if (numbered.length > 0) {
        options.onCitations?.([...citations]);
      }
      return { status: 200, data: formatSearchResults(query, numbered) };
    };

    funcs[DEEPSEEK_WEB_FETCH_TOOL_NAME] = async (args: { url?: string }) => {
      const url = getFetchableUrl(String(args?.url ?? ""));
      if (!url) {
        return {
          status: 400,
          data: "url must be an http or https URL without credentials",
        };
      }

      const res = await post<DeepSeekFetchResult>(DeepSeek.FetchPath, { url });
      if (res.error) return res.error;

      const number = citeSource(citations, url, res.json.title);
      options.onCitations?.([...citations]);
      return { status: 200, data: formatFetchedPage(number, url, res.json) };
    };

    return [tools, funcs];
  }

  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async balance(): Promise<DeepSeekBalance> {
    const res = await fetch(this.path(DeepSeek.BalancePath), {
      method: "GET",
      headers: getHeaders(false, ServiceProvider.DeepSeek),
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(
        getDeepSeekErrorMessage(body) || `${res.status} ${res.statusText}`,
      );
    }
    return JSON.parse(body);
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}

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
  getSearchLocalization,
  getSearchQuestion,
  isUrlInSources,
  joinDeepSeekUrl,
  DEEPSEEK_TOOL_TIMEOUT_MS,
  FETCH_CONTENT_MAX_CHARS,
  FETCH_TOTAL_MAX_CHARS,
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

// A Search or Fetch API result, or the tool error the model gets instead
type ToolResponse<T> =
  | { json: T; error?: undefined }
  | { json?: undefined; error: { status: number; data: string } };

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

    return joinDeepSeekUrl(baseUrl, path);
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
      ? this.getTools(
          options,
          !!modelConfig.enableWebSearch,
          getSearchLocalization(modelConfig.deepseekSearchLocalization),
          controller,
        )
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

      // make a fetch request. A streaming reply times out once it stalls, so
      // tool rounds can make it as long as they need.
      const timeoutMs = getTimeoutMSByModel(options.config.model);
      let requestTimeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const extendTimeout = () => {
        clearTimeout(requestTimeoutId);
        requestTimeoutId = setTimeout(() => controller.abort(), timeoutMs);
      };

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
            extendTimeout();
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
    localization: string | undefined,
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
    // What web_fetch may read URLs from: the user's messages, then each
    // search and fetch result the model is given
    const urlSources = options.messages
      .filter((m) => m.role === "user")
      .map((m) => getMessageTextContent(m));
    let pageCharsRead = 0;

    // The tool functions resolve like a plugin call: status >= 300 marks the
    // tool as failed and hands the message to the model
    const post = async <T>(
      path: string,
      body: object,
      isResult: (json: any) => boolean,
    ): Promise<ToolResponse<T>> => {
      // Its own signal, so a stalled call can time out without stopping the
      // reply
      const toolController = new AbortController();
      const abort = () => toolController.abort();
      if (controller.signal.aborted) abort();
      controller.signal.addEventListener("abort", abort);

      // Raced as well as aborted: the app's fetch only aborts a request once
      // its headers have arrived
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<ToolResponse<T>>((resolve) => {
        timeoutId = setTimeout(() => {
          abort();
          resolve({
            error: {
              status: 504,
              data: `no answer within ${
                DEEPSEEK_TOOL_TIMEOUT_MS / 1000
              } seconds`,
            },
          });
        }, DEEPSEEK_TOOL_TIMEOUT_MS);
      });

      const request = async (): Promise<ToolResponse<T>> => {
        const res = await fetch(this.path(path), {
          method: "POST",
          headers: getHeaders(false, ServiceProvider.DeepSeek),
          body: JSON.stringify(body),
          signal: toolController.signal,
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            error: {
              status: res.status,
              // The app's fetch answers a network failure with an empty 599
              data:
                getDeepSeekErrorMessage(text) ||
                `${res.status} ${res.statusText}`.trim(),
            },
          };
        }

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {}
        // The proxy answers 200 with an error message when its own request
        // fails
        return isResult(json)
          ? { json: json as T }
          : {
              error: {
                status: 502,
                data: `unexpected response: ${
                  getDeepSeekErrorMessage(text) || "empty body"
                }`,
              },
            };
      };

      try {
        return await Promise.race([request(), timeout]);
      } finally {
        clearTimeout(timeoutId);
        controller.signal.removeEventListener("abort", abort);
      }
    };
    const isObject = (json: unknown): json is Record<string, unknown> =>
      !!json && typeof json === "object" && !Array.isArray(json);

    tools.push(DEEPSEEK_WEB_SEARCH_TOOL, DEEPSEEK_WEB_FETCH_TOOL);

    funcs[DEEPSEEK_WEB_SEARCH_TOOL_NAME] = async (args: { query?: string }) => {
      const query = clampSearchQuery(String(args?.query ?? ""));
      if (!query) {
        return { status: 400, data: "query must not be empty" };
      }

      const res = await post<{ results?: DeepSeekSearchResult[] }>(
        DeepSeek.SearchPath,
        {
          query,
          ...(question ? { ori_question: question } : {}),
          ...(localization ? { localization } : {}),
        },
        (json) =>
          isObject(json) &&
          (json.results === undefined || Array.isArray(json.results)),
      );
      if (res.error) return res.error;

      const numbered = addSearchCitations(citations, res.json.results ?? []);
      if (numbered.length > 0) {
        options.onCitations?.([...citations]);
      }
      const data = formatSearchResults(query, numbered);
      urlSources.push(data);
      return { status: 200, data };
    };

    funcs[DEEPSEEK_WEB_FETCH_TOOL_NAME] = async (args: { url?: string }) => {
      const rawUrl = String(args?.url ?? "");
      const checked = getFetchableUrl(rawUrl);
      if ("error" in checked) {
        return { status: 400, data: checked.error };
      }
      const { url } = checked;
      if (!isUrlInSources(rawUrl, url, urlSources)) {
        return {
          status: 403,
          data: `only URLs from the user's messages or from earlier ${DEEPSEEK_WEB_SEARCH_TOOL_NAME} and ${DEEPSEEK_WEB_FETCH_TOOL_NAME} results can be read; search for the page first`,
        };
      }
      const charsLeft = FETCH_TOTAL_MAX_CHARS - pageCharsRead;
      if (charsLeft <= 0) {
        return {
          status: 413,
          data: `this reply has read ${FETCH_TOTAL_MAX_CHARS} characters of pages, as much as it can; answer with what you have`,
        };
      }

      const res = await post<DeepSeekFetchResult>(
        DeepSeek.FetchPath,
        { url },
        (json) => isObject(json) && typeof json.content === "string",
      );
      if (res.error) return res.error;

      const number = citeSource(citations, url, res.json.title);
      options.onCitations?.([...citations]);
      const data = formatFetchedPage(
        number,
        url,
        res.json,
        Math.min(FETCH_CONTENT_MAX_CHARS, charsLeft),
      );
      pageCharsRead += data.length;
      urlSources.push(data);
      return { status: 200, data };
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

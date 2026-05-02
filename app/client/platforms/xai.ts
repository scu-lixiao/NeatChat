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
  MultimodalContent,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import { getTimeoutMSByModel } from "@/app/utils";
import {
  detectResponsesStreamTermination,
  preProcessImageContent,
} from "@/app/utils/chat";
import {
  ResponsesBuiltinTool,
  ResponsesFunctionCallOutputItem,
  ResponsesInput,
  ResponsesInputContentPart,
  ResponsesOutputItem,
  ResponsesRequestPayload,
  ResponsesStreamEvent,
  ResponsesTool,
} from "./openai";
import { fetch } from "@/app/utils/stream";

interface Citation {
  title: string;
  url: string;
}

type XAISearchTool = { type: "x_search" };
type XAITool = ResponsesTool | ResponsesBuiltinTool | XAISearchTool;

class ResponsesReasoningAccumulator {
  private readonly summaryParts = new Map<string, string>();
  private readonly reasoningParts = new Map<string, string>();
  private emittedText = "";

  appendSummary(event: ResponsesStreamEvent, text?: string) {
    return this.updatePart(
      this.summaryParts,
      event.output_index,
      event.summary_index,
      event.item_id,
      text,
      "append",
    );
  }

  replaceSummary(event: ResponsesStreamEvent, text?: string) {
    return this.updatePart(
      this.summaryParts,
      event.output_index,
      event.summary_index,
      event.item_id,
      text,
      "replace",
    );
  }

  appendReasoning(event: ResponsesStreamEvent, text?: string) {
    return this.updatePart(
      this.reasoningParts,
      event.output_index,
      event.content_index,
      event.item_id,
      text,
      "append",
    );
  }

  replaceReasoning(event: ResponsesStreamEvent, text?: string) {
    return this.updatePart(
      this.reasoningParts,
      event.output_index,
      event.content_index,
      event.item_id,
      text,
      "replace",
    );
  }

  hydrateFromOutput(output?: ResponsesOutputItem[]) {
    if (!output || !Array.isArray(output)) {
      return "";
    }

    output.forEach((item, outputIndex) => {
      if (item.type !== "reasoning") {
        return;
      }

      item.summary?.forEach((part, summaryIndex) => {
        if (part.type === "summary_text" && part.text) {
          this.summaryParts.set(
            this.makeKey(outputIndex, summaryIndex, item.id),
            part.text,
          );
        }
      });

      item.content?.forEach((part, contentIndex) => {
        if (part.type === "reasoning_text" && part.text) {
          this.reasoningParts.set(
            this.makeKey(outputIndex, contentIndex, item.id),
            part.text,
          );
        }
      });
    });

    return this.consumePreferredDelta();
  }

  private updatePart(
    target: Map<string, string>,
    outputIndex: number | undefined,
    subIndex: number | undefined,
    itemId: string | undefined,
    text: string | undefined,
    mode: "append" | "replace",
  ) {
    if (!text) {
      return "";
    }

    const key = this.makeKey(outputIndex, subIndex, itemId);
    const current = target.get(key) ?? "";
    const next = mode === "append" ? current + text : text;

    if (current === next) {
      return "";
    }

    target.set(key, next);
    return this.consumePreferredDelta();
  }

  private consumePreferredDelta() {
    const next = this.getPreferredText();

    if (!next || next === this.emittedText) {
      return "";
    }

    if (!this.emittedText) {
      this.emittedText = next;
      return next;
    }

    if (next.startsWith(this.emittedText)) {
      const delta = next.slice(this.emittedText.length);
      this.emittedText = next;
      return delta;
    }

    this.emittedText = next;
    return next;
  }

  private getPreferredText() {
    const summaryText = this.joinOrdered(this.summaryParts);
    const reasoningText = this.joinOrdered(this.reasoningParts);
    return summaryText || reasoningText;
  }

  private joinOrdered(parts: Map<string, string>) {
    return Array.from(parts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, text]) => text)
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  private makeKey(outputIndex?: number, subIndex?: number, itemId?: string) {
    return `${String(outputIndex ?? 0).padStart(6, "0")}:${String(
      subIndex ?? 0,
    ).padStart(6, "0")}:${itemId ?? ""}`;
  }
}

function buildResponsesInputContent(
  content: string | MultimodalContent[],
): string | ResponsesInputContentPart[] {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === "text" && part.text) {
        return {
          type: "input_text",
          text: part.text,
        } satisfies ResponsesInputContentPart;
      }

      if (part.type === "image_url" && part.image_url?.url) {
        return {
          type: "input_image",
          image_url: part.image_url.url,
        } satisfies ResponsesInputContentPart;
      }

      return null;
    })
    .filter(Boolean) as ResponsesInputContentPart[];
}

function extractResponseText(output?: ResponsesOutputItem[]) {
  if (!output || !Array.isArray(output)) {
    return "";
  }

  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .map((part) => {
      if ((part.type === "output_text" || part.type === "text") && part.text) {
        return part.text;
      }

      if (part.type === "refusal" && part.refusal) {
        return part.refusal;
      }

      return "";
    })
    .join("");
}

function collectCitations(output?: ResponsesOutputItem[]) {
  if (!output || !Array.isArray(output)) {
    return [] as Citation[];
  }

  const citations: Citation[] = [];

  output.forEach((item) => {
    if (item.type !== "message" || !item.content) {
      return;
    }

    item.content.forEach((part) => {
      part.annotations?.forEach((annotation) => {
        if (
          annotation.type === "url_citation" &&
          annotation.url &&
          !citations.some((citation) => citation.url === annotation.url)
        ) {
          citations.push({
            title: annotation.title || annotation.url,
            url: annotation.url,
          });
        }
      });
    });
  });

  return citations;
}

function isMultiAgentModel(model: string) {
  return model.includes("multi-agent");
}

function supportsConfigurableXAIReasoning(model: string) {
  return isMultiAgentModel(model);
}

function resolveXAIReasoningEffort(
  model: string,
  reasoningEffort?:
    | "auto"
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh",
) {
  if (!supportsConfigurableXAIReasoning(model)) {
    return undefined;
  }

  if (
    reasoningEffort === "low" ||
    reasoningEffort === "medium" ||
    reasoningEffort === "high" ||
    reasoningEffort === "xhigh"
  ) {
    return reasoningEffort;
  }

  return undefined;
}

function buildBuiltinTools(modelConfig: {
  enableWebSearch?: boolean;
  enableCodeInterpreter?: boolean;
  enableFileSearch?: boolean;
  vectorStoreIds?: string[];
}) {
  const tools: XAITool[] = [];

  if (modelConfig.enableWebSearch) {
    tools.push({ type: "web_search" }, { type: "x_search" });
  }

  if (modelConfig.enableCodeInterpreter) {
    tools.push({ type: "code_interpreter" });
  }

  if (modelConfig.enableFileSearch && modelConfig.vectorStoreIds?.length) {
    tools.push({
      type: "file_search",
      vector_store_ids: modelConfig.vectorStoreIds,
    });
  }

  return tools;
}

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
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }

    if (typeof res.output_text === "string" && res.output_text.length > 0) {
      return res.output_text;
    }

    return extractResponseText(res.output);
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const input: ResponsesInput[] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      input.push({
        role: v.role,
        content: buildResponsesInputContent(content),
      });
    }

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const [pluginToolsRaw, funcs] = usePluginStore
      .getState()
      .getAsTools(useChatStore.getState().currentSession().mask?.plugin || []);
    const pluginTools = Array.isArray(pluginToolsRaw) ? pluginToolsRaw : [];
    const disableCustomTools = isMultiAgentModel(modelConfig.model);
    const requestTools = buildBuiltinTools(modelConfig);

    if (!disableCustomTools && pluginTools.length > 0) {
      requestTools.push(...(pluginTools as ResponsesTool[]));
    }

    const requestPayload: ResponsesRequestPayload = {
      input,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      top_p: modelConfig.top_p,
      text: {
        format: {
          type: "text",
        },
      },
    };

    if (requestTools.length > 0) {
      requestPayload.tools = requestTools as any;
      requestPayload.include = [];

      if (modelConfig.enableWebSearch) {
        requestPayload.include.push("web_search_call.action.sources");
      }

      if (modelConfig.enableFileSearch && modelConfig.vectorStoreIds?.length) {
        requestPayload.include.push("file_search_call.results");
      }

      if (requestPayload.include.length === 0) {
        delete requestPayload.include;
      }
    }

    const resolvedReasoningEffort = resolveXAIReasoningEffort(
      modelConfig.model,
      modelConfig.reasoningEffort,
    );

    if (resolvedReasoningEffort) {
      requestPayload.reasoning = { effort: resolvedReasoningEffort };
    }

    console.log("[Request] xai payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(XAI.ResponsesPath);
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
        let toolIndex = -1;
        const reasoningAccumulator = new ResponsesReasoningAccumulator();

        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          disableCustomTools ? [] : (pluginTools as any),
          disableCustomTools ? {} : funcs,
          controller,
          (text: string, runTools: ChatMessageTool[]) => {
            const event = JSON.parse(text) as ResponsesStreamEvent;

            if (event.type === "response.output_text.delta") {
              return {
                isThinking: false,
                content: event.delta || "",
              };
            }

            if (event.type === "response.reasoning_summary_text.delta") {
              return {
                isThinking: true,
                content: reasoningAccumulator.appendSummary(event, event.delta),
              };
            }

            if (event.type === "response.reasoning_summary_text.done") {
              return {
                isThinking: true,
                content: reasoningAccumulator.replaceSummary(event, event.text),
              };
            }

            if (
              event.type === "response.reasoning_summary_part.added" ||
              event.type === "response.reasoning_summary_part.done"
            ) {
              return {
                isThinking: true,
                content: reasoningAccumulator.replaceSummary(
                  event,
                  event.part?.type === "summary_text" ? event.part.text : "",
                ),
              };
            }

            if (event.type === "response.reasoning_text.delta") {
              return {
                isThinking: true,
                content: reasoningAccumulator.appendReasoning(
                  event,
                  event.delta,
                ),
              };
            }

            if (event.type === "response.reasoning_text.done") {
              return {
                isThinking: true,
                content: reasoningAccumulator.replaceReasoning(
                  event,
                  event.text,
                ),
              };
            }

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

            if (event.type === "response.output_item.done") {
              const item =
                event.item ??
                (typeof event.output_index === "number"
                  ? event.response?.output?.[event.output_index]
                  : undefined);

              if (
                item?.type === "function_call" &&
                item.name &&
                item.call_id &&
                !disableCustomTools
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

              if (item?.type === "reasoning") {
                return {
                  isThinking: true,
                  content: reasoningAccumulator.hydrateFromOutput([item]),
                };
              }

              return { isThinking: false, content: "" };
            }

            if (event.type === "response.completed") {
              const citations = collectCitations(event.response?.output);
              if (citations.length > 0 && options.onCitations) {
                options.onCitations(citations);
              }

              const finalThinking = reasoningAccumulator.hydrateFromOutput(
                event.response?.output,
              );

              if (finalThinking) {
                return {
                  isThinking: true,
                  content: finalThinking,
                };
              }

              return { isThinking: false, content: "" };
            }

            return { isThinking: false, content: "" };
          },
          (
            payload: ResponsesRequestPayload,
            _toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            toolIndex = -1;

            const toolResults: ResponsesFunctionCallOutputItem[] =
              toolCallResult.map((result: any) => ({
                type: "function_call_output",
                call_id: result.tool_call_id,
                output: result.content,
              }));

            if (Array.isArray(payload.input)) {
              payload.input.push(...toolResults);
            }
          },
          {
            ...options,
            onThinkingUpdate: options.onThinkingUpdate,
          },
          detectResponsesStreamTermination,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const citations = collectCitations(resJson.output);
        if (citations.length > 0 && options.onCitations) {
          options.onCitations(citations);
        }
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

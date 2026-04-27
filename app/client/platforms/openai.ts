"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ApiPath,
  OPENAI_IMAGE_MODELS,
  OPENAI_REASONING_MODELS,
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
import {
  ModelSize,
  DalleQuality,
  DalleStyle,
  ImageModeration,
  ImageQuality,
} from "@/app/typing";

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
  getMessageImages,
  getMessageTextContent,
  isVisionModel,
  isDalle3 as _isDalle3,
  getTimeoutMSByModel,
  isGPT5ImageGenModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

const allowedOpenAIModels = new Set<string>([
  ...OPENAI_REASONING_MODELS,
  ...OPENAI_IMAGE_MODELS,
]);

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
  content: string | ResponsesInputContentPart[];
  type?: "message";
  phase?: "commentary" | "final_answer";
}

export interface ResponsesInputTextPart {
  type: "input_text";
  text: string;
}

export interface ResponsesInputImagePart {
  type: "input_image";
  image_url?: string;
  file_id?: string;
  detail?: "auto" | "low" | "high";
}

export type ResponsesInputContentPart =
  | ResponsesInputTextPart
  | ResponsesInputImagePart;

export type ResponsesImageGenerationSize = "auto" | `${number}x${number}`;

export type ResponsesImageGenerationQuality =
  | "low"
  | "medium"
  | "high"
  | "auto";

export type ResponsesImageGenerationOutputFormat = "png" | "webp" | "jpeg";

// Responses API include 参数支持的值
// 参考: https://platform.openai.com/docs/api-reference/responses
export type ResponsesIncludable =
  | "web_search_call.action.sources" // 包含网络搜索来源
  | "code_interpreter_call.outputs" // 包含代码解释器输出
  | "file_search_call.results" // 包含文件搜索结果
  | "reasoning.encrypted_content" // 包含推理内容
  | "computer_call_output.output.image_url" // 包含计算机调用的图像URL
  | "message.input_image.image_url" // 包含输入消息的图像URL
  | "message.output_text.logprobs"; // 包含输出文本的对数概率

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
    | { type: "function"; name: string }
    | { type: "image_generation" };
  previous_response_id?: string; // 用于多轮对话引用
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    summary?: "auto" | "none" | "concise" | "detailed";
  };
  // 指定响应中要包含的额外数据
  include?: ResponsesIncludable[];
  // 是否存储响应以便后续通过 API 检索
  store?: boolean;
  // 文本响应配置
  text?: {
    format?: {
      type: "text" | "json_object" | "json_schema";
    };
    verbosity?: "low" | "medium" | "high";
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

// GPT-5 图像生成工具类型
export interface ResponsesImageGenerationTool {
  type: "image_generation";
  action?: "generate" | "edit" | "auto";
  // 可选配置参数
  background?: "transparent" | "opaque" | "auto";
  input_fidelity?: "low" | "high";
  input_image_mask?: {
    file_id?: string;
    image_url?: string;
  };
  output_compression?: number;
  output_format?: ResponsesImageGenerationOutputFormat;
  partial_images?: number;
  moderation?: ImageModeration;
  quality?: ResponsesImageGenerationQuality;
  size?: ResponsesImageGenerationSize;
}

// OpenAI 内置 web_search 工具类型
// 参考: https://platform.openai.com/docs/guides/tools-web-search
export interface ResponsesWebSearchTool {
  type: "web_search";
  // 用户位置信息，用于地理位置相关搜索优化
  user_location?: {
    type: "approximate";
    country?: string; // ISO 3166-1 alpha-2 国家代码，如 "US", "CN", "GB"
    city?: string;
    region?: string;
    timezone?: string;
  };
  // 搜索上下文大小，控制检索的网页内容量
  // "low": 快速响应，较少上下文
  // "medium": 平衡模式（默认）
  // "high": 更多上下文，更详细的信息
  search_context_size?: "low" | "medium" | "high";
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
  | "response.reasoning_summary_part.added"
  | "response.reasoning_summary_part.done"
  | "response.reasoning_summary_text.delta"
  | "response.reasoning_summary_text.done"
  | "response.reasoning_text.delta"
  | "response.reasoning_text.done"
  | "response.image_generation_call.generating"
  | "response.image_generation_call.done"
  | "error";

export interface ResponsesAnnotation {
  type: "url_citation";
  url: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

export interface ResponsesTextContentPart {
  type: "text" | "output_text" | "reasoning_text";
  text?: string;
  annotations?: ResponsesAnnotation[];
}

export interface ResponsesRefusalContentPart {
  type: "refusal";
  refusal?: string;
  annotations?: ResponsesAnnotation[];
}

export interface ResponsesSummaryPart {
  type: "summary_text";
  text?: string;
}

export type ResponsesOutputContentPart =
  | ResponsesTextContentPart
  | ResponsesRefusalContentPart;

export interface ResponsesStreamEvent {
  type: ResponsesStreamEventType;
  delta?: string;
  text?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  summary_index?: number;
  response?: ResponsesResponse;
  item?: ResponsesOutputItem;
  part?: ResponsesOutputContentPart | ResponsesSummaryPart;
  error?: { message: string; type: string; code?: string };
  // GPT-5 图像生成相关
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
    | "reasoning"
    | "function_call"
    | "image_generation_call"
    | "web_search_call"
    | "code_interpreter_call"
    | "file_search_call";
  id?: string;
  role?: "assistant";
  content?: ResponsesOutputContentPart[];
  summary?: ResponsesSummaryPart[];
  // function call 相关
  name?: string;
  call_id?: string;
  arguments?: string;
  // image_generation_call 相关 - GPT-5 原生图像生成
  result?: string; // base64 encoded image data
  // web_search_call 相关 - GPT-5 网络搜索结果
  // 搜索结果会直接包含在 output_text 中
  // code_interpreter_call 相关 - GPT-5 代码执行结果
  // 包含执行的代码和输出结果
  code?: string; // 执行的代码
  output?: string; // 代码执行输出
  // file_search_call 相关 - GPT-5 文件搜索结果
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

export type OpenAIImagesApiSize = "auto" | `${number}x${number}`;
export type OpenAIImagesApiQuality = Exclude<ImageQuality, DalleQuality>;
export type OpenAIImagesApiModeration = ImageModeration;

export interface OpenAIImageRequestPayload {
  model: string;
  prompt: string;
  n: number;
  size: OpenAIImagesApiSize;
  quality?: OpenAIImagesApiQuality;
  moderation?: OpenAIImagesApiModeration;
  style?: DalleStyle;
  background?: "transparent" | "opaque";
  output_format?: ResponsesImageGenerationOutputFormat;
}

export interface OpenAIImageResponse {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  background?: "transparent" | "opaque";
  output_format?: ResponsesImageGenerationOutputFormat;
  quality?: OpenAIImagesApiQuality;
  moderation?: OpenAIImagesApiModeration;
  size?: OpenAIImagesApiSize;
}

const OPENAI_IMAGE_MIN_PIXELS = 655_360;
const OPENAI_IMAGE_MAX_PIXELS = 8_294_400;
const OPENAI_IMAGE_MAX_EDGE = 3_840;
const OPENAI_IMAGE_MAX_ASPECT_RATIO = 3;

function isValidOpenAIImageApiSize(size: string): size is OpenAIImagesApiSize {
  if (size === "auto") {
    return true;
  }

  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return false;
  }

  if (width <= 0 || height <= 0) {
    return false;
  }

  if (width % 16 !== 0 || height % 16 !== 0) {
    return false;
  }

  if (Math.max(width, height) > OPENAI_IMAGE_MAX_EDGE) {
    return false;
  }

  const totalPixels = width * height;
  if (
    totalPixels < OPENAI_IMAGE_MIN_PIXELS ||
    totalPixels > OPENAI_IMAGE_MAX_PIXELS
  ) {
    return false;
  }

  return (
    Math.max(width, height) / Math.min(width, height) <=
    OPENAI_IMAGE_MAX_ASPECT_RATIO
  );
}

function normalizeResponsesInputContent(
  content: string | MultimodalContent[],
): {
  content: string | ResponsesInputContentPart[];
  imageCount: number;
} {
  if (typeof content === "string") {
    return { content, imageCount: 0 };
  }

  let imageCount = 0;
  const normalized = content.flatMap<ResponsesInputContentPart>((part) => {
    if (part.type === "text") {
      return part.text
        ? [
            {
              type: "input_text",
              text: part.text,
            },
          ]
        : [];
    }

    if (part.type === "image_url" && part.image_url?.url) {
      imageCount += 1;
      return [
        {
          type: "input_image",
          image_url: part.image_url.url,
        },
      ];
    }

    return [];
  });

  return {
    content: normalized.length > 0 ? normalized : "",
    imageCount,
  };
}

function normalizeResponsesImageGenerationSize(
  size?: ModelSize,
): ResponsesImageGenerationSize {
  if (size && isValidOpenAIImageApiSize(size)) {
    return size;
  }

  return "1024x1024";
}

function normalizeOpenAIImageApiSize(size?: ModelSize): OpenAIImagesApiSize {
  if (size && isValidOpenAIImageApiSize(size)) {
    return size;
  }

  return "1024x1024";
}

function normalizeOpenAIImageApiQuality(
  quality?: ImageQuality,
): OpenAIImagesApiQuality {
  switch (quality) {
    case "low":
    case "medium":
    case "high":
    case "auto":
      return quality;
    case "hd":
    case "standard":
    default:
      return "auto";
  }
}

function normalizeOpenAIImageApiModeration(
  moderation?: ImageModeration,
): OpenAIImagesApiModeration {
  return moderation === "low" ? "low" : "auto";
}

function normalizeOpenAIImageApiBackground(
  background?: "transparent" | "opaque" | "auto",
  model?: string,
): "transparent" | "opaque" | undefined {
  if (!background || background === "auto") {
    return undefined;
  }

  if (model?.toLowerCase() === "gpt-image-2" && background === "transparent") {
    return "opaque";
  }

  return background;
}

function normalizeDalleQuality(quality?: ImageQuality): DalleQuality {
  return quality === "hd" ? "hd" : "standard";
}

function normalizeResponsesImageGenerationQuality(
  quality?: string,
): ResponsesImageGenerationQuality {
  switch (quality) {
    case "low":
    case "medium":
    case "high":
    case "auto":
      return quality;
    case "hd":
      return "auto";
    case "standard":
    default:
      return "auto";
  }
}

function collectResponsesOutputText(output?: ResponsesOutputItem[]): string[] {
  const textParts: string[] = [];

  if (!output || !Array.isArray(output)) {
    return textParts;
  }

  for (const item of output) {
    if (item.type !== "message" || !item.content) {
      continue;
    }

    for (const part of item.content) {
      if ((part.type === "text" || part.type === "output_text") && part.text) {
        textParts.push(part.text);
      }
    }
  }

  return textParts;
}

function collectResponsesReasoningSummary(
  output?: ResponsesOutputItem[],
): string[] {
  const summaryParts: string[] = [];

  if (!output || !Array.isArray(output)) {
    return summaryParts;
  }

  for (const item of output) {
    if (item.type !== "reasoning" || !item.summary) {
      continue;
    }

    for (const part of item.summary) {
      if (part.type === "summary_text" && part.text) {
        summaryParts.push(part.text);
      }
    }
  }

  return summaryParts;
}

function collectResponsesReasoningText(
  output?: ResponsesOutputItem[],
): string[] {
  const reasoningParts: string[] = [];

  if (!output || !Array.isArray(output)) {
    return reasoningParts;
  }

  for (const item of output) {
    if (item.type !== "reasoning" || !item.content) {
      continue;
    }

    for (const part of item.content) {
      if (part.type === "reasoning_text" && part.text) {
        reasoningParts.push(part.text);
      }
    }
  }

  return reasoningParts;
}

function extractResponsesThinkingContent(
  output?: ResponsesOutputItem[],
  preferSummary = true,
): string {
  const summaryText = collectResponsesReasoningSummary(output)
    .join("\n\n")
    .trim();
  const reasoningText = collectResponsesReasoningText(output)
    .join("\n\n")
    .trim();

  if (preferSummary) {
    return summaryText || reasoningText;
  }

  return reasoningText || summaryText;
}

interface ResponsesReasoningDiagnostics {
  hasReasoningItem: boolean;
  hasSummaryText: boolean;
  hasReasoningText: boolean;
  summaryCount: number;
  reasoningTextCount: number;
  outputTypes: ResponsesOutputItem["type"][];
}

interface ResponsesReasoningSummaryLogContext {
  model: string;
  providerName?: string;
  stream: boolean;
  responseId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  reasoningSummary?: "auto" | "none" | "concise" | "detailed";
  requestedSummary: boolean;
}

function collectResponsesReasoningDiagnostics(
  output?: ResponsesOutputItem[],
): ResponsesReasoningDiagnostics {
  const normalizedOutput = Array.isArray(output) ? output : [];
  const summaryParts = collectResponsesReasoningSummary(normalizedOutput);
  const reasoningParts = collectResponsesReasoningText(normalizedOutput);

  return {
    hasReasoningItem: normalizedOutput.some(
      (item) => item.type === "reasoning",
    ),
    hasSummaryText: summaryParts.length > 0,
    hasReasoningText: reasoningParts.length > 0,
    summaryCount: summaryParts.length,
    reasoningTextCount: reasoningParts.length,
    outputTypes: normalizedOutput.map((item) => item.type),
  };
}

function logResponsesReasoningSummaryDiagnostics(
  context: ResponsesReasoningSummaryLogContext,
  output?: ResponsesOutputItem[],
) {
  if (!context.requestedSummary) {
    return;
  }

  const diagnostics = collectResponsesReasoningDiagnostics(output);
  const payload = {
    model: context.model,
    providerName: context.providerName,
    stream: context.stream,
    responseId: context.responseId,
    reasoningEffort: context.reasoningEffort,
    reasoningSummary: context.reasoningSummary,
    ...diagnostics,
  };

  if (diagnostics.hasSummaryText) {
    console.log("[GPT-5] Reasoning summary returned", payload);
    return;
  }

  const hints: string[] = [];
  if (!diagnostics.hasReasoningItem) {
    hints.push("response.output does not contain a reasoning item");
  }
  if (diagnostics.hasReasoningText) {
    hints.push("response contains reasoning_text but no summary_text");
  }
  if (!diagnostics.hasReasoningText && diagnostics.hasReasoningItem) {
    hints.push(
      "response contains a reasoning item, but its summary array is empty",
    );
  }
  hints.push(
    "OpenAI docs note that latest reasoning model summarizers require an organization verified for safe deployment",
  );

  console.warn(
    "[GPT-5] Requested reasoning summary but response did not include summary_text",
    {
      ...payload,
      hints,
    },
  );
}

class ResponsesReasoningNormalizer {
  private readonly preferSummary: boolean;
  private readonly summaryParts = new Map<string, string>();
  private readonly reasoningParts = new Map<string, string>();
  private emittedText = "";

  constructor(preferSummary: boolean) {
    this.preferSummary = preferSummary;
  }

  appendSummary(
    event: Pick<
      ResponsesStreamEvent,
      "output_index" | "summary_index" | "item_id"
    >,
    text?: string,
  ) {
    return this.updatePart(this.summaryParts, event, text, "append", true);
  }

  replaceSummary(
    event: Pick<
      ResponsesStreamEvent,
      "output_index" | "summary_index" | "item_id"
    >,
    text?: string,
  ) {
    return this.updatePart(this.summaryParts, event, text, "replace", true);
  }

  appendReasoning(
    event: Pick<
      ResponsesStreamEvent,
      "output_index" | "content_index" | "item_id"
    >,
    text?: string,
  ) {
    return this.updatePart(
      this.reasoningParts,
      {
        output_index: event.output_index,
        summary_index: event.content_index,
        item_id: event.item_id,
      },
      text,
      "append",
      !this.preferSummary,
    );
  }

  replaceReasoning(
    event: Pick<
      ResponsesStreamEvent,
      "output_index" | "content_index" | "item_id"
    >,
    text?: string,
  ) {
    return this.updatePart(
      this.reasoningParts,
      {
        output_index: event.output_index,
        summary_index: event.content_index,
        item_id: event.item_id,
      },
      text,
      "replace",
      !this.preferSummary,
    );
  }

  hydrateFromItem(item?: ResponsesOutputItem, outputIndex = 0) {
    if (item?.type !== "reasoning") {
      return "";
    }

    item.summary?.forEach((part, summaryIndex) => {
      if (part.type === "summary_text") {
        this.storeValue(
          this.summaryParts,
          this.makeKey(outputIndex, summaryIndex, item.id),
          part.text,
        );
      }
    });

    item.content?.forEach((part, contentIndex) => {
      if (part.type === "reasoning_text") {
        this.storeValue(
          this.reasoningParts,
          this.makeKey(outputIndex, contentIndex, item.id),
          part.text,
        );
      }
    });

    return this.consumePreferredDelta();
  }

  hydrateFromOutput(output?: ResponsesOutputItem[]) {
    if (output && Array.isArray(output)) {
      output.forEach((item, outputIndex) => {
        this.hydrateFromItem(item, outputIndex);
      });
    }

    return this.consumePreferredDelta();
  }

  private updatePart(
    target: Map<string, string>,
    event: Pick<
      ResponsesStreamEvent,
      "output_index" | "summary_index" | "item_id"
    >,
    text: string | undefined,
    mode: "append" | "replace",
    shouldEmit: boolean,
  ) {
    if (!text) {
      return "";
    }

    const key = this.makeKey(
      event.output_index,
      event.summary_index,
      event.item_id,
    );
    const current = target.get(key) ?? "";
    const next = mode === "append" ? current + text : text;

    if (current === next) {
      return shouldEmit ? this.consumePreferredDelta() : "";
    }

    target.set(key, next);
    return shouldEmit ? this.consumePreferredDelta() : "";
  }

  private storeValue(target: Map<string, string>, key: string, value?: string) {
    if (!value) {
      return;
    }

    target.set(key, value);
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

    console.warn(
      "[Responses API] Reasoning summary changed non-monotonically; skipping duplicate append",
    );
    return "";
  }

  private getPreferredText() {
    const summaryText = this.joinOrdered(this.summaryParts);
    const reasoningText = this.joinOrdered(this.reasoningParts);

    if (this.preferSummary) {
      return summaryText || reasoningText;
    }

    return reasoningText || summaryText;
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

function buildStreamedImageResult(
  output?: ResponsesOutputItem[],
): MultimodalContent[] | null {
  if (!output || !Array.isArray(output)) {
    return null;
  }

  const imageResults = output
    .filter((item) => item.type === "image_generation_call" && !!item.result)
    .map((item) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/png;base64,${item.result}`,
      },
    }));

  if (imageResults.length === 0) {
    return null;
  }

  const textParts = collectResponsesOutputText(output);
  const result: MultimodalContent[] = [];

  if (textParts.length > 0) {
    result.push({
      type: "text",
      text: textParts.join(""),
    });
  }

  result.push(...imageResults);
  return result;
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
    // Images API returns either url or b64_json image payloads.
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

    const lowerModel = options.config.model.toLowerCase();
    const isGPT5ReasoningModelForDiagnostics =
      lowerModel.startsWith("gpt-5.4") || lowerModel.startsWith("gpt-5.5");
    const isModernOpenAIImageModel = OPENAI_IMAGE_MODELS.some(
      (model) => model === lowerModel,
    );
    // Azure 仍使用 Chat Completions API（Responses API 可能尚不完全支持）
    const isAzure = modelConfig.providerName === ServiceProvider.Azure;
    const isDalle3 = _isDalle3(options.config.model);

    if (
      isAzure &&
      isGPT5ReasoningModelForDiagnostics &&
      (modelConfig.reasoningSummary ?? "auto") !== "none"
    ) {
      console.warn(
        "[GPT-5] reasoning.summary requested on Azure provider, but this path uses Chat Completions instead of Responses API; reasoning summaries may not be returned.",
        {
          model: options.config.model,
          providerName: modelConfig.providerName,
          reasoningSummary: modelConfig.reasoningSummary ?? "auto",
        },
      );
    }

    if (!isAzure && isModernOpenAIImageModel) {
      return this.chatWithImagesApi(options, modelConfig);
    }

    if (!isAzure && !isDalle3) {
      return this.chatWithResponses(options, modelConfig);
    } else {
      return this.chatWithCompletions(options, modelConfig, isDalle3);
    }
  }

  private async imageUrlToFile(imageUrl: string, index: number): Promise<File> {
    const res = await globalThis.fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to load input image: ${res.status}`);
    }

    const blob = await res.blob();
    const type = blob.type || "image/png";
    const extension = type.split("/")[1] || "png";

    return new File([blob], `image-${index}.${extension}`, {
      type,
    });
  }

  private async chatWithImagesApi(options: ChatOptions, modelConfig: any) {
    const latestUserMessage = [...options.messages]
      .reverse()
      .find((message) => message.role === "user");
    const prompt = getMessageTextContent(
      latestUserMessage ?? (options.messages.slice(-1)?.pop() as any),
    );
    const imageUrls = latestUserMessage
      ? getMessageImages(latestUserMessage)
      : [];
    const isEditRequest = imageUrls.length > 0;

    const controller = new AbortController();
    options.onController?.(controller);
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const chatPath = this.path(
        isEditRequest ? OpenaiPath.ImageEditPath : OpenaiPath.ImagePath,
      );
      const size = normalizeOpenAIImageApiSize(options.config?.size);
      const quality = normalizeOpenAIImageApiQuality(options.config?.quality);
      const moderation = normalizeOpenAIImageApiModeration(
        modelConfig.moderation,
      );
      const background = normalizeOpenAIImageApiBackground(
        modelConfig.imageBackground,
        options.config.model,
      );

      let chatPayload: RequestInit;

      if (isEditRequest) {
        const formData = new FormData();
        formData.append("model", options.config.model);
        formData.append("prompt", prompt);
        formData.append("size", size);
        formData.append("quality", quality);
        formData.append("moderation", moderation);
        formData.append("output_format", "png");

        if (background) {
          formData.append("background", background);
        }

        const imageFiles = await Promise.all(
          imageUrls.map((imageUrl, index) =>
            this.imageUrlToFile(imageUrl, index),
          ),
        );

        imageFiles.forEach((imageFile) => {
          formData.append("image[]", imageFile);
        });

        chatPayload = {
          method: "POST",
          body: formData,
          signal: controller.signal,
          headers: getHeaders(true),
        };
      } else {
        const requestPayload: OpenAIImageRequestPayload = {
          model: options.config.model,
          prompt,
          n: 1,
          size,
          quality,
          moderation,
          output_format: "png",
        };

        if (_isDalle3(options.config.model)) {
          requestPayload.style = options.config?.style ?? "vivid";
        }

        if (background) {
          requestPayload.background = background;
        }

        chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };
      }

      console.log("[Request] openai images payload:", {
        model: options.config.model,
        size,
        quality,
        moderation,
        background,
        isEditRequest,
        imageCount: imageUrls.length,
      });

      requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      const res = await fetch(chatPath, chatPayload);
      clearTimeout(requestTimeoutId);

      const resJson = (await res.json()) as OpenAIImageResponse;
      const message = await this.extractMessage(resJson);
      options.onFinish(message, res);
    } catch (e) {
      console.log("[Request] failed to make an images request", e);
      options.onError?.(e as Error);
    } finally {
      if (requestTimeoutId) {
        clearTimeout(requestTimeoutId);
      }
    }
  }

  // 使用 OpenAI Responses API 进行对话
  private async chatWithResponses(options: ChatOptions, modelConfig: any) {
    const visionModel = isVisionModel(options.config.model);
    const isGPT5ImageGen = isGPT5ImageGenModel(options.config.model);
    const latestUserMessageIndex = options.messages
      .map((message) => message.role)
      .lastIndexOf("user");
    const shouldUseIncrementalInput =
      !!options.previousOpenAIResponseId && latestUserMessageIndex >= 0;

    // 判断是否为 GPT-5.4/5.5 推理模型
    const isGPT5ReasoningModel =
      options.config.model.startsWith("gpt-5.4") ||
      options.config.model.startsWith("gpt-5.5");
    const isGPT5Pro =
      options.config.model === "gpt-5.4-pro" ||
      options.config.model === "gpt-5.5-pro";

    // 提取 system message 作为 instructions
    let instructions: string | undefined;
    const inputMessages: ResponsesInputItem[] = [];
    let latestUserInputImageCount = 0;

    for (const [index, v] of options.messages.entries()) {
      const rawContent = visionModel
        ? await preProcessImageContent(v.content)
        : getMessageTextContent(v);
      const { content, imageCount } =
        normalizeResponsesInputContent(rawContent);

      if (v.role === "system") {
        // 将 system message 提取为 instructions
        instructions =
          typeof content === "string" ? content : JSON.stringify(content);
      } else {
        if (shouldUseIncrementalInput && index !== latestUserMessageIndex) {
          continue;
        }

        // 转换角色：user/assistant 保持不变
        inputMessages.push({
          role: v.role as "user" | "assistant",
          content,
          ...(v.role === "assistant" ? { phase: "final_answer" as const } : {}),
        });

        if (v.role === "user") {
          latestUserInputImageCount = imageCount;
        }
      }
    }

    // 构建 Responses API 请求
    const requestPayload: ResponsesRequestPayload = {
      model: modelConfig.model,
      input: inputMessages,
      stream: options.config.stream,
    };

    // 添加 previous_response_id 用于多轮对话（如果提供）
    if (options.previousOpenAIResponseId) {
      requestPayload.previous_response_id = options.previousOpenAIResponseId;
      console.log(
        "[Responses API] Using previous_response_id:",
        options.previousOpenAIResponseId,
      );
      if (shouldUseIncrementalInput) {
        console.log(
          "[Responses API] Sending only the newest user turn with previous_response_id",
          {
            latestUserMessageIndex,
            inputMessageCount: inputMessages.length,
          },
        );
      }
    }

    // 添加 instructions（如果有 system message）
    if (instructions) {
      requestPayload.instructions = instructions;
    }

    // GPT-5.4/5.5 系列模型参数设置
    // 重要：temperature 和 top_p 只在 reasoning effort 为 "none" 时支持
    if (isGPT5ReasoningModel) {
      // 设置 max_output_tokens
      requestPayload.max_output_tokens = modelConfig.max_tokens;
      requestPayload.text = {
        ...(requestPayload.text ?? {}),
        verbosity: modelConfig.textVerbosity || "medium",
      };

      // 获取用户配置的推理级别，默认为 "auto"
      const userReasoningEffort = modelConfig.reasoningEffort || "auto";
      const reasoningSummary = modelConfig.reasoningSummary || "auto";

      // 根据用户配置或模型默认值确定最终的推理级别
      let finalReasoningEffort:
        | "none"
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | "xhigh";

      // 定义不同模型支持的推理级别
      // gpt-5.4 / gpt-5.5: 支持 none, minimal, low, medium, high, xhigh
      // gpt-5.4-pro / gpt-5.5-pro: 支持 medium, high, xhigh

      if (userReasoningEffort === "auto") {
        // 自动模式：根据模型类型选择默认值
        if (options.config.model === "gpt-5.4-mini") {
          // gpt-5.4-mini 默认使用 "low"（轻量版本）
          finalReasoningEffort = "low";
        } else {
          // gpt-5.4 / gpt-5.5 默认使用 "medium"
          finalReasoningEffort = "medium";
        }
        console.log(
          `[GPT-5] Auto reasoning effort for ${options.config.model}: ${finalReasoningEffort}`,
        );
      } else {
        // 用户明确指定了推理级别，需要验证是否支持
        if (isGPT5Pro) {
          // GPT-5 Pro 不支持 "none"、"minimal" 和 "low"
          if (
            userReasoningEffort === "none" ||
            userReasoningEffort === "minimal" ||
            userReasoningEffort === "low"
          ) {
            finalReasoningEffort = "medium"; // 升级到 medium
            console.warn(
              `[GPT-5 Pro] '${userReasoningEffort}' not supported, falling back to 'medium'`,
            );
          } else {
            finalReasoningEffort = userReasoningEffort;
          }
        } else {
          // 其他 GPT-5.4/5.5 模型支持所有级别
          finalReasoningEffort = userReasoningEffort;
        }
        console.log(
          `[GPT-5] User specified reasoning effort: ${finalReasoningEffort}`,
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
        if (reasoningSummary !== "none") {
          console.warn(
            "[GPT-5] reasoning.summary was requested but omitted because reasoning effort resolved to 'none'.",
            {
              model: options.config.model,
              providerName: modelConfig.providerName,
              reasoningEffort: finalReasoningEffort,
              reasoningSummary,
            },
          );
        }
        console.log(
          "[GPT-5] Reasoning effort 'none': temperature and top_p enabled",
        );
      } else {
        // 非 "none" 级别添加 summary 并删除不支持的参数
        requestPayload.reasoning.summary = reasoningSummary;
        delete requestPayload.temperature;
        delete requestPayload.top_p;
        console.log(
          `[GPT-5] Reasoning effort '${finalReasoningEffort}' with summary '${reasoningSummary}': temperature and top_p disabled`,
        );
      }
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

    // GPT-5.4/5.5 系列模型添加 image_generation 工具支持
    // 当启用 enableImageGeneration 时，模型可以生成图像
    if (isGPT5ImageGen && modelConfig.enableImageGeneration) {
      const shouldEditImage = latestUserInputImageCount > 0;
      const imageGenerationQuality = normalizeResponsesImageGenerationQuality(
        options.config?.quality,
      );
      const imageGenerationBackground = modelConfig.imageBackground || "auto";
      const imageGenerationModeration = modelConfig.moderation || "auto";
      const imageGenTool: ResponsesImageGenerationTool = {
        type: "image_generation",
        size: normalizeResponsesImageGenerationSize(options.config?.size),
      };

      if (shouldEditImage) {
        imageGenTool.action = "edit";
      }
      if (imageGenerationModeration !== "auto") {
        imageGenTool.moderation = imageGenerationModeration;
      }
      if (imageGenerationQuality !== "auto") {
        imageGenTool.quality = imageGenerationQuality;
      }
      if (imageGenerationBackground !== "auto") {
        // 仅在用户显式覆盖默认值时发送背景设置。
        imageGenTool.background = imageGenerationBackground;
      }

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(imageGenTool);
      console.log(
        "[GPT-5] Added image_generation tool with config:",
        imageGenTool,
      );
    } else if (modelConfig.enableImageGeneration && !isGPT5ImageGen) {
      console.warn(
        "[GPT-5] image_generation enabled for a model that is not in the current supported set; skipping tool injection.",
        {
          model: options.config.model,
        },
      );
    }

    // GPT-5.4/5.5 系列模型添加 web_search 内置工具支持
    // 当启用 web_search 时，模型可以自动搜索网络获取最新信息
    if (isGPT5ReasoningModel && modelConfig.enableWebSearch) {
      const webSearchTool: ResponsesWebSearchTool = {
        type: "web_search",
        // 设置用户位置信息，优化地理位置相关搜索
        user_location: {
          type: "approximate",
          country: modelConfig.webSearchCountry || "US",
        },
        // 设置搜索上下文大小，medium 为平衡模式
        search_context_size: modelConfig.webSearchContextSize || "medium",
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(webSearchTool);
      console.log("[GPT-5] Added web_search tool with config:", webSearchTool);
    }

    // GPT-5.4/5.5 系列模型添加 code_interpreter 内置工具支持
    // 当启用 code_interpreter 时，模型可以执行 Python 代码进行计算和数据分析
    if (isGPT5ReasoningModel && modelConfig.enableCodeInterpreter) {
      const codeInterpreterTool: ResponsesCodeInterpreterTool = {
        type: "code_interpreter",
      };

      if (!requestPayload.tools) {
        requestPayload.tools = [];
      }
      requestPayload.tools.push(codeInterpreterTool);
      console.log("[GPT-5] Added code_interpreter tool");
    }

    // GPT-5.4/5.5 系列模型添加 file_search 内置工具支持
    // 当启用 file_search 时，模型可以在矢量存储中搜索文档
    // 注意: 需要先创建 vector store 并配置 vectorStoreIds
    if (
      isGPT5ReasoningModel &&
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
        "[GPT-5] Added file_search tool with vector stores:",
        modelConfig.vectorStoreIds,
      );
    }

    // GPT-5.4/5.5 系列模型工具配置
    // 注意：根据 OpenAI 官方文档，GPT-5 系列模型在 Responses API 中
    // 只支持 tool_choice: "auto"，其他值（如 "required"、"none"）会报错
    // 因此不再显式设置 tool_choice，让 API 使用默认值 "auto"
    // 参考: https://github.com/openai/openai-python/issues/2537
    if (
      isGPT5ReasoningModel &&
      requestPayload.tools &&
      requestPayload.tools.length > 0
    ) {
      console.log(
        "[GPT-5] Configured",
        requestPayload.tools.length,
        "tools (tool_choice defaults to 'auto')",
      );
    }

    // GPT-5.4/5.5 系列模型添加 include 参数
    // include 参数用于指定响应中要包含的额外数据，与工具配置分开处理
    if (isGPT5ReasoningModel) {
      // 添加 include 参数以获取工具调用的详细输出
      // 根据启用的工具类型和推理模式动态添加对应的 include 值
      const includeItems: ResponsesIncludable[] = [];

      if (modelConfig.enableWebSearch) {
        includeItems.push("web_search_call.action.sources");
      }
      if (modelConfig.enableCodeInterpreter) {
        includeItems.push("code_interpreter_call.outputs");
      }
      if (modelConfig.enableFileSearch && modelConfig.vectorStoreIds?.length) {
        includeItems.push("file_search_call.results");
      }
      // 仅在无状态续传场景请求加密推理内容。
      // OpenAI 官方文档将 reasoning.encrypted_content 定位为 store=false/ZDR
      // 等 stateless handoff 场景下保留并回传推理内容的能力。
      const hasReasoningEnabled =
        requestPayload.reasoning?.effort &&
        requestPayload.reasoning.effort !== "none";
      const shouldIncludeEncryptedReasoning =
        hasReasoningEnabled && requestPayload.store === false;
      if (shouldIncludeEncryptedReasoning) {
        includeItems.push("reasoning.encrypted_content");
        console.log(
          "[GPT-5] Stateless reasoning mode enabled, adding reasoning.encrypted_content",
        );
      }

      if (includeItems.length > 0) {
        requestPayload.include = includeItems;
        console.log("[GPT-5] Added include items:", includeItems);
      }

      // 设置 store 为 true 以便后续检索响应
      requestPayload.store = true;
    }

    // 开发者模式下输出完整请求体JSON
    if (process.env.NODE_ENV === "development") {
      console.log("[Responses API] Full request payload:");
      console.log(JSON.stringify(requestPayload, null, 2));
    } else {
      console.log("[Request] openai responses payload: ", requestPayload);
    }

    const shouldStream = !!options.config.stream;
    const shouldPreferReasoningSummary =
      requestPayload.reasoning?.effort !== undefined &&
      requestPayload.reasoning.effort !== "none" &&
      requestPayload.reasoning.summary !== "none";
    const controller = new AbortController();
    options.onController?.(controller);
    let requestTimeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const chatPath = this.path(OpenaiPath.ResponsesPath);

      if (shouldStream) {
        let toolIndex = -1;
        const reasoningNormalizer = new ResponsesReasoningNormalizer(
          shouldPreferReasoningSummary,
        );
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

              // 处理推理摘要增量
              if (event.type === "response.reasoning_summary_text.delta") {
                const content = reasoningNormalizer.appendSummary(
                  event,
                  event.delta,
                );
                return { isThinking: true, content };
              }

              // 处理推理摘要完成态
              if (event.type === "response.reasoning_summary_text.done") {
                const content = reasoningNormalizer.replaceSummary(
                  event,
                  event.text,
                );
                return { isThinking: true, content };
              }

              // 兼容 summary part 事件
              if (
                event.type === "response.reasoning_summary_part.added" ||
                event.type === "response.reasoning_summary_part.done"
              ) {
                const content = reasoningNormalizer.replaceSummary(
                  event,
                  event.part?.type === "summary_text" ? event.part.text : "",
                );
                return { isThinking: true, content };
              }

              // 兼容 reasoning text 事件，作为 summary 不可用时的回退
              if (event.type === "response.reasoning_text.delta") {
                const content = reasoningNormalizer.appendReasoning(
                  {
                    output_index: event.output_index,
                    content_index: event.content_index,
                    item_id: event.item_id,
                  },
                  event.delta,
                );
                return { isThinking: true, content };
              }

              if (event.type === "response.reasoning_text.done") {
                const content = reasoningNormalizer.replaceReasoning(
                  {
                    output_index: event.output_index,
                    content_index: event.content_index,
                    item_id: event.item_id,
                  },
                  event.text,
                );
                return { isThinking: true, content };
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
                const item =
                  event.item ??
                  (typeof event.output_index === "number"
                    ? event.response?.output?.[event.output_index]
                    : undefined);
                const chunks: Array<{
                  isThinking: boolean;
                  content: string | MultimodalContent[];
                }> = [];

                if (item?.type === "reasoning") {
                  const content = reasoningNormalizer.hydrateFromItem(
                    item,
                    event.output_index,
                  );
                  if (content) {
                    chunks.push({ isThinking: true, content });
                  }
                }

                if (
                  item?.type === "function_call" &&
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

                if (item?.type === "image_generation_call" && item.result) {
                  console.log("[GPT-5] Image generation completed in stream");
                }

                if (chunks.length === 1) {
                  return chunks[0];
                }

                if (chunks.length > 1) {
                  return chunks;
                }

                return { isThinking: false, content: "" };
              }

              // 处理图像生成进行中事件
              if (event.type === "response.image_generation_call.generating") {
                console.log("[GPT-5] Image generation in progress...");
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
                console.log("[GPT-5] Image generation completed");
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

                logResponsesReasoningSummaryDiagnostics(
                  {
                    model: options.config.model,
                    providerName: modelConfig.providerName,
                    stream: true,
                    responseId,
                    reasoningEffort: requestPayload.reasoning?.effort,
                    reasoningSummary: requestPayload.reasoning?.summary,
                    requestedSummary: shouldPreferReasoningSummary,
                  },
                  event.response.output,
                );

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
                    "[GPT-5 web_search] Extracted citations:",
                    collectedCitations,
                  );
                  options.onCitations(collectedCitations);
                }

                const finalThinkingContent =
                  reasoningNormalizer.hydrateFromOutput(event.response.output);

                const completionChunks: Array<{
                  isThinking: boolean;
                  content: string | MultimodalContent[];
                }> = [];

                if (finalThinkingContent) {
                  completionChunks.push({
                    isThinking: true,
                    content: finalThinkingContent,
                  });
                }

                const streamedImageResult = buildStreamedImageResult(
                  event.response.output,
                );
                if (streamedImageResult) {
                  console.log(
                    "[GPT-5] Returning streamed image generation result",
                  );
                  completionChunks.push({
                    isThinking: false,
                    content: streamedImageResult,
                  });
                }

                if (completionChunks.length === 1) {
                  return completionChunks[0];
                }

                if (completionChunks.length > 1) {
                  return completionChunks;
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
        logResponsesReasoningSummaryDiagnostics(
          {
            model: options.config.model,
            providerName: modelConfig.providerName,
            stream: false,
            responseId: resJson.id,
            reasoningEffort: requestPayload.reasoning?.effort,
            reasoningSummary: requestPayload.reasoning?.summary,
            requestedSummary: shouldPreferReasoningSummary,
          },
          resJson.output,
        );
        const thinkingContent = extractResponsesThinkingContent(
          resJson.output,
          shouldPreferReasoningSummary,
        );
        if (thinkingContent) {
          options.onThinkingUpdate?.(thinkingContent, thinkingContent);
        }
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
            "[GPT-5 web_search] Extracted citations (non-stream):",
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
            console.log("[GPT-5] Image generated and uploaded:", imageUrl);
          } catch (e) {
            console.error("[GPT-5] Failed to process generated image:", e);
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
            if (
              (part.type === "text" || part.type === "output_text") &&
              part.text
            ) {
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

  // 使用传统 Chat Completions API（用于 Azure 文本对话和 Azure DALL-E）
  private async chatWithCompletions(
    options: ChatOptions,
    modelConfig: any,
    isDalle3: boolean,
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
        quality: normalizeDalleQuality(options.config?.quality),
        style: options.config?.style ?? "vivid",
      };
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        messages.push({ role: v.role, content });
      }

      requestPayload = {
        messages,
        stream: options.config.stream,
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        presence_penalty: modelConfig.presence_penalty,
        frequency_penalty: modelConfig.frequency_penalty,
        top_p: modelConfig.top_p,
      };

      if (visionModel) {
        requestPayload["max_tokens"] = Math.max(modelConfig.max_tokens, 4000);
      }
    }

    console.log("[Request] openai completions payload: ", requestPayload);

    const shouldStream = !isDalle3 && !!options.config.stream;
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
    const chatModels = resJson.data?.filter((m) =>
      allowedOpenAIModels.has(m.id),
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

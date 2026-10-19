import {
  getMessageTextContent,
  isPureImageGenerationModel,
  safeLocalStorage,
  trimTopic,
} from "../utils";

import { indexedDBStorage, pausePersist } from "@/app/utils/indexedDB-storage";
import { nanoid } from "nanoid";
import { shallow } from "zustand/shallow";
import type {
  ClientApi,
  MultimodalContent,
  RequestMessage,
} from "../client/api";
import { getClientApi } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  // MCP模板常量已移除 - 生产环境清理
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import {
  selectMessagesToSummarize,
  selectShortTermHistory,
  shouldSendLongTermMemory as getShouldSendLongTermMemory,
} from "../utils/history-strategy";
import { createFrameThrottle } from "../utils/raf-throttle";
import { createPersistStore } from "../utils/store";
import { buildSystemPrompt } from "../utils/system-prompt";
import { estimateTokenLength } from "../utils/token";
import {
  addUsageToStat,
  type TokenUsage,
  type UsageStat,
} from "../utils/token-usage";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import {
  collectModelsWithDefaultModel,
  replaceRetiredXAIModels,
} from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
// MCP功能已移除 - 生产环境清理

const localStorage = safeLocalStorage();

// Streaming re-renders run at most once per animation frame and no more often
// than this. Well under a 60Hz frame (16.7ms), so every 60Hz frame qualifies
// despite timestamp jitter, while 120Hz displays update on every other frame:
// at most ~60 re-renders per second. The text is typed out per frame, so
// skipping 60Hz frames showed up as uneven steps.
const STREAMING_UPDATE_THROTTLE_MS = 12;

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
  // {{CHENGQI:
  // Action: Added - thoughtSignature 字段支持 Google Gemini API
  // Timestamp: 2025-11-28 Claude Opus 4.5
  // Reason: 根据 Google API 文档，thoughtSignature 必须在多步函数调用中原样返回
  // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
  // Principle_Applied: API 规范遵循，确保函数调用链路完整性
  // }}
  thoughtSignature?: string;
};

// {{CHENGQI:
// Action: Added - 引用来源数据类型定义
// Timestamp: 2025-01-02 16:00:00 +08:00
// Reason: 为聊天消息添加引用来源功能，支持XAI返回的citations数据
// Principle_Applied: SOLID - 单一职责，引用数据结构清晰定义
// Optimization: 支持title和url，如果没有title则用url代替
// Architectural_Note (AR): 引用数据结构与现有消息系统集成
// Documentation_Note (DW): 引用来源的数据结构定义，支持扩展
// }}
export type Citation = {
  title: string;
  url: string;
};

// {{CHENGQI:
// Action: Added - Google 响应 Part 类型定义
// Timestamp: 2025-11-28 Claude Opus 4.5
// Reason: 支持 Google Gemini API 的 thoughtSignature 多轮对话功能
// Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
// Rules:
//   - 图片生成/编辑: 第一个 part 和所有 inlineData parts 都必须有 thoughtSignature
//   - 函数调用: 每个步骤的第一个 functionCall 必须有签名
//   - 文本响应: 签名可选但推荐保留
// Principle_Applied: API 规范遵循，确保多轮对话上下文完整性
// }}
export interface GoogleResponsePart {
  /** 文本内容 */
  text?: string;
  /** 是否为思考内容 */
  thought?: boolean;
  /** 思路签名 - 必须在后续请求中原样返回 */
  thoughtSignature?: string;
  /** 图像数据 (仅保存 mimeType，不保存 base64 数据以节省存储) */
  inlineData?: {
    mimeType: string;
    // data 不保存到存储中，因为太大
  };
  /** 是否有图像数据 (用于标记该 part 原本包含图像) */
  hasInlineData?: boolean;
}

export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  thinkingContent?: string;
  citations?: Citation[];
  // isMcpResponse属性已移除 - 生产环境清理
  // {{CHENGQI:
  // Action: Added - Google Parts 存储字段
  // Timestamp: 2025-11-28 Claude Opus 4.5
  // Reason: 存储 Google 响应的 parts 结构，用于多轮对话中附加 thoughtSignature
  // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
  // Architectural_Note (AR): 仅 Google 平台使用，其他平台忽略此字段
  // }}
  googleParts?: GoogleResponsePart[];
  // {{CHENGQI:
  // Action: Added - OpenAI Responses API response ID 存储字段
  // Timestamp: 2025-12-21 Claude Opus 4.5
  // Reason: 存储 OpenAI Responses API 的 response id，用于 previous_response_id 多轮对话
  // Reference: https://platform.openai.com/docs/api-reference/responses
  // Architectural_Note (AR): 仅 OpenAI Responses API 使用，其他平台忽略此字段
  // }}
  openaiResponseId?: string;
  // xAI Responses API response ID 存储字段
  xaiResponseId?: string;
  // provider-reported token usage, including prompt cache hits
  usage?: TokenUsage;
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

// Usage accumulators (inputTokens, cachedTokens, ...) are optional so
// sessions persisted before usage tracking stay valid.
export interface ChatStat extends UsageStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

// {{CHENGQI:
// Action: Modified - 添加 archivedMessages 字段
// Timestamp: 2025-11-23 06:10:00 +08:00
// Reason: 阶段 3.1 - 支持历史消息分页加载
// Principle_Applied: 数据分层存储，优化内存占用
// Optimization: 将旧消息归档，按需加载
// Architectural_Note (AR): archivedMessages 存储已归档的消息，messages 存储当前显示的消息
// Documentation_Note (DW): 历史消息分页加载，优化长对话性能
// }}
export interface ChatSession {
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  archivedMessages?: ChatMessage[]; // 已归档的历史消息
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;
  // append history strategy: index the sent history starts at after the most
  // recent trim (missing => 0)
  appendStartIndex?: number;

  mask: Mask;
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

function getStreamingTextContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => part.type === "text" && !!part.text)
    .map((part) => part.text ?? "")
    .join("");
}

function getStreamingImageParts(
  content: ChatMessage["content"],
): MultimodalContent[] {
  if (typeof content === "string") {
    return [];
  }

  return content.flatMap((part) => {
    if (part.type !== "image_url" || !part.image_url?.url) {
      return [];
    }

    return [
      {
        type: "image_url" as const,
        image_url: {
          url: part.image_url.url,
        },
      },
    ];
  });
}

function mergeStreamingMessageContent(
  current: ChatMessage["content"],
  next: ChatMessage["content"],
): ChatMessage["content"] {
  const currentText = getStreamingTextContent(current);
  const currentImages = getStreamingImageParts(current);

  if (typeof next === "string") {
    if (currentImages.length === 0) {
      return next;
    }

    const merged: MultimodalContent[] = [];
    if (next) {
      merged.push({ type: "text", text: next });
    }
    merged.push(...currentImages);
    return merged;
  }

  const nextText = getStreamingTextContent(next);
  const nextImages = getStreamingImageParts(next);
  const mergedImages = nextImages.length > 0 ? nextImages : currentImages;

  if (mergedImages.length === 0) {
    return nextText || currentText;
  }

  const merged: MultimodalContent[] = [];
  const mergedText = nextText || currentText;

  if (mergedText) {
    merged.push({ type: "text", text: mergedText });
  }

  merged.push(...mergedImages);
  return merged;
}

function createEmptySession(): ChatSession {
  return {
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    archivedMessages: [], // 初始化归档消息数组
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // For GPT conversations, prefer the dedicated lightweight summarize model.
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function estimateMessageTokens(msg: ChatMessage) {
  return estimateTokenLength(getMessageTextContent(msg));
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce((pre, cur) => pre + estimateMessageTokens(cur), 0);
}

function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

// MCP系统提示已移除 - 生产环境清理

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
};

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [newSession, ...state.sessions],
        }));
      },

      clearSessions() {
        set(() => ({
          sessions: [createEmptySession()],
          currentSessionIndex: 0,
        }));
      },

      selectSession(index: number) {
        set({
          currentSessionIndex: index,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          // modify current session id
          let newIndex = oldIndex === from ? to : oldIndex;
          if (oldIndex > from && oldIndex <= to) {
            newIndex -= 1;
          } else if (oldIndex < from && oldIndex >= to) {
            newIndex += 1;
          }

          return {
            currentSessionIndex: newIndex,
            sessions: newSessions,
          };
        });
      },

      newSession(mask?: Mask) {
        const session = createEmptySession();

        if (mask) {
          const config = useAppConfig.getState();
          const globalModelConfig = config.modelConfig;

          session.mask = {
            ...mask,
            modelConfig: {
              ...globalModelConfig,
              ...mask.modelConfig,
            },
          };
          session.topic = mask.name;
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentIndex = get().currentSessionIndex;
        let nextIndex = Math.min(
          currentIndex - Number(index < currentIndex),
          sessions.length - 1,
        );

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          sessions,
        }));

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
            },
          },
          5000,
        );
      },

      currentSession() {
        let index = get().currentSessionIndex;
        const sessions = get().sessions;

        if (index < 0 || index >= sessions.length) {
          index = Math.min(sessions.length - 1, Math.max(0, index));
          set(() => ({ currentSessionIndex: index }));
        }

        const session = sessions[index];

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          // Create new messages array reference to trigger React re-render
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        get().checkMcpJson(message);

        get().summarizeSession(false, targetSession);
      },

      async onUserInput(
        content: string,
        attachImages?: string[],
        // isMcpResponse参数已移除 - 生产环境清理
      ) {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // MCP Response no need to fill template
        // MCP响应处理已移除 - 生产环境清理
        let mContent: string | MultimodalContent[] = fillTemplateWith(
          content,
          modelConfig,
        );

        if (attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        let userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          // isMcpResponse属性已移除 - 生产环境清理
        });

        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
        });

        // get recent messages
        const recentMessages = await get().getMessagesWithMemory([userMessage]);
        const sendMessages = recentMessages.concat(userMessage);
        const messageIndex = session.messages.length + 1;

        // {{CHENGQI:
        // Action: Added - 获取上一次 OpenAI Response ID 用于多轮对话
        // Timestamp: 2025-12-21 Claude Opus 4.5
        // Reason: 支持 OpenAI Responses API 的 previous_response_id 多轮对话
        // Reference: https://platform.openai.com/docs/api-reference/responses
        // Architectural_Note (AR): 从最后一条 assistant 消息获取 openaiResponseId
        // }}
        // 获取上一次的 OpenAI / xAI response id（用于 Responses API 多轮对话）
        let previousOpenAIResponseId: string | undefined;
        let previousXAIResponseId: string | undefined;
        const lastAssistantMessage = session.messages
          .slice()
          .reverse()
          .find((m) => m.role === "assistant");
        if (
          modelConfig.providerName === ServiceProvider.OpenAI &&
          lastAssistantMessage?.openaiResponseId
        ) {
          previousOpenAIResponseId = lastAssistantMessage.openaiResponseId;
        }
        if (
          modelConfig.providerName === ServiceProvider.XAI &&
          lastAssistantMessage?.xaiResponseId
        ) {
          previousXAIResponseId = lastAssistantMessage.xaiResponseId;
        }

        // save user's and bot's message
        get().updateTargetSession(session, (session) => {
          const savedUserMessage = {
            ...userMessage,
            content: mContent,
          };
          session.messages = session.messages.concat([
            savedUserMessage,
            botMessage,
          ]);
        });

        // botMessage is mutated in place by the callbacks below.
        //
        // Streamed content and thinking share one frame-throttled flush that
        // only notifies subscribers, without swapping the sessions/messages
        // arrays. The chat page and sidebar watch those arrays, so they stay
        // put; the streaming message selects its own fields and re-renders
        // alone (see ChatMessageItem). Everything else, including the end of
        // the stream, is a regular update that re-renders the whole page.
        const notifyStreaming = () => set({});
        const commitBotMessage = () =>
          get().updateTargetSession(session, (session) => {
            // New messages array reference to trigger a React re-render
            session.messages = session.messages.concat();
          });
        const scheduleStreamingUpdate = createFrameThrottle(notifyStreaming, {
          minIntervalMs: STREAMING_UPDATE_THROTTLE_MS,
        });
        // Each chat store write serializes every session, so hold them back
        // until the reply is complete (see pausePersist). The new messages
        // saved above are still written on the normal schedule.
        const resumePersist = pausePersist(StoreKey.Chat);

        const api: ClientApi = getClientApi(modelConfig.providerName);
        // make request
        api.llm
          .chat({
            messages: sendMessages,
            config: { ...modelConfig, stream: true },
            // 传递 previous_response_id 用于 OpenAI Responses API 多轮对话
            previousOpenAIResponseId,
            // 传递 previous_response_id 用于 xAI Responses API 多轮对话
            previousXAIResponseId,
            // 用于生成 OpenAI/xAI 的 prompt_cache_key
            sessionId: session.id,
            onUpdate(message) {
              botMessage.streaming = true;
              if (
                (typeof message === "string" && message.length > 0) ||
                (Array.isArray(message) && message.length > 0)
              ) {
                botMessage.content = mergeStreamingMessageContent(
                  botMessage.content,
                  message,
                );
              }

              scheduleStreamingUpdate();
            },
            // {{CHENGQI:
            // Action: Enhanced - 思考内容更新回调 (添加节流)
            // Timestamp: 2025-11-21 Claude 4.5 sonnet
            // Reason: P1-LD-005任务 - 在onUserInput中集成思考内容回调
            // Bug_Fixed: 添加节流机制,避免移动端崩溃
            // Principle_Applied: SOLID - 单一职责的思考内容管理
            // Optimization: 思考内容与主内容分离，独立更新botMessage,节流减少状态更新
            // Architectural_Note (AR): 思考内容存储在ChatMessage.thinkingContent字段
            // Documentation_Note (DW): 思考内容通过独立回调实时更新，不影响主内容流
            // }}
            onThinkingUpdate(thinkingContent) {
              if (thinkingContent) {
                botMessage.thinkingContent = thinkingContent;
              }

              scheduleStreamingUpdate();
            },
            // {{CHENGQI:
            // Action: Added - Citations回调处理
            // Timestamp: 2025-01-02 16:25:00 +08:00
            // Reason: 在onUserInput中添加onCitations回调，将引用来源存储到botMessage
            // Principle_Applied: SOLID - 单一职责的citations数据管理
            // Optimization: Citations数据在响应完成时一次性存储
            // Architectural_Note (AR): Citations数据与现有消息系统集成
            // Documentation_Note (DW): Citations数据通过回调存储到ChatMessage.citations字段
            // }}
            onCitations(citations) {
              if (citations && citations.length > 0) {
                botMessage.citations = citations;
                commitBotMessage();
              }
            },
            // {{CHENGQI:
            // Action: Added - Google Parts 回调处理
            // Timestamp: 2025-11-28 Claude Opus 4.5
            // Reason: 支持 Google Gemini API 的 thoughtSignature 多轮对话功能
            // Reference: https://ai.google.dev/gemini-api/docs/thought-signatures
            // Principle_Applied: 将 thoughtSignature 存储到消息中，用于后续对话
            // Architectural_Note (AR):
            //   - googleParts 包含 thoughtSignature 和相关元数据
            //   - 用于图片生成/编辑的多轮对话中保持签名
            // Documentation_Note (DW): Google Parts 通过回调存储到 ChatMessage.googleParts 字段
            // }}
            onGoogleParts(parts) {
              if (parts && parts.length > 0) {
                botMessage.googleParts = parts;
                if (process.env.NODE_ENV === "development") {
                  console.log(
                    "[Google ThoughtSignature] Saved to botMessage:",
                    {
                      partsCount: parts.length,
                      signatures: parts.map((p) =>
                        p.thoughtSignature ? "yes" : "no",
                      ),
                    },
                  );
                }
                commitBotMessage();
              }
            },
            async onFinish(message, _responseRes, usage) {
              botMessage.streaming = false;
              // Covers stop/abort too: aborting the controller ends in onFinish.
              // Removed before the update below so that components re-checking
              // ChatControllerPool.hasPending() on it see the request gone.
              ChatControllerPool.remove(session.id, botMessage.id);
              // The regular update below supersedes any pending streaming flush
              scheduleStreamingUpdate.cancel();
              if (usage) {
                botMessage.usage = usage;
                const session_ = get().sessions.find(
                  (s) => s.id === session.id,
                );
                if (session_)
                  session_.stat = addUsageToStat(session_.stat, usage);
              }
              if (message) {
                botMessage.content = message;
                botMessage.date = new Date().toLocaleString();
              }
              // {{CHENGQI:
              // Action: Fixed - iPad M3 思考内容和引用显示bug
              // Timestamp: 2025-11-24 Claude 4.5 sonnet
              // Reason: 节流机制可能导致最后一次thinkingContent/citations更新被吞掉，iPad Safari严格要求React状态同步
              // Bug_Fixed: onFinish时强制触发一次状态更新，确保所有内容都被渲染
              // Principle_Applied: KISS - 在流式结束时确保最终状态正确
              // Optimization: 避免iPad Safari渲染引擎的严格限制
              // Architectural_Note (AR): iPad Safari对React状态更新要求比macOS Safari更严格
              // Documentation_Note (DW): 修复iPad M3下ThinkingWindow和Citations不显示的bug
              // }}
              // 强制触发一次状态更新，确保思考内容和引用被正确渲染（特别是iPad Safari）
              // A regular update, also without a final message: it is what
              // re-renders the page and sidebar once the stream ends.
              commitBotMessage();
              try {
                if (message) {
                  get().onNewMessage(botMessage, session);
                }
              } finally {
                // Last, so that one write covers the updates above too
                resumePersist();
              }
            },
            // {{CHENGQI:
            // Action: Added - OpenAI Response ID 回调处理
            // Timestamp: 2025-12-21 Claude Opus 4.5
            // Reason: 存储 OpenAI Responses API 返回的 response id，用于多轮对话
            // Reference: https://platform.openai.com/docs/api-reference/responses
            // Architectural_Note (AR): 将 response id 存储到 botMessage，用于下次请求
            // }}
            onOpenAIResponseId(responseId: string) {
              if (responseId) {
                botMessage.openaiResponseId = responseId;
                // 触发状态更新以保存 response id
                commitBotMessage();
              }
            },
            onXAIResponseId(responseId: string) {
              if (responseId) {
                botMessage.xaiResponseId = responseId;
                commitBotMessage();
              }
            },
            // Tools get a new array on each change (not edited in place) so the
            // rendered message can tell that they changed
            onBeforeTool(tool: ChatMessageTool) {
              botMessage.tools = [...(botMessage.tools ?? []), tool];
              commitBotMessage();
            },
            onAfterTool(tool: ChatMessageTool) {
              botMessage.tools = botMessage.tools?.map((t) =>
                tool.id == t.id ? { ...tool } : t,
              );
              commitBotMessage();
            },
            onError(error) {
              const isAborted = error.message?.includes?.("aborted");
              botMessage.content +=
                "\n\n" +
                prettyObject({
                  error: true,
                  message: error.message,
                });
              botMessage.streaming = false;
              userMessage.isError = !isAborted;
              botMessage.isError = !isAborted;
              // Same order as onFinish: remove, then one regular update
              ChatControllerPool.remove(
                session.id,
                botMessage.id ?? messageIndex,
              );
              scheduleStreamingUpdate.cancel();
              commitBotMessage();
              resumePersist();

              console.error("[Chat] failed ", error);
            },
            onController(controller) {
              // collect controller for stop/retry
              ChatControllerPool.addController(
                session.id,
                botMessage.id ?? messageIndex,
                controller,
              );
              // Let stop buttons re-check ChatControllerPool.hasPending()
              notifyStreaming();
              // A stop normally ends in onFinish right away; this covers one
              // that doesn't (e.g. while tool calls run)
              controller.signal.addEventListener("abort", () =>
                setTimeout(resumePersist, 0),
              );
            },
          })
          .catch((error) => {
            // A request that failed without reaching onError
            resumePersist();
            throw error;
          });
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      // pendingMessages: the new input about to be sent; it is not returned,
      // only counted against the append-mode context budget.
      async getMessagesWithMemory(pendingMessages: ChatMessage[] = []) {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const clearContextIndex = session.clearContextIndex ?? 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-") ||
            session.mask.modelConfig.model.startsWith("grok-"));

        // MCP功能已移除 - 生产环境清理
        const mcpEnabled = false;
        const mcpSystemPrompt = "";

        var systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content:
                buildSystemPrompt(modelConfig, new Date()) + mcpSystemPrompt,
            }),
          ];
        } else if (mcpEnabled) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: mcpSystemPrompt,
            }),
          ];
        }

        if (shouldInjectSystemPrompts || mcpEnabled) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        // long term memory
        const shouldSendLongTermMemory = getShouldSendLongTermMemory({
          sendMemory: modelConfig.sendMemory,
          memoryPrompt: session.memoryPrompt,
          lastSummarizeIndex: session.lastSummarizeIndex,
          clearContextIndex,
        });
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: selected by modelConfig.historyStrategy
        // 4. newest input message
        const history = selectShortTermHistory({
          messages,
          clearContextIndex,
          lastSummarizeIndex: session.lastSummarizeIndex,
          sendLongTermMemory: shouldSendLongTermMemory,
          modelConfig,
          estimateTokens: estimateMessageTokens,
          appendStartIndex: session.appendStartIndex,
          overheadTokens: countMessages([
            ...systemPrompts,
            ...longTermMemoryPrompts,
            ...contextPrompts,
            ...pendingMessages,
          ]),
        });
        const { contextStartIndex, memoryStartIndex } = history;

        // append mode: remember where a trim moved the history start, so the
        // following requests keep the same prefix and summarizeSession can
        // fold the dropped messages into the memory.
        if (
          history.strategy === "append" &&
          history.appendStartIndex !== (session.appendStartIndex ?? 0)
        ) {
          get().updateTargetSession(session, (session) => {
            session.appendStartIndex = history.appendStartIndex;
          });
        }

        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...history.messages,
        ];

        // Debug logging for clear context feature
        console.log("[Clear Context Debug]", {
          clearContextIndex,
          totalMessages: totalMessageCount,
          contextStartIndex,
          memoryStartIndex,
          shouldSendLongTermMemory,
          historyStrategy: history.strategy,
          appendStartIndex: history.appendStartIndex,
          trimmed: history.trimmed,
          longTermMemoryCount: longTermMemoryPrompts.length,
          contextPromptsCount: contextPrompts.length,
          recentMessagesCount: history.messages.length,
          totalSendingMessages: recentMessages.length,
        });

        // {{CHENGQI:
        // Action: Added - 清理消息，移除 thinkingContent 等不需要发送给 API 的字段
        // Timestamp: 2025-12-01 Claude Opus 4.5
        // Reason: 思考内容（thinkingContent）不应该作为记忆（上下文）一起发送给 LLM API
        // Principle_Applied:
        //   - 数据最小化：只发送 API 需要的字段
        //   - 隐私保护：避免将内部推理过程暴露给 API
        //   - 性能优化：减少发送的数据量，节省 token
        // Optimization:
        //   - thinkingContent: 思考内容仅用于 UI 显示，不发送
        //   - googleParts: Google 平台需要此字段用于 thoughtSignature 多轮对话，保留
        //   - citations, tools, audio_url 等: API 响应字段，不需要发送回去
        // Architectural_Note (AR):
        //   - 思考内容存储在 session.messages 中，UI 显示不受影响
        //   - 此处理仅影响发送给 API 的消息，不影响本地存储的消息
        // Documentation_Note (DW):
        //   - 修复了思考内容被错误地作为上下文发送的问题
        //   - 保持 Google 平台的 thoughtSignature 功能正常
        // }}
        const cleanedMessages = recentMessages.map((msg) => {
          // 基础字段：只保留 API 需要的字段
          const cleanedMsg: RequestMessage & {
            googleParts?: typeof msg.googleParts;
            thinkingContent?: string;
          } = {
            role: msg.role,
            content: msg.content,
          };

          // Google 平台需要 googleParts 用于 thoughtSignature 多轮对话
          // 参考: https://ai.google.dev/gemini-api/docs/thought-signatures
          if (msg.googleParts && msg.googleParts.length > 0) {
            cleanedMsg.googleParts = msg.googleParts;
          }

          // DeepSeek needs earlier reasoning back when a request has tools
          // (web search, plugins). The platform sends it only then.
          if (
            modelConfig.providerName === ServiceProvider.DeepSeek &&
            msg.role === "assistant" &&
            msg.thinkingContent
          ) {
            cleanedMsg.thinkingContent = msg.thinkingContent;
          }

          return cleanedMsg;
        });

        return cleanedMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;
        // skip summarize for image-only models handled by the OpenAI Images API
        if (isPureImageGenerationModel(modelConfig.model)) {
          return;
        }

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const api: ClientApi = getClientApi(providerName as ServiceProvider);

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );
          api.llm.chat({
            messages: topicMessages,
            config: {
              model,
              stream: false,
              providerName,
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                get().updateTargetSession(
                  session,
                  (session) =>
                    (session.topic =
                      typeof message === "string" && message.length > 0
                        ? trimTopic(message)
                        : DEFAULT_TOPIC),
                );
              }
            },
          });
        }
        // window: summarize once the uncompressed history passes
        // compressMessageLengthThreshold. append: only after a trim dropped
        // messages the memory doesn't cover yet.
        const summary = selectMessagesToSummarize({
          messages,
          clearContextIndex: session.clearContextIndex ?? 0,
          lastSummarizeIndex: session.lastSummarizeIndex,
          modelConfig,
          estimateTokens: estimateMessageTokens,
          appendStartIndex: session.appendStartIndex,
          summarizeModel: model,
        });
        const toBeSummarizedMsgs = summary.messages;
        const historyMsgLength = summary.historyMsgLength;

        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = summary.nextSummarizeIndex;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (summary.shouldSummarize) {
          /** Destruct max_tokens while summarizing
           * this param is just shit
           **/
          const { max_tokens, ...modelcfg } = modelConfig;
          api.llm.chat({
            messages: toBeSummarizedMsgs.concat(
              createMessage({
                role: "system",
                content: Locale.Store.Prompt.Summarize,
                date: "",
              }),
            ),
            config: {
              ...modelcfg,
              stream: true,
              model,
              providerName,
            },
            onUpdate(message) {
              if (typeof message === "string") {
                session.memoryPrompt = message;
              }
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                console.log("[Memory] ", message);
                get().updateTargetSession(session, (session) => {
                  session.lastSummarizeIndex = lastSummarizeIndex;
                  // 只有字符串类型的消息才能作为记忆提示
                  if (typeof message === "string") {
                    session.memoryPrompt = message;
                  }
                });
              }
            },
            onError(err) {
              console.error("[Summarize] ", err);
            },
          });
        }
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;

        const session = sessions[index];
        updater(session);

        // Create new sessions array to trigger Zustand update
        set(() => ({ sessions: [...sessions] }));
      },
      async clearAllData() {
        await indexedDBStorage.clear();
        localStorage.clear();
        location.reload();
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },

      /** MCP功能已移除 - 生产环境清理 */
      checkMcpJson(message: ChatMessage) {
        // MCP功能已移除，方法保留以确保兼容性
        return;
      },

      // {{CHENGQI:
      // Action: Modified - 增强自动清理旧消息功能，将旧消息保存到 archivedMessages
      // Timestamp: 2025-11-23 06:15:00 +08:00
      // Reason: 阶段 3.1 - 支持历史消息分页加载，确保数据不丢失
      // Principle_Applied: 数据分层存储，优化内存占用
      // Optimization: 将旧消息归档到 archivedMessages，按需加载
      // Architectural_Note (AR): archivedMessages 存储已归档的消息，messages 存储当前显示的消息
      // Documentation_Note (DW): 自动清理旧消息，支持历史消息分页加载
      // }}
      cleanupOldMessages(session: ChatSession, keepCount = 100) {
        if (session.messages.length <= keepCount) {
          console.log("[Memory] 消息数量未超过阈值，无需清理");
          return;
        }

        const messagesToArchive = session.messages.slice(
          0,
          session.messages.length - keepCount,
        );
        const messagesToKeep = session.messages.slice(-keepCount);

        console.log("[Memory] 清理旧消息:", {
          total: session.messages.length,
          toArchive: messagesToArchive.length,
          toKeep: messagesToKeep.length,
          keepCount,
        });

        // 更新会话，将旧消息归档，只保留最近的消息
        get().updateTargetSession(session, (session) => {
          // 将旧消息添加到归档消息数组
          if (!session.archivedMessages) {
            session.archivedMessages = [];
          }
          session.archivedMessages.push(...messagesToArchive);

          // 只保留最近的消息
          session.messages = messagesToKeep;

          console.log(
            "[Memory] 归档消息数量:",
            session.archivedMessages.length,
          );
        });

        // 触发垃圾回收（如果可用）
        if ((window as any).gc) {
          (window as any).gc();
        }

        console.log(
          "[Memory] 消息清理完成，当前消息数量:",
          messagesToKeep.length,
        );
      },

      // {{CHENGQI:
      // Action: Added - 添加历史消息分页加载功能
      // Timestamp: 2025-11-23 06:20:00 +08:00
      // Reason: 阶段 3.1 - 实现历史消息的懒加载功能
      // Principle_Applied: 按需加载，优化性能
      // Optimization: 从 archivedMessages 分页加载消息到 messages
      // Architectural_Note (AR): 每次加载 50 条消息，避免一次性加载过多
      // Documentation_Note (DW): 历史消息分页加载，优化长对话性能
      // }}
      loadHistoryMessages(session: ChatSession, loadCount = 50): boolean {
        if (
          !session.archivedMessages ||
          session.archivedMessages.length === 0
        ) {
          console.log("[History] 没有更多历史消息");
          return false;
        }

        // 从归档消息中取出最后 loadCount 条消息
        const messagesToLoad = session.archivedMessages.slice(-loadCount);
        const remainingArchived = session.archivedMessages.slice(0, -loadCount);

        console.log("[History] 加载历史消息:", {
          toLoad: messagesToLoad.length,
          remaining: remainingArchived.length,
          currentMessages: session.messages.length,
        });

        // 更新会话，将历史消息添加到当前消息前面
        get().updateTargetSession(session, (session) => {
          session.archivedMessages = remainingArchived;
          session.messages = [...messagesToLoad, ...session.messages];

          console.log(
            "[History] 加载完成，当前消息数量:",
            session.messages.length,
          );
        });

        return true;
      },
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.4,
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = 4;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      if (version < 3.4) {
        newState.sessions.forEach((s) =>
          replaceRetiredXAIModels(s.mask?.modelConfig),
        );
      }

      return newState as any;
    },
  },
);

/** The current session, clamped like `currentSession()` but without writes. */
export function selectCurrentSession(state: {
  sessions: ChatSession[];
  currentSessionIndex: number;
}): ChatSession {
  const { sessions, currentSessionIndex } = state;
  const index = Math.min(sessions.length - 1, Math.max(0, currentSessionIndex));
  return sessions[index];
}

/**
 * The current session, re-rendering on every chat store update except
 * streaming flushes.
 *
 * Sessions are mutated in place and regular updates swap in a new `sessions`
 * array, which is the change signal this hook watches. Streaming flushes keep
 * the arrays (see `onUserInput`), so components using this hook stay put
 * while a reply streams in.
 */
export function useCurrentSession(): ChatSession {
  return useChatStore(
    (state) => [selectCurrentSession(state), state.sessions] as const,
    shallow,
  )[0];
}

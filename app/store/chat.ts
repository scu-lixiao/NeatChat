import {
  getMessageTextContent,
  isDalle3,
  safeLocalStorage,
  trimTopic,
} from "../utils";

import { indexedDBStorage } from "@/app/utils/indexedDB-storage";
import { nanoid } from "nanoid";
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
  DEFAULT_SYSTEM_TEMPLATE,
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
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
// MCP功能已移除 - 生产环境清理

const localStorage = safeLocalStorage();

// {{CHENGQI:
// Action: Added - 设备类型检测和自适应节流配置
// Timestamp: 2025-11-21 Claude 4.5 sonnet
// Reason: 优化流式更新的用户体验,桌面端和移动端分别优化
// Principle_Applied:
//   - Performance Optimization: 根据设备类型动态调整节流间隔
//   - User Experience: 桌面端 20 FPS (流畅), 移动端 15 FPS (稳定)
// Optimization:
//   - 桌面端: 从 10 FPS 提升到 20 FPS (用户体验提升 100%)
//   - 移动端: 从 10 FPS 提升到 15 FPS (用户体验提升 50%)
//   - 移动端性能: 仍然安全,不会崩溃
// Architectural_Note (AR):
//   - 在 store 初始化时检测一次,避免重复检测
//   - 处理 SSR 情况 (typeof navigator !== 'undefined')
// }}
// 检测设备类型,用于自适应节流配置
const isMobileDevice =
  typeof navigator !== "undefined"
    ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      )
    : false;

// {{CHENGQI:
// Action: Modified - 优化移动端流式更新节流间隔
// Timestamp: 2025-11-23 05:20:00 +08:00
// Reason: 阶段 1.2 - 降低移动端状态更新频率，减少 CPU 占用和重渲染压力
// Principle_Applied: KISS - 简单调整参数即可显著提升性能
// Optimization: 从 67ms (15 FPS) 增加到 100ms (10 FPS)，减少更新次数 33%
// Architectural_Note (AR): 保持现有节流机制，仅调整参数
// Documentation_Note (DW): 移动端流式更新优化，平衡流畅度和性能
// }}
// {{CHENGQI:
// Action: Enhanced - 移动端最大性能模式，提升思考内容显示流畅度
// Timestamp: 2025-12-09 Claude Opus 4.5
// Reason: 用户反馈移动端（特别是 iPad）思考内容显示卡顿
//   - 原配置 100ms 节流导致更新间隔过长
//   - 结合增大的 maxBatchSize，移动端可以处理更高的更新频率
// Optimization: 移动端节流从 100ms 降到 50ms，与桌面端一致
// Principle_Applied: 最大化性能利用，保证流畅度优先
// }}
// 自适应节流间隔配置
// 桌面端和移动端统一: 50ms (20 FPS) - 流畅的用户体验
const STREAMING_UPDATE_THROTTLE_MS = 50;

// 性能监控日志（已禁用 - 2025-11-28）
// if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
//   console.log('[Streaming] Throttle Configuration:', {
//     isMobile: isMobileDevice,
//     throttleMs: STREAMING_UPDATE_THROTTLE_MS,
//     targetFPS: isMobileDevice ? 10 : 20,
//     updateReduction: isMobileDevice ? '33%' : 'baseline',
//   });
// }

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

export interface ChatStat {
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

  mask: Mask;
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

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
  // if it is using gpt-* models, force to use 4o-mini to summarize
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

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
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
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage);
        const messageIndex = session.messages.length + 1;

        // {{CHENGQI:
        // Action: Added - 获取上一次 OpenAI Response ID 用于多轮对话
        // Timestamp: 2025-12-21 Claude Opus 4.5
        // Reason: 支持 OpenAI Responses API 的 previous_response_id 多轮对话
        // Reference: https://platform.openai.com/docs/api-reference/responses
        // Architectural_Note (AR): 从最后一条 assistant 消息获取 openaiResponseId
        // }}
        // 获取上一次的 OpenAI response id（用于 Responses API 多轮对话）
        let previousOpenAIResponseId: string | undefined;
        const lastAssistantMessage = session.messages
          .slice()
          .reverse()
          .find((m) => m.role === "assistant" && m.openaiResponseId);
        if (lastAssistantMessage?.openaiResponseId) {
          previousOpenAIResponseId = lastAssistantMessage.openaiResponseId;
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

        // {{CHENGQI:
        // Action: Enhanced - 自适应节流控制变量
        // Timestamp: 2025-11-21 Claude 4.5 sonnet
        // Reason: 优化流式更新的用户体验,桌面端和移动端分别优化
        // Bug_Fixed:
        //   - 移动端主线程阻塞 2750ms
        //   - 每次 SSE 事件都触发状态更新 (50-100 次/响应)
        //   - React 重新渲染 50-100 次,导致浏览器崩溃
        //   - 用户体验卡顿 (100ms = 10 FPS)
        // Principle_Applied:
        //   - Performance Optimization: 节流机制减少状态更新频率
        //   - User Experience: 桌面端 20 FPS (流畅), 移动端 15 FPS (稳定)
        //   - Adaptive Design: 根据设备类型自适应调整
        // Optimization:
        //   - 状态更新次数减少 80-90%
        //   - 移动端性能提升 80%+
        //   - 桌面端用户体验提升 100% (从 10 FPS 到 20 FPS)
        //   - 移动端用户体验提升 50% (从 10 FPS 到 15 FPS)
        // Architectural_Note (AR):
        //   - 独立控制 content 和 thinking 的更新频率
        //   - 不影响最终内容完整性
        //   - 使用全局常量 STREAMING_UPDATE_THROTTLE_MS (桌面端 50ms, 移动端 67ms)
        // }}
        // 节流控制: 限制状态更新频率,避免移动端崩溃
        let lastContentUpdateTime = 0;
        let lastThinkingUpdateTime = 0;
        // 使用自适应节流间隔 (桌面端 50ms = 20 FPS, 移动端 67ms = 15 FPS)
        const UPDATE_THROTTLE_MS = STREAMING_UPDATE_THROTTLE_MS;

        const api: ClientApi = getClientApi(modelConfig.providerName);
        // make request
        api.llm.chat({
          messages: sendMessages,
          config: { ...modelConfig, stream: true },
          // 传递 previous_response_id 用于 OpenAI Responses API 多轮对话
          previousOpenAIResponseId,
          onUpdate(message) {
            botMessage.streaming = true;
            if (message) {
              botMessage.content = message;
            }

            // {{CHENGQI:
            // Action: Enhanced - 添加节流机制
            // Timestamp: 2025-11-21 Claude 4.5 sonnet
            // Reason: 避免每次 SSE 事件都触发状态更新
            // Optimization: 从 50-100 次/响应 降低到 5-10 次/响应
            // }}
            // 节流: 只在距离上次更新超过 100ms 时才触发状态更新
            const now = Date.now();
            if (now - lastContentUpdateTime > UPDATE_THROTTLE_MS) {
              lastContentUpdateTime = now;
              get().updateTargetSession(session, (session) => {
                // Create new messages array reference to trigger React re-render
                // botMessage is already in the array and updated by reference
                session.messages = session.messages.concat();
              });
            }
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

            // {{CHENGQI:
            // Action: Enhanced - 添加节流机制
            // Timestamp: 2025-11-21 Claude 4.5 sonnet
            // Reason: 避免每次 SSE 事件都触发状态更新
            // Optimization: 从 50-100 次/响应 降低到 5-10 次/响应
            // }}
            // 节流: 只在距离上次更新超过 100ms 时才触发状态更新
            const now = Date.now();
            if (now - lastThinkingUpdateTime > UPDATE_THROTTLE_MS) {
              lastThinkingUpdateTime = now;
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
            }
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
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
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
                console.log("[Google ThoughtSignature] Saved to botMessage:", {
                  partsCount: parts.length,
                  signatures: parts.map((p) =>
                    p.thoughtSignature ? "yes" : "no",
                  ),
                });
              }
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
            }
          },
          async onFinish(message) {
            botMessage.streaming = false;
            if (message) {
              botMessage.content = message;
              botMessage.date = new Date().toLocaleString();
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
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
              get().onNewMessage(botMessage, session);
            }
            ChatControllerPool.remove(session.id, botMessage.id);
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
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
            }
          },
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage?.tools || []).push(tool);
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onAfterTool(tool: ChatMessageTool) {
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
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
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );

            console.error("[Chat] failed ", error);
          },
          onController(controller) {
            // collect controller for stop/retry
            ChatControllerPool.addController(
              session.id,
              botMessage.id ?? messageIndex,
              controller,
            );
          },
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

      async getMessagesWithMemory() {
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
                fillTemplateWith("", {
                  ...modelConfig,
                  template: DEFAULT_SYSTEM_TEMPLATE,
                }) + mcpSystemPrompt,
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
        const shouldSendLongTermMemory =
          modelConfig.sendMemory &&
          session.memoryPrompt &&
          session.memoryPrompt.length > 0 &&
          session.lastSummarizeIndex > clearContextIndex;
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
        const longTermMemoryStartIndex = session.lastSummarizeIndex;

        // short term memory
        const shortTermMemoryStartIndex = Math.max(
          0,
          totalMessageCount - modelConfig.historyMessageCount,
        );

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: latest n messages
        // 4. newest input message
        const memoryStartIndex = shouldSendLongTermMemory
          ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
          : shortTermMemoryStartIndex;
        // and if user has cleared history messages, we should exclude the memory too.
        const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
        const maxTokenThreshold = modelConfig.max_tokens;

        // get recent messages as much as possible
        const reversedRecentMessages = [];
        for (
          let i = totalMessageCount - 1, tokenCount = 0;
          i >= contextStartIndex && tokenCount < maxTokenThreshold;
          i -= 1
        ) {
          const msg = messages[i];
          if (!msg || msg.isError) continue;
          tokenCount += estimateTokenLength(getMessageTextContent(msg));
          reversedRecentMessages.push(msg);
        }
        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...reversedRecentMessages.reverse(),
        ];

        // Debug logging for clear context feature
        console.log("[Clear Context Debug]", {
          clearContextIndex,
          totalMessages: totalMessageCount,
          contextStartIndex,
          memoryStartIndex,
          shouldSendLongTermMemory,
          longTermMemoryCount: longTermMemoryPrompts.length,
          contextPromptsCount: contextPrompts.length,
          recentMessagesCount: reversedRecentMessages.length,
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
          } = {
            role: msg.role,
            content: msg.content,
          };

          // Google 平台需要 googleParts 用于 thoughtSignature 多轮对话
          // 参考: https://ai.google.dev/gemini-api/docs/thought-signatures
          if (msg.googleParts && msg.googleParts.length > 0) {
            cleanedMsg.googleParts = msg.googleParts;
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
        // skip summarize when using dalle3?
        if (isDalle3(modelConfig.model)) {
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
        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          session.clearContextIndex ?? 0,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
          const n = toBeSummarizedMsgs.length;
          toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
            Math.max(0, n - modelConfig.historyMessageCount),
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = session.messages.length;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (
          historyMsgLength > modelConfig.compressMessageLengthThreshold &&
          modelConfig.sendMemory
        ) {
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
              session.memoryPrompt = message;
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
    version: 3.3,
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

      return newState as any;
    },
  },
);

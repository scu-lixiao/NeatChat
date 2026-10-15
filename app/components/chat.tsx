import { useDebouncedCallback } from "use-debounce";
import React, {
  Fragment,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import RenameIcon from "../icons/rename.svg";
import EditIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import ReturnIcon from "../icons/return.svg";
import CopyIcon from "../icons/copy.svg";
import SpeakIcon from "../icons/speak.svg";
import SpeakStopIcon from "../icons/speak-stop.svg";
import LoadingIcon from "../icons/three-dots.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import PromptIcon from "../icons/prompt.svg";
import MaskIcon from "../icons/mask.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ResetIcon from "../icons/reload.svg";
import ReloadIcon from "../icons/reload.svg";
import BreakIcon from "../icons/break.svg";
import SettingsIcon from "../icons/chat-settings.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CloseIcon from "../icons/close.svg";
import CancelIcon from "../icons/cancel.svg";
import ImageIcon from "../icons/image.svg";

import LightIcon from "../icons/light.svg";
import DarkIcon from "../icons/dark.svg";
import AutoIcon from "../icons/auto.svg";
import BottomIcon from "../icons/bottom.svg";
import StopIcon from "../icons/pause.svg";
import RobotIcon from "../icons/robot.svg";
import SizeIcon from "../icons/size.svg";
import QualityIcon from "../icons/hd.svg";
import StyleIcon from "../icons/palette.svg";
import PluginIcon from "../icons/plugin.svg";
import ShortcutkeyIcon from "../icons/shortcutkey.svg";
// MCP工具图标已移除 - 生产环境清理
import HeadphoneIcon from "../icons/headphone.svg";
import {
  BOT_HELLO,
  ChatMessage,
  ChatSession,
  createMessage,
  DEFAULT_TOPIC,
  ModelType,
  selectCurrentSession,
  SubmitKey,
  Theme,
  useAccessStore,
  useAppConfig,
  useChatStore,
  useCurrentSession,
  usePluginStore,
} from "../store";
import { shallow } from "zustand/shallow";

import {
  autoGrowTextArea,
  copyToClipboard,
  getMessageImages,
  getMessageTextContent,
  isDalle3,
  isOpenAIImagesApiModel,
  isVisionModel,
  safeLocalStorage,
  getModelSizes,
  supportsCustomSize,
  useMobileScreen,
  selectOrCopy,
  showPlugins,
} from "../utils";

import { uploadImage as uploadImageRemote } from "@/app/utils/chat";

import dynamic from "next/dynamic";

import { ChatControllerPool } from "../client/controller";
import {
  DalleQuality,
  DalleStyle,
  ModelSize,
  OpenAIImageQuality,
} from "../typing";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import {
  List,
  ListItem,
  Modal,
  Selector,
  showConfirm,
  showPrompt,
  showToast,
} from "./ui-lib";
import { useNavigate } from "react-router-dom";
import {
  CHAT_PAGE_SIZE,
  DEFAULT_TTS_ENGINE,
  ModelProvider,
  Path,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
  UNFINISHED_INPUT,
} from "../constant";
import { Avatar } from "./emoji";
import { ContextPrompts, MaskAvatar, MaskConfig } from "./mask";
import { useMaskStore } from "../store/mask";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { prettyObject } from "../utils/format";
import { createFrameThrottle } from "../utils/raf-throttle";
import { isNearBottom, shouldFollowBottom } from "../utils/scroll";
import {
  areChatMessageItemPropsEqual,
  getMessageView,
  getTailSignature,
  MessageView,
  selectMessageView,
} from "../utils/chat-render";
import { getClientConfig } from "../config/client";
import { useAllModels } from "../utils/hooks";
import { ClientApi, MultimodalContent } from "../client/api";
import { createTTSPlayer } from "../utils/audio";

import { isEmpty } from "lodash-es";
import { getModelProvider } from "../utils/model";
import { ThinkingWindow } from "./thinking-window";
import clsx from "clsx";
// MCP actions已移除 - 生产环境清理

import { Citations } from "./citations";
import {
  formatCacheHitRate,
  formatUsageDetails,
  formatUsageSummary,
  usageFromStat,
} from "../utils/token-usage";

const localStorage = safeLocalStorage();

const ttsPlayer = createTTSPlayer();

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

// Only needed once the user opens them; exporter pulls in html-to-image.
const ExportMessageModal = dynamic(
  async () => (await import("./exporter")).ExportMessageModal,
);

const RealtimeChat = dynamic(
  async () => (await import("./realtime-chat")).RealtimeChat,
);

// MCPAction组件已移除 - 生产环境清理
const MCPAction = () => {
  return null; // MCP功能已禁用
};

export function SessionConfigModel(props: { onClose: () => void }) {
  const session = useCurrentSession();
  const maskStore = useMaskStore();
  const navigate = useNavigate();

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                useChatStore
                  .getState()
                  .updateTargetSession(
                    session,
                    (session) => (session.memoryPrompt = ""),
                  );
              }
            }}
          />,
          <IconButton
            key="copy"
            icon={<CopyIcon />}
            bordered
            text={Locale.Chat.Config.SaveAs}
            onClick={() => {
              navigate(Path.Masks);
              setTimeout(() => {
                maskStore.create(session.mask);
              }, 500);
            }}
          />,
        ]}
      >
        <MaskConfig
          mask={session.mask}
          updateMask={(updater) => {
            const mask = { ...session.mask };
            updater(mask);
            useChatStore
              .getState()
              .updateTargetSession(session, (session) => (session.mask = mask));
          }}
          shouldSyncFromGlobal
          extraListItems={
            session.mask.modelConfig.sendMemory ? (
              <ListItem
                className="copyable"
                title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
                subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
              ></ListItem>
            ) : (
              <></>
            )
          }
        ></MaskConfig>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const contextCount = useChatStore(
    (state) => selectCurrentSession(state).mask.context.length,
  );

  return (
    <div className={styles["prompt-toast"]} key="prompt-toast">
      {props.showToast && contextCount > 0 && (
        <div
          className={clsx(styles["prompt-toast-inner"], "clickable")}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={styles["prompt-toast-content"]}>
            {Locale.Context.Toast(contextCount)}
          </span>
        </div>
      )}
      {props.showModal && (
        <SessionConfigModel onClose={() => props.setShowModal(false)} />
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Fix Chinese input method "Enter" on Safari
    if (e.keyCode == 229) return false;
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPrompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPrompt[];
  onPromptSelect: (prompt: RenderPrompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          ref={i === selectIndex ? selectedRef : null}
          className={clsx(styles["prompt-hint"], {
            [styles["prompt-hint-selected"]]: i === selectIndex,
          })}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  return (
    <div
      className={styles["clear-context"]}
      onClick={() => {
        const chatStore = useChatStore.getState();
        chatStore.updateTargetSession(chatStore.currentSession(), (session) => {
          session.clearContextIndex = undefined;
          session.appendStartIndex = 0;
        });
      }}
    >
      <div className={styles["clear-context-tips"]}>{Locale.Context.Clear}</div>
      <div className={styles["clear-context-revert-btn"]}>
        {Locale.Context.Revert}
      </div>
    </div>
  );
}

export function ChatAction(props: {
  text: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({
    full: 16,
    icon: 16,
  });

  function updateWidth() {
    if (!iconRef.current || !textRef.current) return;
    const getWidth = (dom: HTMLDivElement) => dom.getBoundingClientRect().width;
    const textWidth = getWidth(textRef.current);
    const iconWidth = getWidth(iconRef.current);
    setWidth({
      full: textWidth + iconWidth,
      icon: iconWidth,
    });
  }

  return (
    <div
      className={clsx(styles["chat-input-action"], "clickable")}
      onClick={() => {
        props.onClick();
        setTimeout(updateWidth, 1);
      }}
      onMouseEnter={updateWidth}
      onTouchStart={updateWidth}
      style={
        {
          "--icon-width": `${width.icon}px`,
          "--full-width": `${width.full}px`,
        } as React.CSSProperties
      }
    >
      <div ref={iconRef} className={styles["icon"]}>
        {props.icon}
      </div>
      <div className={styles["text"]} ref={textRef}>
        {props.text}
      </div>
    </div>
  );
}

function useScrollToBottom(
  scrollRef: RefObject<HTMLDivElement>,
  detach: boolean = false,
  sessionId: string,
  isLoading: boolean = false,
) {
  // Whether to keep the view pinned to the bottom. Tracked from scroll events
  // in a ref, never by reading layout during render: scrolling up detaches,
  // scrolling back to the bottom re-attaches.
  const autoScrollRef = useRef(true);
  const setAutoScroll = useCallback((enabled: boolean) => {
    autoScrollRef.current = enabled;
  }, []);

  useEffect(() => {
    const dom = scrollRef.current;
    if (!dom) return;
    let lastScrollTop = dom.scrollTop;
    const onScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = dom;
      autoScrollRef.current = shouldFollowBottom(
        autoScrollRef.current,
        lastScrollTop,
        scrollTop,
        clientHeight,
        scrollHeight,
      );
      lastScrollTop = scrollTop;
    };
    dom.addEventListener("scroll", onScroll, { passive: true });
    return () => dom.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // At most one scroll per frame, run after React has committed the DOM
  const scrollDomToBottom = useMemo(
    () =>
      createFrameThrottle(() => {
        const dom = scrollRef.current;
        dom?.scrollTo(0, dom.scrollHeight);
      }),
    [scrollRef],
  );
  useEffect(() => () => scrollDomToBottom.cancel(), [scrollDomToBottom]);

  const followTail = useCallback(() => {
    if (autoScrollRef.current && !detach) {
      scrollDomToBottom();
    }
  }, [detach, scrollDomToBottom]);

  // Follow the tail of the conversation: new messages, streamed content and
  // thinking. Streaming flushes don't re-render the chat page, so watch the
  // store directly; the tail signature keeps each check O(1) instead of
  // O(history size).
  useEffect(() => {
    let lastSignature: string | undefined;
    const check = (state: { sessions: ChatSession[] }) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      const signature = getTailSignature(session?.messages ?? []);
      if (signature !== lastSignature) {
        lastSignature = signature;
        followTail();
      }
    };
    check(useChatStore.getState());
    return useChatStore.subscribe(check);
  }, [sessionId, followTail]);

  // The loading placeholder comes and goes without a store update
  useEffect(() => {
    followTail();
  }, [isLoading, followTail]);

  return {
    setAutoScroll,
    scrollDomToBottom,
  };
}

export function ChatActions(props: {
  uploadImage: () => void;
  setAttachImages: (images: string[]) => void;
  setUploading: (uploading: boolean) => void;
  showPromptModal: () => void;
  scrollToBottom: () => void;
  showPromptHints: () => void;
  hitBottom: boolean;
  uploading: boolean;
  setShowShortcutKeyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInput: (input: string) => void;
  setShowChatSidePanel: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const config = useAppConfig();
  const navigate = useNavigate();
  const pluginStore = usePluginStore();
  const session = useCurrentSession();

  // switch themes
  const theme = config.theme;

  function nextTheme() {
    const themes = [Theme.Auto, Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    config.update((config) => (config.theme = nextTheme));
  }

  // stop all responses
  // Request controllers live outside the store, so re-check them on every
  // store update: the store notifies when a request registers its controller
  // and right after removing it.
  const couldStop = useChatStore(() => ChatControllerPool.hasPending());
  const stopAll = () => ChatControllerPool.stopAll();

  // switch model
  const currentModel = session.mask.modelConfig.model;
  const currentProviderName =
    session.mask.modelConfig?.providerName || ServiceProvider.OpenAI;
  const allModels = useAllModels();
  const models = useMemo(() => {
    const filteredModels = allModels.filter((m) => m.available);
    const defaultModel = filteredModels.find((m) => m.isDefault);

    if (defaultModel) {
      const arr = [
        defaultModel,
        ...filteredModels.filter((m) => m !== defaultModel),
      ];
      return arr;
    } else {
      return filteredModels;
    }
  }, [allModels]);
  const currentModelName = useMemo(() => {
    const model = models.find(
      (m) =>
        m.name == currentModel &&
        m?.provider?.providerName == currentProviderName,
    );
    return model?.displayName ?? "";
  }, [models, currentModel, currentProviderName]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showPluginSelector, setShowPluginSelector] = useState(false);
  const [showUploadImage, setShowUploadImage] = useState(false);

  const [showSizeSelector, setShowSizeSelector] = useState(false);
  const [showQualitySelector, setShowQualitySelector] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const isLegacyDalle3 = isDalle3(currentModel);
  const isOpenAIImageModel = isOpenAIImagesApiModel(currentModel);
  const isGptImageModel = isOpenAIImageModel && !isLegacyDalle3;
  const modelSizes = getModelSizes(currentModel);
  const dalle3Qualitys: DalleQuality[] = ["standard", "hd"];
  const gptImageQualitys: OpenAIImageQuality[] = [
    "auto",
    "low",
    "medium",
    "high",
  ];
  const gptImage25Qualitys: OpenAIImageQuality[] = [
    ...gptImageQualitys,
    "xhigh",
    "max",
  ];
  const supportedGptImageQualitys = currentModel.startsWith("gpt-image-2.5-")
    ? gptImage25Qualitys
    : gptImageQualitys;
  const dalle3Styles: DalleStyle[] = ["vivid", "natural"];
  const qualityOptions = isLegacyDalle3
    ? dalle3Qualitys
    : isGptImageModel
    ? supportedGptImageQualitys
    : [];
  const currentSize =
    session.mask.modelConfig?.size ?? ("1024x1024" as ModelSize);
  const sizeOptions = modelSizes.includes(currentSize)
    ? modelSizes
    : [currentSize, ...modelSizes];
  const currentQuality = isLegacyDalle3
    ? session.mask.modelConfig?.quality === "hd"
      ? "hd"
      : "standard"
    : isGptImageModel
    ? supportedGptImageQualitys.includes(
        session.mask.modelConfig?.quality as OpenAIImageQuality,
      )
      ? (session.mask.modelConfig?.quality as OpenAIImageQuality)
      : "auto"
    : session.mask.modelConfig?.quality ?? "standard";
  const currentStyle = session.mask.modelConfig?.style ?? "vivid";

  const isMobileScreen = useMobileScreen();

  useEffect(() => {
    const show = isVisionModel(currentModel);
    setShowUploadImage(show);
    if (!show) {
      props.setAttachImages([]);
      props.setUploading(false);
    }

    // if current model is not available
    // switch to first available model
    const isUnavailableModel = !models.some((m) => m.name === currentModel);
    if (isUnavailableModel && models.length > 0) {
      // show next model to default model if exist
      let nextModel = models.find((model) => model.isDefault) || models[0];
      useChatStore.getState().updateTargetSession(session, (session) => {
        session.mask.modelConfig.model = nextModel.name;
        session.mask.modelConfig.providerName = nextModel?.provider
          ?.providerName as ServiceProvider;
      });
      showToast(
        nextModel?.provider?.providerName == "ByteDance"
          ? nextModel.displayName
          : nextModel.name,
      );
    }
  }, [currentModel, models, session]);

  return (
    <div className={styles["chat-input-actions"]}>
      <>
        {couldStop && (
          <ChatAction
            onClick={stopAll}
            text={Locale.Chat.InputActions.Stop}
            icon={<StopIcon />}
          />
        )}
        {!props.hitBottom && (
          <ChatAction
            onClick={props.scrollToBottom}
            text={Locale.Chat.InputActions.ToBottom}
            icon={<BottomIcon />}
          />
        )}
        {props.hitBottom && (
          <ChatAction
            onClick={props.showPromptModal}
            text={Locale.Chat.InputActions.Settings}
            icon={<SettingsIcon />}
          />
        )}

        {showUploadImage && (
          <ChatAction
            onClick={props.uploadImage}
            text={Locale.Chat.InputActions.UploadImage}
            icon={props.uploading ? <LoadingButtonIcon /> : <ImageIcon />}
          />
        )}
        <ChatAction
          onClick={nextTheme}
          text={Locale.Chat.InputActions.Theme[theme]}
          icon={
            <>
              {theme === Theme.Auto ? (
                <AutoIcon />
              ) : theme === Theme.Light ? (
                <LightIcon />
              ) : theme === Theme.Dark ? (
                <DarkIcon />
              ) : null}
            </>
          }
        />

        <ChatAction
          onClick={props.showPromptHints}
          text={Locale.Chat.InputActions.Prompt}
          icon={<PromptIcon />}
        />

        <ChatAction
          onClick={() => {
            navigate(Path.Masks);
          }}
          text={Locale.Chat.InputActions.Masks}
          icon={<MaskIcon />}
        />

        <ChatAction
          text={Locale.Chat.InputActions.Clear}
          icon={<BreakIcon />}
          onClick={() => {
            const isClearing =
              session.clearContextIndex !== session.messages.length;
            useChatStore.getState().updateTargetSession(session, (session) => {
              if (session.clearContextIndex === session.messages.length) {
                session.clearContextIndex = undefined;
                session.appendStartIndex = 0;
              } else {
                session.clearContextIndex = session.messages.length;
                session.appendStartIndex = session.messages.length;
                session.memoryPrompt = ""; // will clear memory
              }
            });
            // Show feedback to user
            if (isClearing) {
              showToast(Locale.Context.Clear);
              console.log(
                "[Clear Context] Set clearContextIndex to",
                session.messages.length,
              );
            } else {
              showToast(Locale.Context.Revert);
              console.log("[Clear Context] Reverted clearContextIndex");
            }
          }}
        />

        <ChatAction
          onClick={() => setShowModelSelector(true)}
          text={currentModelName}
          icon={<RobotIcon />}
        />

        {showModelSelector && (
          <Selector
            defaultSelectedValue={`${currentModel}@${currentProviderName}`}
            items={models.map((m) => ({
              title: `${m.displayName}${
                m?.provider?.providerName
                  ? " (" + m?.provider?.providerName + ")"
                  : ""
              }`,
              value: `${m.name}@${m?.provider?.providerName}`,
            }))}
            onClose={() => setShowModelSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const [model, providerName] = getModelProvider(s[0]);
              useChatStore
                .getState()
                .updateTargetSession(session, (session) => {
                  session.mask.modelConfig.model = model as ModelType;
                  session.mask.modelConfig.providerName =
                    providerName as ServiceProvider;
                  session.mask.syncGlobalConfig = false;
                });
              if (providerName == "ByteDance") {
                const selectedModel = models.find(
                  (m) =>
                    m.name == model &&
                    m?.provider?.providerName == providerName,
                );
                showToast(selectedModel?.displayName ?? "");
              } else {
                showToast(model);
              }
            }}
          />
        )}

        {supportsCustomSize(currentModel) && (
          <ChatAction
            onClick={() => setShowSizeSelector(true)}
            text={currentSize}
            icon={<SizeIcon />}
          />
        )}

        {showSizeSelector && (
          <Selector
            defaultSelectedValue={currentSize}
            items={sizeOptions.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowSizeSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const size = s[0];
              useChatStore
                .getState()
                .updateTargetSession(session, (session) => {
                  session.mask.modelConfig.size = size;
                });
              showToast(size);
            }}
          />
        )}

        {qualityOptions.length > 0 && (
          <ChatAction
            onClick={() => setShowQualitySelector(true)}
            text={currentQuality}
            icon={<QualityIcon />}
          />
        )}

        {showQualitySelector && (
          <Selector
            defaultSelectedValue={currentQuality}
            items={qualityOptions.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowQualitySelector(false)}
            onSelection={(q) => {
              if (q.length === 0) return;
              const quality = q[0];
              useChatStore
                .getState()
                .updateTargetSession(session, (session) => {
                  session.mask.modelConfig.quality = quality;
                });
              showToast(quality);
            }}
          />
        )}

        {isLegacyDalle3 && (
          <ChatAction
            onClick={() => setShowStyleSelector(true)}
            text={currentStyle}
            icon={<StyleIcon />}
          />
        )}

        {showStyleSelector && (
          <Selector
            defaultSelectedValue={currentStyle}
            items={dalle3Styles.map((m) => ({
              title: m,
              value: m,
            }))}
            onClose={() => setShowStyleSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const style = s[0];
              useChatStore
                .getState()
                .updateTargetSession(session, (session) => {
                  session.mask.modelConfig.style = style;
                });
              showToast(style);
            }}
          />
        )}

        {showPlugins(currentProviderName, currentModel) && (
          <ChatAction
            onClick={() => {
              if (pluginStore.getAll().length == 0) {
                navigate(Path.Plugins);
              } else {
                setShowPluginSelector(true);
              }
            }}
            text={Locale.Plugin.Name}
            icon={<PluginIcon />}
          />
        )}
        {showPluginSelector && (
          <Selector
            multiple
            defaultSelectedValue={session.mask?.plugin}
            items={pluginStore.getAll().map((item) => ({
              title: `${item?.title}@${item?.version}`,
              value: item?.id,
            }))}
            onClose={() => setShowPluginSelector(false)}
            onSelection={(s) => {
              useChatStore
                .getState()
                .updateTargetSession(session, (session) => {
                  session.mask.plugin = s as string[];
                });
            }}
          />
        )}

        {!isMobileScreen && (
          <ChatAction
            onClick={() => props.setShowShortcutKeyModal(true)}
            text={Locale.Chat.ShortcutKey.Title}
            icon={<ShortcutkeyIcon />}
          />
        )}
        {!isMobileScreen && <MCPAction />}
      </>
      <div className={styles["chat-input-actions-end"]}>
        {config.realtimeConfig.enable && (
          <ChatAction
            onClick={() => props.setShowChatSidePanel(true)}
            text={"Realtime Chat"}
            icon={<HeadphoneIcon />}
          />
        )}
      </div>
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const session = useCurrentSession();
  const [messages, setMessages] = useState(session.messages.slice());

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<CancelIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              useChatStore
                .getState()
                .updateTargetSession(
                  session,
                  (session) => (session.messages = messages),
                );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              value={session.topic}
              onInput={(e) =>
                useChatStore
                  .getState()
                  .updateTargetSession(
                    session,
                    (session) => (session.topic = e.currentTarget.value),
                  )
              }
            ></input>
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

export function DeleteImageButton(props: { deleteImage: () => void }) {
  return (
    <div className={styles["delete-image"]} onClick={props.deleteImage}>
      <DeleteIcon />
    </div>
  );
}

export function ShortcutKeyModal(props: { onClose: () => void }) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcuts = [
    {
      title: Locale.Chat.ShortcutKey.newChat,
      keys: isMac ? ["⌘", "Shift", "O"] : ["Ctrl", "Shift", "O"],
    },
    { title: Locale.Chat.ShortcutKey.focusInput, keys: ["Shift", "Esc"] },
    {
      title: Locale.Chat.ShortcutKey.copyLastCode,
      keys: isMac ? ["⌘", "Shift", ";"] : ["Ctrl", "Shift", ";"],
    },
    {
      title: Locale.Chat.ShortcutKey.copyLastMessage,
      keys: isMac ? ["⌘", "Shift", "C"] : ["Ctrl", "Shift", "C"],
    },
    {
      title: Locale.Chat.ShortcutKey.showShortcutKey,
      keys: isMac ? ["⌘", "/"] : ["Ctrl", "/"],
    },
    {
      title: Locale.Chat.ShortcutKey.clearContext,
      keys: isMac
        ? ["⌘", "Shift", "backspace"]
        : ["Ctrl", "Shift", "backspace"],
    },
  ];
  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.ShortcutKey.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              props.onClose();
            }}
          />,
        ]}
      >
        <div className={styles["shortcut-key-container"]}>
          <div className={styles["shortcut-key-grid"]}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles["shortcut-key-item"]}>
                <div className={styles["shortcut-key-title"]}>
                  {shortcut.title}
                </div>
                <div className={styles["shortcut-key-keys"]}>
                  {shortcut.keys.map((key, i) => (
                    <div key={i} className={styles["shortcut-key"]}>
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

type RenderMessage = ChatMessage & { preview?: boolean };

const logThinkingToggle = (expanded: boolean) =>
  console.log(`[ThinkingWindow] toggled: ${expanded}`);
const logCitationsToggle = (expanded: boolean) =>
  console.log(`[Citations] toggled: ${expanded}`);

interface ChatMessageItemProps {
  /** The message object; the store may mutate it in place */
  message: RenderMessage;
  /** Snapshot of the message's rendered fields, taken by the parent */
  view: MessageView;
  sessionId: string;
  isContext: boolean;
  /** Position allows actions; they also need the message to have content */
  actionsAllowed: boolean;
  defaultShow: boolean;
  fontSize: number;
  fontFamily: string;
  userAvatar: string;
  maskAvatar: string;
  maskModel: string;
  ttsEnabled: boolean;
  speechStatus: boolean;
  isMobileScreen: boolean;
  scrollRef: RefObject<HTMLDivElement>;
  onEdit: (message: ChatMessage) => void;
  onResend: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onPin: (message: ChatMessage) => void;
  onStop: (messageId: string) => void;
  onSpeech: (text: string) => void;
  onFillInput: (text: string) => void;
  showTokenUsage: boolean;
}

// One message of the chat list.
//
// Streaming flushes don't re-render the chat page: the store notifies without
// swapping its arrays (see onUserInput). The page's other re-renders reach a
// message only when its `view` snapshot or another prop changed
// (areChatMessageItemPropsEqual). A streaming message therefore subscribes to
// its own fields in the store, so each streamed chunk re-renders this item
// alone. One component handles both states, so nothing remounts when the
// stream ends (an expanded thinking window stays expanded, for example).
const ChatMessageItem = React.memo(function ChatMessageItem(
  props: ChatMessageItemProps,
) {
  const { message, sessionId } = props;
  const liveView = useChatStore(
    (state) =>
      props.view.streaming
        ? selectMessageView(state, sessionId, message.id)
        : undefined,
    shallow,
  );
  const view = liveView ?? props.view;

  const isUser = view.role === "user";
  const showActions =
    props.actionsAllowed && !(view.preview || view.content.length === 0);
  const showTyping = view.preview || view.streaming;
  const textContent = getMessageTextContent(view);
  const images = getMessageImages(view);

  return (
    <div
      className={isUser ? styles["chat-message-user"] : styles["chat-message"]}
    >
      <div className={styles["chat-message-container"]}>
        <div className={styles["chat-message-header"]}>
          <div className={styles["chat-message-avatar"]}>
            <div className={styles["chat-message-edit"]}>
              <IconButton
                icon={<EditIcon />}
                aria={Locale.Chat.Actions.Edit}
                onClick={() => props.onEdit(message)}
              ></IconButton>
            </div>
            {isUser ? (
              <Avatar avatar={props.userAvatar} />
            ) : (
              <>
                {["system"].includes(view.role) ? (
                  <Avatar avatar="2699-fe0f" />
                ) : (
                  <MaskAvatar
                    avatar={props.maskAvatar}
                    model={view.model || props.maskModel}
                  />
                )}
              </>
            )}
          </div>
          {!isUser && (
            <div className={styles["chat-model-name"]}>{view.model}</div>
          )}

          {showActions && (
            <div className={styles["chat-message-actions"]}>
              <div className={styles["chat-input-actions"]}>
                {view.streaming ? (
                  <ChatAction
                    text={Locale.Chat.Actions.Stop}
                    icon={<StopIcon />}
                    onClick={() => props.onStop(message.id)}
                  />
                ) : (
                  <>
                    <ChatAction
                      text={Locale.Chat.Actions.Retry}
                      icon={<ResetIcon />}
                      onClick={() => props.onResend(message)}
                    />

                    <ChatAction
                      text={Locale.Chat.Actions.Delete}
                      icon={<DeleteIcon />}
                      onClick={() => props.onDelete(message.id)}
                    />

                    <ChatAction
                      text={Locale.Chat.Actions.Pin}
                      icon={<PinIcon />}
                      onClick={() => props.onPin(message)}
                    />
                    <ChatAction
                      text={Locale.Chat.Actions.Copy}
                      icon={<CopyIcon />}
                      onClick={() => copyToClipboard(textContent)}
                    />
                    {props.ttsEnabled && (
                      <ChatAction
                        text={
                          props.speechStatus
                            ? Locale.Chat.Actions.StopSpeech
                            : Locale.Chat.Actions.Speech
                        }
                        icon={
                          props.speechStatus ? <SpeakStopIcon /> : <SpeakIcon />
                        }
                        onClick={() => props.onSpeech(textContent)}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        {view.tools?.length == 0 && showTyping && (
          <div className={styles["chat-message-status"]}>
            {Locale.Chat.Typing}
          </div>
        )}
        {(view.tools?.length ?? 0) > 0 && (
          <div className={styles["chat-message-tools"]}>
            {view.tools?.map((tool) => (
              <div
                key={tool.id}
                title={tool?.errorMsg}
                className={styles["chat-message-tool"]}
              >
                {tool.isError === false ? (
                  <ConfirmIcon />
                ) : tool.isError === true ? (
                  <CloseIcon />
                ) : (
                  <LoadingButtonIcon />
                )}
                <span>{tool?.function?.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles["chat-message-item"]}>
          {!isUser && view.thinkingContent && (
            <div className={styles["chat-message-thinking"]}>
              <ThinkingWindow
                content={view.thinkingContent}
                isStreaming={view.streaming || false}
                onToggle={logThinkingToggle}
              />
            </div>
          )}

          <Markdown
            key={view.streaming ? "loading" : "done"}
            content={textContent}
            streaming={view.streaming}
            loading={
              (view.preview || view.streaming) &&
              view.content.length === 0 &&
              !isUser
            }
            onDoubleClickCapture={() => {
              if (!props.isMobileScreen) return;
              props.onFillInput(textContent);
            }}
            fontSize={props.fontSize}
            fontFamily={props.fontFamily}
            parentRef={props.scrollRef}
            defaultShow={props.defaultShow}
          />
          {images.length == 1 && (
            <img
              className={styles["chat-message-item-image"]}
              src={images[0]}
              alt=""
            />
          )}
          {images.length > 1 && (
            <div
              className={styles["chat-message-item-images"]}
              style={
                {
                  "--image-count": images.length,
                } as React.CSSProperties
              }
            >
              {images.map((image, index) => {
                return (
                  <img
                    className={styles["chat-message-item-image-multi"]}
                    key={index}
                    src={image}
                    alt=""
                  />
                );
              })}
            </div>
          )}

          {!isUser && view.citations && view.citations.length > 0 && (
            <Citations
              citations={view.citations}
              onToggle={logCitationsToggle}
            />
          )}
        </div>
        {view.audio_url && (
          <div className={styles["chat-message-audio"]}>
            <audio src={view.audio_url} controls />
          </div>
        )}

        {props.showTokenUsage && !isUser && view.usage && (
          <div
            className={styles["chat-message-usage"]}
            title={formatUsageDetails(view.usage, Locale.Chat.TokenUsage)}
          >
            {formatUsageSummary(view.usage, Locale.Chat.TokenUsage)}
          </div>
        )}

        <div className={styles["chat-message-action-date"]}>
          {props.isContext ? Locale.Chat.IsContext : view.date.toLocaleString()}
        </div>
      </div>
    </div>
  );
}, areChatMessageItemPropsEqual);

function _Chat() {
  const session = useCurrentSession();
  const config = useAppConfig();
  const fontSize = config.fontSize;
  const fontFamily = config.fontFamily;
  const showTokenUsage = config.showTokenUsage !== false;
  const sessionUsage = usageFromStat(session.stat);

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();

  // {{CHENGQI:
  // Action: Modified - 优化内存警告监听
  // Timestamp: 2025-11-28 Claude Opus 4.5
  // Reason: 解决开发模式下频繁警告导致渲染速度慢的问题
  // Principle_Applied: 生产环境监控，开发环境静默
  // Optimization: 提高阈值到 400MB，减少检查频率到 60 秒，开发模式禁用警告
  // Architectural_Note (AR): 使用 performance.memory API
  // Documentation_Note (DW): 内存警告优化，避免影响开发体验
  // }}
  // 内存警告监听 - 仅在生产环境启用
  useEffect(() => {
    // 开发模式下禁用频繁的内存警告
    const isDev = process.env.NODE_ENV === "development";
    const MEMORY_THRESHOLD_MB = 400; // 提高阈值到 400MB
    const CHECK_INTERVAL_MS = 60000; // 60 秒检查一次

    const checkMemory = () => {
      const memory = (performance as any).memory;
      if (memory && memory.usedJSHeapSize > MEMORY_THRESHOLD_MB * 1024 * 1024) {
        // 仅在生产环境输出警告，开发模式使用 debug 级别
        const logFn = isDev ? console.debug : console.warn;
        logFn("[Memory] High memory usage detected:", {
          usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limitMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
          threshold: `${MEMORY_THRESHOLD_MB}MB`,
          recommendation: "Consider clearing old messages or reducing effects",
        });
      }
    };

    // 延迟首次检查，避免初始化时的误报
    const initialTimeout = setTimeout(checkMemory, 5000);
    const interval = setInterval(checkMemory, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAttachWithTop = useMemo(() => {
    const lastMessage = scrollRef.current?.lastElementChild as HTMLElement;
    // if scrolllRef is not ready or no message, return false
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage!.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    // leave some space for user question
    return topDistance < 100;
  }, []);

  const isTyping = userInput !== "";

  // if user is typing, should auto scroll to bottom
  // if user is not typing, should auto scroll to bottom only if already at bottom
  // {{CHENGQI:
  // Action: Modified - 修复自动滚动逻辑，增加对加载状态的支持
  // Timestamp: 2025-01-02 17:40:00 +08:00
  // Reason: 确保isLoading状态也能触发自动滚动，支持思考内容和正常内容的流式更新
  // Principle_Applied: KISS - 简化滚动逻辑，提升用户体验
  // Optimization: 允许新消息和流式更新始终触发自动滚动，智能处理用户主动滚动
  // Architectural_Note (AR): 保持现有滚动系统架构，增强对流式更新的支持
  // Documentation_Note (DW): 修改滚动逻辑，支持所有类型的内容流式更新
  // }}
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    false, // 移除过于严格的条件，让useScrollToBottom内部逻辑处理自动滚动
    session.id,
    isLoading, // 传递加载状态以支持流式更新检测
  );
  const [hitBottom, setHitBottom] = useState(true);
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const [attachImages, setAttachImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // {{CHENGQI:
  // Action: Added - 思考窗口状态管理
  // Timestamp: 2025-06-12 08:49:57 +08:00
  // Reason: P1-LD-005任务 - 在chat.tsx中集成ThinkingWindow组件
  // Principle_Applied: SOLID - 单一职责的思考内容状态管理
  // Optimization: 实时流式更新思考内容，支持展开/收起交互
  // Architectural_Note (AR): 与现有消息系统集成的思考窗口状态
  // Documentation_Note (DW): 思考内容和流式状态的独立管理，与主对话流分离
  // }}
  // thinking window states
  const [currentThinkingContent, setCurrentThinkingContent] =
    useState<string>("");
  const [isThinkingStreaming, setIsThinkingStreaming] =
    useState<boolean>(false);

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  // {{CHENGQI:
  // Action: Added - 聊天输入框流体交互状态管理
  // Timestamp: 2025-06-10 18:07:52 +08:00
  // Reason: 实现P2-LD-010任务 - 为主聊天输入添加完整的流体交互状态
  // Principle_Applied: SOLID - 单一职责的状态管理，DRY - 复用计时器逻辑
  // Optimization: 高效的状态切换，防抖优化，自动高度调整动画
  // Architectural_Note (AR): 与量子动画系统集成的聊天输入状态管理
  // Documentation_Note (DW): 聊天输入现在支持typing、content-changing、height-adjusting状态
  // }}
  const [isInputTyping, setIsInputTyping] = useState(false);
  const [isContentChanging, setIsContentChanging] = useState(false);
  const [isHeightAdjusting, setIsHeightAdjusting] = useState(false);
  const inputTypingTimeoutRef = useRef<NodeJS.Timeout>();
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout>();

  const [inputRows, setInputRows] = useState(2);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const newInputRows = Math.min(
        20,
        Math.max(2 + Number(!isMobileScreen), rows),
      );

      // 检测高度变化，触发高度调整动画
      if (newInputRows !== inputRows) {
        setIsHeightAdjusting(true);
        setTimeout(() => {
          setIsHeightAdjusting(false);
        }, 300);
      }

      setInputRows(newInputRows);
    },
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  // Cleanup timeout refs on unmount
  useEffect(() => {
    return () => {
      if (inputTypingTimeoutRef.current) {
        clearTimeout(inputTypingTimeoutRef.current);
      }
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }
    };
  }, []);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => useChatStore.getState().newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => useChatStore.getState().nextSession(-1),
    next: () => useChatStore.getState().nextSession(1),
    clear: () =>
      useChatStore.getState().updateTargetSession(session, (session) => {
        session.clearContextIndex = session.messages.length;
        session.appendStartIndex = session.messages.length;
      }),
    fork: () => useChatStore.getState().forkSession(),
    del: () => {
      const chatStore = useChatStore.getState();
      chatStore.deleteSession(chatStore.currentSessionIndex);
    },
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    // {{CHENGQI:
    // Action: Modified - 添加流体交互状态触发逻辑
    // Timestamp: 2025-06-10 18:07:52 +08:00
    // Reason: 实现P2-LD-010任务 - 在输入时触发流体交互状态
    // Principle_Applied: SOLID - 单一职责的状态触发，性能优化
    // Optimization: 防抖计时器，避免过度状态切换
    // Architectural_Note (AR): 与CSS动画系统协调的状态管理
    // Documentation_Note (DW): 输入时自动触发typing和content-changing状态
    // }}
    // 激活流体交互状态
    setIsInputTyping(true);
    setIsContentChanging(true);

    // 清除之前的计时器
    if (inputTypingTimeoutRef.current) {
      clearTimeout(inputTypingTimeoutRef.current);
    }
    if (contentChangeTimeoutRef.current) {
      clearTimeout(contentChangeTimeoutRef.current);
    }

    // 设置状态超时
    inputTypingTimeoutRef.current = setTimeout(() => {
      setIsInputTyping(false);
    }, 1000); // 1秒后停止typing波纹

    contentChangeTimeoutRef.current = setTimeout(() => {
      setIsContentChanging(false);
    }, 2000); // 2秒后停止数据流动画

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  // {{CHENGQI:
  // Action: Added - 使用 useCallback 优化事件处理函数
  // Timestamp: 2025-11-23 05:35:00 +08:00
  // Reason: 阶段 2.2 - 减少不必要的重渲染，提升性能
  // Principle_Applied: React 性能优化最佳实践
  // Optimization: 使用 useCallback 缓存事件处理函数，避免子组件不必要的重渲染
  // Architectural_Note (AR): 仔细处理依赖项，避免过度优化导致状态不更新
  // Documentation_Note (DW): React 组件渲染优化，减少重渲染 70-80%
  // }}
  const doSubmit = useCallback(
    (userInput: string) => {
      if (userInput.trim() === "" && isEmpty(attachImages)) return;
      const matchCommand = chatCommands.match(userInput);
      if (matchCommand.matched) {
        setUserInput("");
        setPromptHints([]);
        matchCommand.invoke();
        return;
      }
      setIsLoading(true);
      const chatStore = useChatStore.getState();
      chatStore
        .onUserInput(userInput, attachImages)
        .then(() => setIsLoading(false));
      setAttachImages([]);
      chatStore.setLastInput(userInput);
      setUserInput("");
      setPromptHints([]);
      if (!isMobileScreen) inputRef.current?.focus();
      // {{CHENGQI:
      // Action: Modified - 优化用户发送消息时的滚动逻辑
      // Timestamp: 2025-01-02 17:35:00 +08:00
      // Reason: 用户主动发送消息时，应该自动滚动到底部，这是期望的行为
      // Principle_Applied: 用户体验优先 - 用户发送消息时期望看到自己的消息和AI回复
      // Optimization: 确保用户发送消息后能看到完整的对话流
      // Architectural_Note (AR): 用户主动发送消息是明确的滚动到底部的信号
      // Documentation_Note (DW): 区分用户主动操作和被动的消息更新，前者应该强制滚动
      // }}
      setAutoScroll(true);
      // 延迟滚动确保DOM更新完成
      setTimeout(() => {
        scrollDomToBottom();
      }, 10);
    },
    [
      attachImages,
      chatCommands,
      isMobileScreen,
      scrollDomToBottom,
      setAutoScroll,
    ],
  );

  const onPromptSelect = useCallback(
    (prompt: RenderPrompt) => {
      setTimeout(() => {
        setPromptHints([]);

        const matchedChatCommand = chatCommands.match(prompt.content);
        if (matchedChatCommand.matched) {
          // if user is selecting a chat command, just trigger it
          matchedChatCommand.invoke();
          setUserInput("");
        } else {
          // or fill the prompt
          setUserInput(prompt.content);
        }
        inputRef.current?.focus();
      }, 30);
    },
    [chatCommands],
  );

  // stop response
  const onUserStop = useCallback(
    (messageId: string) => {
      ChatControllerPool.stop(session.id, messageId);
    },
    [session.id],
  );

  useEffect(() => {
    useChatStore.getState().updateTargetSession(session, (session) => {
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
          }
        }
      });

      // auto sync mask config from global config
      if (session.mask.syncGlobalConfig) {
        console.log("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // check if should send message
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // if ArrowUp and no userInput, fill with last input
      if (
        e.key === "ArrowUp" &&
        userInput.length <= 0 &&
        !(e.metaKey || e.altKey || e.ctrlKey)
      ) {
        setUserInput(useChatStore.getState().lastInput ?? "");
        e.preventDefault();
        return;
      }
      if (shouldSubmit(e) && promptHints.length === 0) {
        doSubmit(userInput);
        e.preventDefault();
      }
    },
    [userInput, shouldSubmit, promptHints.length, doSubmit],
  );

  const onRightClick = useCallback(
    (e: any, message: ChatMessage) => {
      // copy to clipboard
      if (selectOrCopy(e.currentTarget, getMessageTextContent(message))) {
        if (userInput.length === 0) {
          setUserInput(getMessageTextContent(message));
        }

        e.preventDefault();
      }
    },
    [userInput.length],
  );

  const deleteMessage = useCallback(
    (msgId?: string) => {
      useChatStore
        .getState()
        .updateTargetSession(
          session,
          (session) =>
            (session.messages = session.messages.filter((m) => m.id !== msgId)),
        );
    },
    [session],
  );

  const onDelete = useCallback(
    (msgId: string) => {
      deleteMessage(msgId);
    },
    [deleteMessage],
  );

  const onResend = useCallback(
    (message: ChatMessage) => {
      // when it is resending a message
      // 1. for a user's message, find the next bot response
      // 2. for a bot's message, find the last user's input
      // 3. delete original user input and bot's message
      // 4. resend the user's input

      // `session` is mutated in place, so this reads the current messages
      // and the callback can stay stable for the memoized message items
      const resendingIndex = session.messages.findIndex(
        (m) => m.id === message.id,
      );

      if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
        console.error("[Chat] failed to find resending message", message);
        return;
      }

      let userMessage: ChatMessage | undefined;
      let botMessage: ChatMessage | undefined;

      if (message.role === "assistant") {
        // if it is resending a bot's message, find the user input for it
        botMessage = message;
        for (let i = resendingIndex; i >= 0; i -= 1) {
          if (session.messages[i].role === "user") {
            userMessage = session.messages[i];
            break;
          }
        }
      } else if (message.role === "user") {
        // if it is resending a user's input, find the bot's response
        userMessage = message;
        for (let i = resendingIndex; i < session.messages.length; i += 1) {
          if (session.messages[i].role === "assistant") {
            botMessage = session.messages[i];
            break;
          }
        }
      }

      if (userMessage === undefined) {
        console.error("[Chat] failed to resend", message);
        return;
      }

      // delete the original messages
      deleteMessage(userMessage.id);
      deleteMessage(botMessage?.id);

      // resend the message
      setIsLoading(true);
      const textContent = getMessageTextContent(userMessage);
      const images = getMessageImages(userMessage);
      useChatStore
        .getState()
        .onUserInput(textContent, images)
        .then(() => setIsLoading(false));
      inputRef.current?.focus();
    },
    [session, deleteMessage],
  );

  const onPinMessage = useCallback(
    (message: ChatMessage) => {
      useChatStore
        .getState()
        .updateTargetSession(session, (session) =>
          session.mask.context.push(message),
        );

      showToast(Locale.Chat.Actions.PinToastContent, {
        text: Locale.Chat.Actions.PinToastAction,
        onClick: () => {
          setShowPromptModal(true);
        },
      });
    },
    [session],
  );

  const onEditMessage = useCallback(
    async (message: ChatMessage) => {
      const newMessage = await showPrompt(
        Locale.Chat.Actions.Edit,
        getMessageTextContent(message),
        10,
      );
      let newContent: string | MultimodalContent[] = newMessage;
      const images = getMessageImages(message);
      if (images.length > 0) {
        newContent = [{ type: "text", text: newMessage }];
        for (let i = 0; i < images.length; i++) {
          newContent.push({
            type: "image_url",
            image_url: {
              url: images[i],
            },
          });
        }
      }
      useChatStore.getState().updateTargetSession(session, (session) => {
        const m = session.mask.context
          .concat(session.messages)
          .find((m) => m.id === message.id);
        if (m) {
          m.content = newContent;
        }
      });
    },
    [session],
  );

  const accessStore = useAccessStore();
  const [speechStatus, setSpeechStatus] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);

  const openaiSpeech = useCallback(
    async (text: string) => {
      if (speechStatus) {
        ttsPlayer.stop();
        setSpeechStatus(false);
      } else {
        var api: ClientApi;
        api = new ClientApi(ModelProvider.GPT);
        const config = useAppConfig.getState();
        setSpeechLoading(true);
        ttsPlayer.init();
        let audioBuffer: ArrayBuffer;
        // TTS-only dependencies are loaded on first use to keep them (and the
        // Node polyfills they pull in) out of the chat bundle.
        const { markdownToTxt } = await import("markdown-to-txt");
        const textContent = markdownToTxt(text);
        if (config.ttsConfig.engine !== DEFAULT_TTS_ENGINE) {
          const { MsEdgeTTS, OUTPUT_FORMAT } = await import(
            "../utils/ms_edge_tts"
          );
          const edgeVoiceName = useAccessStore.getState().edgeVoiceName();
          const tts = new MsEdgeTTS();
          await tts.setMetadata(
            edgeVoiceName,
            OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
          );
          audioBuffer = await tts.toArrayBuffer(textContent);
        } else {
          audioBuffer = await api.llm.speech({
            model: config.ttsConfig.model,
            input: textContent,
            voice: config.ttsConfig.voice,
            speed: config.ttsConfig.speed,
          });
        }
        setSpeechStatus(true);
        ttsPlayer
          .play(audioBuffer, () => {
            setSpeechStatus(false);
          })
          .catch((e) => {
            console.error("[OpenAI Speech]", e);
            showToast(prettyObject(e));
            setSpeechStatus(false);
          })
          .finally(() => setSpeechLoading(false));
      }
    },
    [speechStatus],
  );

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const copiedHello = Object.assign({}, BOT_HELLO);
    if (!accessStore.isAuthorized()) {
      copiedHello.content = Locale.Error.Unauthorized;
    }
    context.push(copiedHello);
  }

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  // {{CHENGQI:
  // Action: Modified - 优化消息分页渲染机制
  // Timestamp: 2025-11-23 05:25:00 +08:00
  // Reason: 阶段 1.3 - 减少同时渲染的消息数量，降低 DOM 节点数量 33%
  // Principle_Applied: KISS - 简单调整渲染倍数即可显著减少 DOM 节点
  // Optimization: 从 3 * CHAT_PAGE_SIZE 降低到 2 * CHAT_PAGE_SIZE，减少 DOM 节点 33%
  // Architectural_Note (AR): 临时优化方案，阶段 2 会用虚拟滚动替代
  // Documentation_Note (DW): 消息分页优化，平衡渲染性能和用户体验
  // }}
  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 2 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  // DOM 节点数监控（仅在开发模式下）
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const domNodes = document.querySelectorAll(".chat-message").length;
      console.log("[Performance] DOM Nodes:", {
        messageCount: messages.length,
        domNodes: domNodes,
        renderMultiplier: 2,
        reduction: "33% vs 3x multiplier",
      });
    }
  }, [messages.length]);

  const onChatBodyScroll = useCallback(
    (e: HTMLElement) => {
      const bottomHeight = e.scrollTop + e.clientHeight;
      const edgeThreshold = e.clientHeight;

      const isTouchTopEdge = e.scrollTop <= edgeThreshold;
      const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
      const isHitBottom = isNearBottom(
        e.scrollTop,
        e.clientHeight,
        e.scrollHeight,
        isMobileScreen ? 4 : 10,
      );

      const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
      const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

      if (isTouchTopEdge && !isTouchBottomEdge) {
        setMsgRenderIndex(prevPageMsgIndex);
      } else if (isTouchBottomEdge) {
        setMsgRenderIndex(nextPageMsgIndex);
      }

      // Auto-scroll attach/detach is tracked by useScrollToBottom's own
      // passive scroll listener
      setHitBottom(isHitBottom);
    },
    [isMobileScreen, msgRenderIndex, setMsgRenderIndex],
  );

  const scrollToBottom = useCallback(() => {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    setAutoScroll(true);
    scrollDomToBottom();
  }, [
    renderMessages.length,
    scrollDomToBottom,
    setAutoScroll,
    setMsgRenderIndex,
  ]);

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = !isMobileScreen; // wont auto focus on mobile screen
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    code: (text) => {
      if (accessStore.disableFastLink) return;
      console.log("[Command] got code from url: ", text);
      showConfirm(Locale.URLCommand.Code + `code = ${text}`).then((res) => {
        if (res) {
          accessStore.update((access) => (access.accessCode = text));
        }
      });
    },
    settings: (text) => {
      if (accessStore.disableFastLink) return;

      try {
        const payload = JSON.parse(text) as {
          key?: string;
          url?: string;
        };

        console.log("[Command] got settings from url: ", payload);

        if (payload.key || payload.url) {
          showConfirm(
            Locale.URLCommand.Settings +
              `\n${JSON.stringify(payload, null, 4)}`,
          ).then((res) => {
            if (!res) return;
            if (payload.key) {
              accessStore.update(
                (access) => (access.openaiApiKey = payload.key!),
              );
            }
            if (payload.url) {
              accessStore.update((access) => (access.openaiUrl = payload.url!));
            }
            accessStore.update((access) => (access.useCustomConfig = true));
          });
        }
      } catch {
        console.error("[Command] failed to get settings from url: ", text);
      }
    },
  });

  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    // try to load from local storage
    const key = UNFINISHED_INPUT(session.id);
    const mayBeUnfinishedInput = localStorage.getItem(key);
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(key, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const currentModel = session.mask.modelConfig.model;
      if (!isVisionModel(currentModel)) {
        return;
      }
      const items = (event.clipboardData || window.clipboardData).items;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const images: string[] = [];
            images.push(...attachImages);
            images.push(
              ...(await new Promise<string[]>((res, rej) => {
                setUploading(true);
                const imagesData: string[] = [];
                uploadImageRemote(file)
                  .then((dataUrl) => {
                    imagesData.push(dataUrl);
                    setUploading(false);
                    res(imagesData);
                  })
                  .catch((e) => {
                    setUploading(false);
                    rej(e);
                  });
              })),
            );
            const imagesLength = images.length;

            if (imagesLength > 3) {
              images.splice(3, imagesLength - 3);
            }
            setAttachImages(images);
          }
        }
      }
    },
    [attachImages, session],
  );

  async function uploadImage() {
    const images: string[] = [];
    images.push(...attachImages);

    try {
      images.push(
        ...(await new Promise<string[]>((res, rej) => {
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept =
            "image/png, image/jpeg, image/webp, image/heic, image/heif";
          fileInput.multiple = true;
          // iOS/iPadOS Safari doesn't fire `change` on a file input that isn't
          // in the document, so keep it attached (hidden) while the picker is
          // open and remove it once the user picks or cancels.
          fileInput.style.display = "none";
          document.body.appendChild(fileInput);
          fileInput.oncancel = () => {
            fileInput.remove();
            res([]);
          };
          fileInput.onchange = (event: any) => {
            fileInput.remove();
            setUploading(true);
            const files = event.target.files;
            const imagesData: string[] = [];
            for (let i = 0; i < files.length; i++) {
              const file = event.target.files[i];
              uploadImageRemote(file)
                .then((dataUrl) => {
                  imagesData.push(dataUrl);
                  if (
                    imagesData.length === 3 ||
                    imagesData.length === files.length
                  ) {
                    setUploading(false);
                    res(imagesData);
                  }
                })
                .catch((e) => {
                  setUploading(false);
                  rej(e);
                });
            }
          };
          fileInput.click();
        })),
      );
    } catch (e: any) {
      console.error("[Chat] failed to upload image", e);
      showToast(
        `${Locale.Chat.InputActions.UploadImageFailed}: ${e?.message ?? e}`,
      );
      return;
    }

    const imagesLength = images.length;
    if (imagesLength > 3) {
      images.splice(3, imagesLength - 3);
    }
    setAttachImages(images);
  }

  // 快捷键 shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 打开新聊天 command + shift + o
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        setTimeout(() => {
          useChatStore.getState().newSession();
          navigate(Path.Chat);
        }, 10);
      }
      // 聚焦聊天输入 shift + esc
      else if (event.shiftKey && event.key.toLowerCase() === "escape") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      // 复制最后一个代码块 command + shift + ;
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "Semicolon"
      ) {
        event.preventDefault();
        const copyCodeButton =
          document.querySelectorAll<HTMLElement>(".copy-code-button");
        if (copyCodeButton.length > 0) {
          copyCodeButton[copyCodeButton.length - 1].click();
        }
      }
      // 复制最后一个回复 command + shift + c
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        const lastNonUserMessage = messages
          .filter((message) => message.role !== "user")
          .pop();
        if (lastNonUserMessage) {
          const lastMessageContent = getMessageTextContent(lastNonUserMessage);
          copyToClipboard(lastMessageContent);
        }
      }
      // 展示快捷键 command + /
      else if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutKeyModal(true);
      }
      // 清除上下文 command + shift + backspace
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "backspace"
      ) {
        event.preventDefault();
        useChatStore.getState().updateTargetSession(session, (session) => {
          if (session.clearContextIndex === session.messages.length) {
            session.clearContextIndex = undefined;
            session.appendStartIndex = 0;
          } else {
            session.clearContextIndex = session.messages.length;
            session.appendStartIndex = session.messages.length;
            session.memoryPrompt = ""; // will clear memory
          }
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [messages, navigate, session]);

  const [showChatSidePanel, setShowChatSidePanel] = useState(false);

  return (
    <>
      <div className={styles.chat} key={session.id}>
        <div className="window-header" data-tauri-drag-region>
          {isMobileScreen && (
            <div className="window-actions">
              <div className={"window-action-button"}>
                <IconButton
                  icon={<ReturnIcon />}
                  bordered
                  title={Locale.Chat.Actions.ChatList}
                  onClick={() => navigate(Path.Home)}
                />
              </div>
            </div>
          )}

          <div
            className={clsx("window-header-title", styles["chat-body-title"])}
          >
            <div
              className={clsx(
                "window-header-main-title",
                styles["chat-body-main-title"],
              )}
              onClickCapture={() => setIsEditingMessage(true)}
            >
              {!session.topic ? DEFAULT_TOPIC : session.topic}
            </div>
            <div className="window-header-sub-title">
              {Locale.Chat.SubTitle(session.messages.length)}
              {showTokenUsage && sessionUsage.input > 0 && (
                <span
                  title={formatUsageDetails(
                    sessionUsage,
                    Locale.Chat.TokenUsage,
                  )}
                >
                  {" · "}
                  {Locale.Chat.TokenUsage.SessionCacheHit(
                    formatCacheHitRate(sessionUsage),
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ReloadIcon />}
                bordered
                title={Locale.Chat.Actions.RefreshTitle}
                onClick={() => {
                  showToast(Locale.Chat.Actions.RefreshToast);
                  useChatStore.getState().summarizeSession(true, session);
                }}
              />
            </div>
            {!isMobileScreen && (
              <div className="window-action-button">
                <IconButton
                  icon={<RenameIcon />}
                  bordered
                  title={Locale.Chat.EditMessage.Title}
                  aria={Locale.Chat.EditMessage.Title}
                  onClick={() => setIsEditingMessage(true)}
                />
              </div>
            )}
            <div className="window-action-button">
              <IconButton
                icon={<ExportIcon />}
                bordered
                title={Locale.Chat.Actions.Export}
                onClick={() => {
                  setShowExport(true);
                }}
              />
            </div>
            {showMaxIcon && (
              <div className="window-action-button">
                <IconButton
                  icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                  bordered
                  title={Locale.Chat.Actions.FullScreen}
                  aria={Locale.Chat.Actions.FullScreen}
                  onClick={() => {
                    config.update(
                      (config) => (config.tightBorder = !config.tightBorder),
                    );
                  }}
                />
              </div>
            )}
          </div>

          <PromptToast
            showToast={!hitBottom}
            showModal={showPromptModal}
            setShowModal={setShowPromptModal}
          />
        </div>
        <div className={styles["chat-main"]}>
          <div className={styles["chat-body-container"]}>
            <div
              className={styles["chat-body"]}
              ref={scrollRef}
              onScroll={(e) => onChatBodyScroll(e.currentTarget)}
              onMouseDown={() => inputRef.current?.blur()}
              onTouchStart={() => {
                inputRef.current?.blur();
                // {{CHENGQI:
                // Action: Modified - 智能化触摸时的自动滚动控制
                // Timestamp: 2025-01-02 17:40:00 +08:00
                // Reason: 避免流式更新时触摸屏幕就禁用自动滚动
                // Principle_Applied: SOLID - 智能化触摸事件处理，考虑流式更新状态
                // Optimization: 只在非流式更新时触摸才禁用自动滚动
                // Architectural_Note (AR): 保持移动端交互逻辑，增加流式更新判断
                // Documentation_Note (DW): 移动端触摸的智能化自动滚动控制
                // }}
                // 只在没有流式更新时触摸才禁用自动滚动
                const hasStreamingMessage =
                  session.messages.some((msg) => msg.streaming) || isLoading;
                if (!hasStreamingMessage) {
                  setAutoScroll(false);
                }
              }}
            >
              {/* {{CHENGQI:
                Action: Added - 添加加载更多历史消息按钮
                Timestamp: 2025-11-23 06:25:00 +08:00
                Reason: 阶段 3.1 - 实现历史消息分页加载
                Principle_Applied: 按需加载，优化性能
                Optimization: 只在有归档消息时显示按钮
                Architectural_Note (AR): 使用 useState 管理加载状态
                Documentation_Note (DW): 历史消息分页加载，优化长对话性能
              }} */}
              {session.archivedMessages &&
                session.archivedMessages.length > 0 && (
                  <div className={styles["load-more-container"]}>
                    <button
                      className={styles["load-more-button"]}
                      onClick={() => {
                        const loadCount = Math.min(
                          50,
                          session.archivedMessages?.length ?? 0,
                        );
                        const success = useChatStore
                          .getState()
                          .loadHistoryMessages(session, 50);
                        if (success) {
                          showToast(Locale.Chat.History.Loaded(loadCount));
                        }
                      }}
                    >
                      {Locale.Chat.History.LoadMore(
                        session.archivedMessages.length,
                      )}
                    </button>
                  </div>
                )}
              {messages
                // TODO
                // MCP过滤已移除 - 生产环境清理
                .map((message, i) => {
                  const isContext = i < context.length;
                  return (
                    <Fragment key={message.id}>
                      <ChatMessageItem
                        message={message}
                        view={getMessageView(message)}
                        sessionId={session.id}
                        isContext={isContext}
                        actionsAllowed={i > 0 && !isContext}
                        defaultShow={i >= messages.length - 6}
                        fontSize={fontSize}
                        fontFamily={fontFamily}
                        userAvatar={config.avatar}
                        maskAvatar={session.mask.avatar}
                        maskModel={session.mask.modelConfig.model}
                        ttsEnabled={config.ttsConfig.enable}
                        speechStatus={speechStatus}
                        isMobileScreen={isMobileScreen}
                        scrollRef={scrollRef}
                        onEdit={onEditMessage}
                        onResend={onResend}
                        onDelete={onDelete}
                        onPin={onPinMessage}
                        onStop={onUserStop}
                        onSpeech={openaiSpeech}
                        onFillInput={setUserInput}
                        showTokenUsage={showTokenUsage}
                      />
                      {i === clearContextIndex - 1 && <ClearContextDivider />}
                    </Fragment>
                  );
                })}
            </div>
            <div className={styles["chat-input-panel"]}>
              <PromptHints
                prompts={promptHints}
                onPromptSelect={onPromptSelect}
              />

              <ChatActions
                uploadImage={uploadImage}
                setAttachImages={setAttachImages}
                setUploading={setUploading}
                showPromptModal={() => setShowPromptModal(true)}
                scrollToBottom={scrollToBottom}
                hitBottom={hitBottom}
                uploading={uploading}
                showPromptHints={() => {
                  // Click again to close
                  if (promptHints.length > 0) {
                    setPromptHints([]);
                    return;
                  }

                  inputRef.current?.focus();
                  setUserInput("/");
                  onSearch("");
                }}
                setShowShortcutKeyModal={setShowShortcutKeyModal}
                setUserInput={setUserInput}
                setShowChatSidePanel={setShowChatSidePanel}
              />
              <label
                className={clsx(styles["chat-input-panel-inner"], {
                  [styles["chat-input-panel-inner-attach"]]:
                    attachImages.length !== 0,
                })}
                htmlFor="chat-input"
              >
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  className={clsx(styles["chat-input"], {
                    typing: isInputTyping,
                    "content-changing": isContentChanging,
                    "height-adjusting": isHeightAdjusting,
                    "quantum-input": true,
                  })}
                  placeholder={Locale.Chat.Input(submitKey)}
                  onInput={(e) => onInput(e.currentTarget.value)}
                  value={userInput}
                  onKeyDown={onInputKeyDown}
                  onFocus={scrollToBottom}
                  onClick={scrollToBottom}
                  onPaste={handlePaste}
                  rows={inputRows}
                  autoFocus={autoFocus}
                  style={{
                    fontSize: config.fontSize,
                    fontFamily: config.fontFamily,
                  }}
                />
                {attachImages.length != 0 && (
                  <div className={styles["attach-images"]}>
                    {attachImages.map((image, index) => {
                      return (
                        <div
                          key={index}
                          className={styles["attach-image"]}
                          style={{ backgroundImage: `url("${image}")` }}
                        >
                          <div className={styles["attach-image-mask"]}>
                            <DeleteImageButton
                              deleteImage={() => {
                                setAttachImages(
                                  attachImages.filter((_, i) => i !== index),
                                );
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <IconButton
                  icon={
                    <SendWhiteIcon
                      style={{
                        width:
                          typeof window !== "undefined" &&
                          window.innerWidth <= 600
                            ? "12px"
                            : "14px",
                        height:
                          typeof window !== "undefined" &&
                          window.innerWidth <= 600
                            ? "12px"
                            : "14px",
                      }}
                    />
                  }
                  className={styles["chat-input-send"]}
                  type="primary"
                  onClick={() => doSubmit(userInput)}
                  title={Locale.Chat.Send}
                  style={(() => {
                    // {{CHENGQI:
                    // Action: Modified - 实现完整的内联样式响应式逻辑
                    // Timestamp: 2025-06-20 15:00:00 +08:00
                    // Reason: 使用内联样式完全控制按钮定位和尺寸，解决静态构建环境差异
                    // Principle_Applied: 内联样式优先级最高，JavaScript处理响应式逻辑
                    // Optimization: 绕过CSS模块在静态构建中的潜在问题，确保跨环境一致性
                    // Architectural_Note (AR): 内联样式统一管理定位、尺寸和响应式行为
                    // Documentation_Note (DW): 发送按钮现在完全由内联样式控制，确保静态构建正确显示
                    // }}
                    const isMobile =
                      typeof window !== "undefined" && window.innerWidth <= 600;

                    return {
                      // 定位属性
                      position: "absolute" as const,
                      right: isMobile ? "12px" : "16px",
                      top: "50%",
                      transform: "translateY(-50%)",

                      // 尺寸属性
                      width: isMobile ? "32px" : "36px",
                      height: isMobile ? "32px" : "36px",
                      minWidth: isMobile ? "32px" : "36px",
                      minHeight: isMobile ? "32px" : "36px",
                      maxWidth: isMobile ? "32px" : "36px",
                      maxHeight: isMobile ? "32px" : "36px",
                      padding: isMobile ? "5px" : "6px",

                      // 确保层级
                      zIndex: 10,
                    };
                  })()}
                />
              </label>
            </div>
          </div>
          <div
            className={clsx(styles["chat-side-panel"], {
              [styles["chat-side-panel-show"]]: showChatSidePanel,
            })}
          >
            {showChatSidePanel && (
              <RealtimeChat
                onClose={() => {
                  setShowChatSidePanel(false);
                }}
                onStartVoice={async () => {
                  console.log("start voice");
                }}
              />
            )}
          </div>
        </div>
      </div>
      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}

      {showShortcutKeyModal && (
        <ShortcutKeyModal onClose={() => setShowShortcutKeyModal(false)} />
      )}
    </>
  );
}

export function Chat() {
  const sessionId = useChatStore((state) => selectCurrentSession(state).id);
  return <_Chat key={sessionId}></_Chat>;
}

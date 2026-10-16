/**
 * Pure helpers that let the chat UI re-render only what changed.
 *
 * The chat store mutates sessions and messages in place (a streaming bot
 * message is one object whose `content` keeps growing), so object identity
 * says little about whether anything visible changed. These helpers copy out
 * the fields that are actually rendered and compare those instead.
 */
import { shallow } from "zustand/shallow";
import type { ChatMessage, ChatSession } from "../store/chat";

/** The fields of a message that the chat page renders. */
export type MessageView = Pick<
  ChatMessage,
  | "role"
  | "content"
  | "streaming"
  | "isError"
  | "thinkingContent"
  | "tools"
  | "citations"
  | "audio_url"
  | "model"
  | "date"
  | "usage"
> & { preview?: boolean };

/** Snapshot a message's rendered fields. Compare snapshots with `shallow`. */
export function getMessageView(
  message: ChatMessage & { preview?: boolean },
): MessageView {
  return {
    role: message.role,
    content: message.content,
    streaming: message.streaming,
    isError: message.isError,
    thinkingContent: message.thinkingContent,
    tools: message.tools,
    citations: message.citations,
    audio_url: message.audio_url,
    model: message.model,
    date: message.date,
    usage: message.usage,
    preview: message.preview,
  };
}

/**
 * Store selector for a single message's view, for a component that follows
 * one (streaming) message. Use with `shallow` equality.
 */
export function selectMessageView(
  state: { sessions: ChatSession[] },
  sessionId: string,
  messageId: string,
): MessageView | undefined {
  const messages = state.sessions.find((s) => s.id === sessionId)?.messages;
  if (!messages) return undefined;
  // The streaming message is almost always the last one
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].id === messageId) return getMessageView(messages[i]);
  }
  return undefined;
}

/**
 * React.memo comparator for a chat message item.
 *
 * `message` is compared by id and `view` field by field; every other prop by
 * identity. The message object may be mutated in place, so its identity tells
 * nothing, while `view` is a fresh snapshot of it on each parent render.
 */
export function areChatMessageItemPropsEqual<
  P extends { message: { id: string }; view: MessageView },
>(prev: Readonly<P>, next: Readonly<P>): boolean {
  if (
    prev.message.id !== next.message.id ||
    !shallow<MessageView>(prev.view, next.view)
  ) {
    return false;
  }
  const keys = Object.keys(next) as (keyof P)[];
  if (keys.length !== Object.keys(prev).length) return false;
  return keys.every(
    (key) =>
      key === "message" || key === "view" || Object.is(prev[key], next[key]),
  );
}

/**
 * Cheap signature of the end of a conversation. It changes when a message is
 * added or removed, when the last message's content or thinking grows, and
 * when it stops streaming. O(1) regardless of history size.
 */
export function getTailSignature(messages: ChatMessage[]): string {
  const last = messages.at(-1);
  return [
    messages.length,
    last?.id,
    last?.content.length ?? 0,
    last?.thinkingContent?.length ?? 0,
    last?.streaming,
  ].join(":");
}

/** What the sidebar shows for one session. */
export interface ChatListItem {
  id: string;
  topic: string;
  messageCount: number;
  lastUpdate: number;
  avatar: string;
  model: string;
}

/** Store selector for the sidebar list. Use with `areChatListItemsEqual`. */
export function selectChatListItems(state: {
  sessions: ChatSession[];
}): ChatListItem[] {
  return state.sessions.map((session) => ({
    id: session.id,
    topic: session.topic,
    messageCount: session.messages.length,
    lastUpdate: session.lastUpdate,
    avatar: session.mask.avatar,
    model: session.mask.modelConfig.model,
  }));
}

/**
 * Equality for `selectChatListItems` results: same sessions in the same
 * order with the same visible fields. Streaming into a session changes none
 * of them, so the sidebar stays put while a reply streams in.
 */
export function areChatListItemsEqual(
  a: ChatListItem[],
  b: ChatListItem[],
): boolean {
  return a.length === b.length && a.every((item, i) => shallow(item, b[i]));
}

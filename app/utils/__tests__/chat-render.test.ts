import { shallow } from "zustand/shallow";
import type { ChatMessage, ChatSession } from "@/app/store/chat";
import {
  areChatListItemsEqual,
  areChatMessageItemPropsEqual,
  getMessageView,
  getTailSignature,
  selectChatListItems,
  selectMessageView,
} from "@/app/utils/chat-render";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "hello",
    date: "2026/10/15 10:00:00",
    ...overrides,
  };
}

function makeSession(
  id: string,
  messages: ChatMessage[],
  overrides: Partial<ChatSession> = {},
): ChatSession {
  return {
    id,
    topic: `topic ${id}`,
    messages,
    lastUpdate: 1,
    mask: { avatar: "gpt-bot", modelConfig: { model: "gpt-6-astra" } },
    ...overrides,
  } as unknown as ChatSession;
}

describe("areChatMessageItemPropsEqual", () => {
  const onEdit = () => {};
  const onDelete = () => {};

  // What the chat page passes for a message on one of its renders
  function itemProps(message: ChatMessage, overrides: object = {}) {
    return {
      message,
      view: getMessageView(message),
      isContext: false,
      fontSize: 14,
      onEdit,
      onDelete,
      ...overrides,
    };
  }

  test("skips a parent re-render that changes nothing visible", () => {
    const message = makeMessage();
    // A fresh view snapshot every render must not count as a change
    expect(
      areChatMessageItemPropsEqual(itemProps(message), itemProps(message)),
    ).toBe(true);
  });

  test("ignores the message object's identity", () => {
    const message = makeMessage();
    const copy = { ...message };
    expect(
      areChatMessageItemPropsEqual(itemProps(message), itemProps(copy)),
    ).toBe(true);
  });

  test("re-renders when content changes in place", () => {
    // The store mutates the streaming message object in place
    const message = makeMessage({ streaming: true });
    const prev = itemProps(message);
    message.content = "hello world";
    expect(areChatMessageItemPropsEqual(prev, itemProps(message))).toBe(false);
  });

  test("re-renders when streaming ends", () => {
    const message = makeMessage({ streaming: true });
    const prev = itemProps(message);
    message.streaming = false;
    expect(areChatMessageItemPropsEqual(prev, itemProps(message))).toBe(false);
  });

  test.each<[string, Partial<ChatMessage>]>([
    ["isError", { isError: true }],
    ["thinkingContent", { thinkingContent: "thinking…" }],
    ["tools", { tools: [] }],
    ["citations", { citations: [{ title: "t", url: "https://e.com" }] }],
    ["audio_url", { audio_url: "https://e.com/a.mp3" }],
    ["model", { model: "gpt-6-sol" }],
    ["date", { date: "2026/10/15 10:00:01" }],
  ])("re-renders when %s changes", (_, change) => {
    const message = makeMessage();
    const prev = itemProps(message);
    Object.assign(message, change);
    expect(areChatMessageItemPropsEqual(prev, itemProps(message))).toBe(false);
  });

  test("re-renders for a different message", () => {
    expect(
      areChatMessageItemPropsEqual(
        itemProps(makeMessage({ id: "m1" })),
        itemProps(makeMessage({ id: "m2" })),
      ),
    ).toBe(false);
  });

  test("re-renders when a per-item prop changes", () => {
    const message = makeMessage();
    expect(
      areChatMessageItemPropsEqual(
        itemProps(message),
        itemProps(message, { fontSize: 16 }),
      ),
    ).toBe(false);
    expect(
      areChatMessageItemPropsEqual(
        itemProps(message),
        itemProps(message, { isContext: true }),
      ),
    ).toBe(false);
  });

  test("re-renders for a new callback, so callbacks must be stable", () => {
    const message = makeMessage();
    expect(
      areChatMessageItemPropsEqual(
        itemProps(message),
        itemProps(message, { onEdit: () => {} }),
      ),
    ).toBe(false);
  });
});

describe("selectMessageView", () => {
  test("finds the message by session and message id", () => {
    const message = makeMessage({ id: "m2", content: "hi" });
    const state = {
      sessions: [
        makeSession("s1", [makeMessage({ id: "m2", content: "other" })]),
        makeSession("s2", [makeMessage(), message]),
      ],
    };

    expect(selectMessageView(state, "s2", "m2")).toEqual(
      getMessageView(message),
    );
    expect(selectMessageView(state, "s2", "missing")).toBeUndefined();
    expect(selectMessageView(state, "missing", "m2")).toBeUndefined();
  });

  test("results change, under shallow equality, only when the message does", () => {
    const message = makeMessage({ streaming: true, content: "a" });
    const state = { sessions: [makeSession("s1", [message])] };

    const before = selectMessageView(state, "s1", "m1");
    expect(shallow(before, selectMessageView(state, "s1", "m1"))).toBe(true);

    message.content = "ab";
    expect(shallow(before, selectMessageView(state, "s1", "m1"))).toBe(false);
  });
});

describe("areChatListItemsEqual", () => {
  function makeState() {
    const streaming = makeMessage({ id: "m2", streaming: true, content: "" });
    const sessions = [
      makeSession("s1", [makeMessage(), streaming]),
      makeSession("s2", [makeMessage({ id: "m3" })]),
    ];
    return { sessions, streaming };
  }

  test("ignores streamed content", () => {
    const state = makeState();
    const before = selectChatListItems(state);

    state.streaming.content = "streamed text";
    state.streaming.thinkingContent = "thinking";
    // The store swaps in new arrays without changing what the list shows
    state.sessions = [...state.sessions];

    expect(areChatListItemsEqual(before, selectChatListItems(state))).toBe(
      true,
    );
  });

  test("detects a new message", () => {
    const state = makeState();
    const before = selectChatListItems(state);
    state.sessions[0].messages = [...state.sessions[0].messages, makeMessage()];
    expect(areChatListItemsEqual(before, selectChatListItems(state))).toBe(
      false,
    );
  });

  test("detects a renamed or updated session", () => {
    const state = makeState();
    const before = selectChatListItems(state);

    state.sessions[1].topic = "renamed";
    expect(areChatListItemsEqual(before, selectChatListItems(state))).toBe(
      false,
    );

    const renamed = selectChatListItems(state);
    state.sessions[1].lastUpdate = 2;
    expect(areChatListItemsEqual(renamed, selectChatListItems(state))).toBe(
      false,
    );
  });

  test("detects a model change made in place on the mask", () => {
    const state = makeState();
    const before = selectChatListItems(state);
    state.sessions[0].mask.modelConfig.model = "gpt-6-sol";
    expect(areChatListItemsEqual(before, selectChatListItems(state))).toBe(
      false,
    );
  });

  test("detects reordered, added and deleted sessions", () => {
    const state = makeState();
    const before = selectChatListItems(state);
    const [s1, s2] = state.sessions;

    expect(
      areChatListItemsEqual(
        before,
        selectChatListItems({ sessions: [s2, s1] }),
      ),
    ).toBe(false);
    expect(
      areChatListItemsEqual(
        before,
        selectChatListItems({ sessions: [s1, s2, makeSession("s3", [])] }),
      ),
    ).toBe(false);
    expect(
      areChatListItemsEqual(before, selectChatListItems({ sessions: [s1] })),
    ).toBe(false);
  });
});

describe("getTailSignature", () => {
  test("changes when the tail grows, a message arrives or streaming ends", () => {
    const last = makeMessage({ id: "m2", streaming: true, content: "a" });
    const messages = [makeMessage(), last];
    const initial = getTailSignature(messages);

    expect(getTailSignature(messages)).toBe(initial);

    last.content = "ab";
    const grown = getTailSignature(messages);
    expect(grown).not.toBe(initial);

    last.thinkingContent = "t";
    const thinking = getTailSignature(messages);
    expect(thinking).not.toBe(grown);

    last.streaming = false;
    const done = getTailSignature(messages);
    expect(done).not.toBe(thinking);

    expect(getTailSignature([...messages, makeMessage({ id: "m3" })])).not.toBe(
      done,
    );
  });
});

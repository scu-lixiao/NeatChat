import DeleteIcon from "../icons/delete.svg";

import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { MaskAvatar } from "./mask";
import { memo, useCallback, useRef, useEffect } from "react";
import {
  areChatListItemsEqual,
  selectChatListItems,
} from "../utils/chat-render";
import { showConfirm } from "./ui-lib";
import { useMobileScreen } from "../utils";
import clsx from "clsx";

export const ChatItem = memo(function ChatItem(props: {
  onClick?: (index: number) => void;
  onDelete?: (index: number) => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: string;
  index: number;
  narrow?: boolean;
  avatar: string;
  model: string;
}) {
  const draggableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.selected && draggableRef.current) {
      draggableRef.current?.scrollIntoView({
        block: "center",
      });
    }
  }, [props.selected]);

  const { pathname: currentPath } = useLocation();
  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <div
          className={clsx(styles["chat-item"], {
            [styles["chat-item-selected"]]:
              props.selected &&
              (currentPath === Path.Chat || currentPath === Path.Home),
          })}
          onClick={() => props.onClick?.(props.index)}
          ref={(ele) => {
            draggableRef.current = ele;
            provided.innerRef(ele);
          }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          title={`${props.title}\n${Locale.ChatItem.ChatItemCount(
            props.count,
          )}`}
        >
          {props.narrow ? (
            <div className={styles["chat-item-narrow"]}>
              <div className={clsx(styles["chat-item-avatar"], "no-dark")}>
                <MaskAvatar avatar={props.avatar} model={props.model} />
              </div>
              <div className={styles["chat-item-narrow-count"]}>
                {props.count}
              </div>
            </div>
          ) : (
            <>
              <div className={styles["chat-item-title"]}>{props.title}</div>
              <div className={styles["chat-item-info"]}>
                <div className={styles["chat-item-count"]}>
                  {Locale.ChatItem.ChatItemCount(props.count)}
                </div>
                <div className={styles["chat-item-date"]}>{props.time}</div>
              </div>
            </>
          )}

          <div
            className={styles["chat-item-delete"]}
            onClickCapture={(e) => {
              props.onDelete?.(props.index);
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      )}
    </Draggable>
  );
});

export function ChatList(props: { narrow?: boolean }) {
  // Only the fields the list shows, so streaming into a session (which
  // changes none of them) doesn't re-render the list
  const items = useChatStore(selectChatListItems, areChatListItemsEqual);
  const selectedIndex = useChatStore((state) => state.currentSessionIndex);
  const selectSession = useChatStore((state) => state.selectSession);
  const moveSession = useChatStore((state) => state.moveSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const navigate = useNavigate();
  const isMobileScreen = useMobileScreen();

  // Stable callbacks so memoized ChatItems don't re-render on every store
  // update (e.g. each streamed token of the current chat).
  const onSelect = useCallback(
    (index: number) => {
      navigate(Path.Chat);
      selectSession(index);
    },
    [navigate, selectSession],
  );
  const onDelete = useCallback(
    async (index: number) => {
      if (
        (!props.narrow && !isMobileScreen) ||
        (await showConfirm(Locale.Home.DeleteChat))
      ) {
        deleteSession(index);
      }
    },
    [props.narrow, isMobileScreen, deleteSession],
  );

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    moveSession(source.index, destination.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="chat-list">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {items.map((item, i) => (
              <ChatItem
                title={item.topic}
                time={new Date(item.lastUpdate).toLocaleString()}
                count={item.messageCount}
                key={item.id}
                id={item.id}
                index={i}
                selected={i === selectedIndex}
                onClick={onSelect}
                onDelete={onDelete}
                narrow={props.narrow}
                avatar={item.avatar}
                model={item.model}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

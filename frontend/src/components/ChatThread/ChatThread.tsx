import { useMessageStore } from "../../store/messageStore";
import { useUiStore } from "../../store/uiStore";
import MessageList from "./MessageList";
import EmptyState from "./EmptyState";

export default function ChatThread() {
  const messages = useMessageStore((state) => state.messages);
  const isTyping = useUiStore((state) => state.isTyping);

  if (messages.length === 0 && !isTyping) {
    return <EmptyState />;
  }

  return <MessageList messages={messages} isTyping={isTyping} />;
}
import { useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useConversationStore } from "../store/conversationStore";

export function useKeyboardShortcuts() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const createConversation = useConversationStore((s) => s.createConversation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
      } else if (e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        createConversation();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSidebarOpen, createConversation]);
}
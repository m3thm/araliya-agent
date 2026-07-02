import { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { useConversationStore } from "../store/conversationStore";
import { useUiStore } from "../store/uiStore";
import Sheet from "./ui/Sheet";

export default function ConversationSidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const conversations = useConversationStore((s) => s.conversations);
  const activeId = useConversationStore((s) => s.activeConversationId);
  const loading = useConversationStore((s) => s.loading);
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const createConversation = useConversationStore((s) => s.createConversation);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!sidebarOpen) setPendingDeleteId(null);
  }, [sidebarOpen]);

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <Sheet open={sidebarOpen} onClose={() => setSidebarOpen(false)} side="left" title="Your chats">
      <div className="p-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => createConversation()}
          className="w-full h-10 rounded-full bg-brand text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-brand-dark transition-colors"
        >
          <Plus className="size-4" /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide">
        {loading && conversations.length === 0 && (
          <p className="text-center text-sm text-ink/40 px-4 py-8">Loading…</p>
        )}
        {!loading && conversations.length === 0 && (
          <p className="text-center text-sm text-ink/40 px-4 py-8">No chats yet.</p>
        )}

        {sorted.map((conversation) => {
          const isActive = conversation.id === activeId;
          const isPendingDelete = conversation.id === pendingDeleteId;
          return (
            <div
              key={conversation.id}
              className={`group flex items-center gap-1 rounded-lg px-1 ${
                isActive ? "bg-brand/10" : "hover:bg-brand/5"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isPendingDelete) return;
                  selectConversation(conversation.id);
                  setSidebarOpen(false);
                }}
                title={conversation.title ?? "New conversation"}
                className="flex-1 flex items-center gap-2 py-2.5 px-2 min-w-0 text-left"
              >
                <MessageSquare className="size-4 text-brand/60 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm truncate ${
                      isActive ? "text-brand font-semibold" : "text-ink/80"
                    }`}
                  >
                    {conversation.title ?? "New conversation"}
                  </span>
                  <span className="block text-[11px] text-ink/40">
                    {new Date(conversation.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </span>
              </button>

              {isPendingDelete ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                      deleteConversation(conversation.id);
                    }}
                    aria-label="Confirm delete conversation"
                    className="h-7 px-2 rounded-md bg-danger/10 text-danger text-[11px] font-semibold hover:bg-danger/15"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(null);
                    }}
                    aria-label="Cancel delete"
                    className="size-7 grid place-items-center rounded-md text-ink/40 hover:bg-black/5"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteId(conversation.id);
                  }}
                  aria-label="Delete conversation"
                  className="size-7 grid place-items-center rounded-md text-ink/30 hover:text-danger opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0 transition-opacity"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

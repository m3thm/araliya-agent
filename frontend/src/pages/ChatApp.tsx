import { useEffect } from "react";
import { Toaster } from "sonner";
import Header from "../components/Header";
import ChatThread from "../components/ChatThread/ChatThread";
import InputBar from "../components/InputBar";
import CartDrawer from "../components/CartDrawer/CartDrawer";
import ConversationSidebar from "../components/ConversationSidebar";
import SavedItemsSheet from "../components/SavedItemsSheet";
import OrderHistorySheet from "../components/OrderHistorySheet";
import { usePrefsStore } from "../store/prefsStore";
import { useOrdersStore } from "../store/ordersStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export default function ChatApp() {
  const loadPrefs = usePrefsStore((s) => s.loadPrefs);
  // Loaded here (not just when OrderHistorySheet opens) so the chat has
  // order context — which orders exist, and whether each already has a
  // Kapruka order number on file — from the very first message, without
  // requiring the shopper to open Order History first.
  const loadOrders = useOrdersStore((s) => s.loadOrders);

  useEffect(() => {
    loadPrefs();
    loadOrders();
  }, [loadPrefs, loadOrders]);

  useKeyboardShortcuts();

  return (
    <div className="h-screen flex flex-col bg-surface text-ink overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col min-h-0">
        <ChatThread />
        <InputBar />
      </main>
      <ConversationSidebar />
      <CartDrawer />
      <SavedItemsSheet />
      <OrderHistorySheet />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: "var(--font-sans)" } }}
      />
    </div>
  );
}
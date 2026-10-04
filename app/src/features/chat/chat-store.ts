import { create } from "zustand";
import type { ChatMessage } from "@/features/chat/chat-messages";

type ChatStoreState = {
  collection: string;
  isStreaming: boolean;
  messages: ChatMessage[];
  activeStream: AbortController | null;
  clearMessages: () => void;
  reset: () => void;
  selectCollection: (collection: string) => void;
  startStream: (collection: string, messages: ChatMessage[]) => AbortController | null;
  finishStream: (controller: AbortController) => void;
  stopStream: (controller?: AbortController) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateMessage: (id: string, update: (message: ChatMessage) => ChatMessage) => void;
};

const initialState = {
  collection: "",
  isStreaming: false,
  messages: [],
  activeStream: null,
} satisfies Pick<ChatStoreState, "collection" | "isStreaming" | "messages" | "activeStream">;

export const useChatStore = create<ChatStoreState>()((set, get) => ({
  ...initialState,
  clearMessages: () => {
    get().activeStream?.abort();
    set({ activeStream: null, isStreaming: false, messages: [] });
  },
  reset: () => {
    get().activeStream?.abort();
    set(initialState);
  },
  selectCollection: (collection) => {
    if (get().collection === collection) return;
    get().activeStream?.abort();
    set({ collection, activeStream: null, isStreaming: false, messages: [] });
  },
  startStream: (collection, messages) => {
    const state = get();
    if (state.activeStream || state.collection !== collection) return null;
    const controller = new AbortController();
    set({
      activeStream: controller,
      isStreaming: true,
      messages: [...state.messages, ...messages],
    });
    return controller;
  },
  finishStream: (controller) => {
    if (get().activeStream !== controller) return;
    set({ activeStream: null, isStreaming: false });
  },
  stopStream: (controller) => {
    const state = get();
    if (!state.activeStream || (controller && state.activeStream !== controller)) return;
    state.activeStream.abort();
    const messages = state.messages.map((message, index) =>
      index === state.messages.length - 1 && message.role === "assistant" && !message.status
        ? { ...message, status: "stopped" as const }
        : message,
    );
    set({ activeStream: null, isStreaming: false, messages });
  },
  setMessages: (messages) => set({ messages }),
  updateMessage: (id, update) =>
    set((state) => {
      const index = state.messages.findIndex((message) => message.id === id);
      if (index < 0) return state;
      const messages = state.messages.slice();
      messages[index] = update(messages[index]);
      return { messages };
    }),
}));

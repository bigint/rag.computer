import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ChatState } from "@/features/chat/chat-input";
import type { ChatMessage } from "@/features/chat/chat-messages";
import { createChatMessageId } from "@/features/chat/chat-page-defaults";
import { normalizeTimings, timingsFromRetrieval } from "@/features/chat/chat-page-timings";
import { useChatStore } from "@/features/chat/chat-store";
import { refreshChatCredentials } from "@/hooks/use-chat-readiness";
import { streamChat } from "@/lib/chat-stream";
import { withSessionSignal } from "@/lib/session-request";
import { isCurrentSession } from "@/lib/session-state";

type ChatStreamingOptions = {
  canUseCredentials: () => boolean;
  collection: string;
  state: ChatState;
};

export const useChatStreaming = ({
  canUseCredentials,
  collection,
  state,
}: ChatStreamingOptions) => {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const { startStream, finishStream, stopStream, updateMessage } = useChatStore.getState();

  useEffect(
    () => () => {
      flushRef.current?.();
      if (abortRef.current) stopStream(abortRef.current);
      abortRef.current = null;
    },
    [stopStream],
  );

  const stopStreaming = useCallback(() => {
    flushRef.current?.();
    if (abortRef.current) stopStream(abortRef.current);
    abortRef.current = null;
  }, [stopStream]);

  const handleSend = useCallback(
    async (text: string) => {
      if (useChatStore.getState().activeStream) return;
      if (!isCurrentSession(queryClient)) return;
      if (!canUseCredentials()) {
        toast.error("Check chat credentials before sending");
        return;
      }
      if (!collection) {
        toast.error("Pick a collection first");
        return;
      }

      const userId = createChatMessageId();
      const assistantId = createChatMessageId();
      let currentAssistantId = assistantId;
      const userMsg: ChatMessage = { id: userId, role: "user", content: text };
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "" };
      const controller = startStream(collection, [userMsg, assistantMsg]);
      if (!controller) return;
      abortRef.current = controller;
      const ownsStream = () =>
        isCurrentSession(queryClient) && useChatStore.getState().activeStream === controller;
      let deltaBuffer = "";
      let deltaFrame: number | null = null;
      const flushDelta = () => {
        if (deltaFrame !== null) window.cancelAnimationFrame(deltaFrame);
        deltaFrame = null;
        if (!ownsStream()) {
          deltaBuffer = "";
          return;
        }
        if (!deltaBuffer) return;
        const delta = deltaBuffer;
        deltaBuffer = "";
        updateMessage(currentAssistantId, (message) => ({
          ...message,
          content: message.content + delta,
        }));
      };
      flushRef.current = flushDelta;
      const enqueueDelta = (delta: string) => {
        deltaBuffer += delta;
        if (deltaFrame === null) {
          deltaFrame = window.requestAnimationFrame(flushDelta);
        }
      };
      try {
        await withSessionSignal(
          queryClient,
          (signal) =>
            streamChat({
              signal,
              body: {
                message: text,
                collection: collection,
                model_provider: "openai",
                model: state.model,
                temperature: state.temperature,
                top_k: state.topK,
                search_mode: state.searchMode,
                rerank: state.rerank,
                multimodal: state.multimodal,
                system_prompt: state.systemPrompt,
              },
              onEvent: (event) => {
                if (!ownsStream()) return;
                if (event.event === "sources") {
                  updateMessage(currentAssistantId, (message) => ({
                    ...message,
                    meta: {
                      collection: event.data.collection,
                      sources: event.data.sources,
                      timings: normalizeTimings(event.data.timings),
                    },
                  }));
                  return;
                }
                if (event.event === "delta") {
                  enqueueDelta(event.data.delta);
                  return;
                }
                if (event.event === "assistant_message") {
                  flushDelta();
                  updateMessage(currentAssistantId, (message) => ({
                    ...message,
                    id: event.data.id,
                    content: event.data.content,
                    status: event.data.status,
                    errorMessage: event.data.error_message,
                    meta: {
                      collection: collection,
                      sources: event.data.sources,
                      timings: timingsFromRetrieval(event.data),
                    },
                  }));
                  currentAssistantId = event.data.id;
                  return;
                }
                if (event.event === "error") {
                  flushDelta();
                  updateMessage(currentAssistantId, (message) => ({
                    ...message,
                    status: "error",
                    errorMessage: event.data.error,
                  }));
                  void refreshChatCredentials(queryClient);
                  toast.error(event.data.error);
                }
              },
            }),
          controller.signal,
        );
        if (ownsStream()) {
          flushDelta();
          updateMessage(currentAssistantId, (message) => ({
            ...message,
            status: message.status ?? "complete",
          }));
        }
      } catch (err) {
        if (!ownsStream()) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          flushDelta();
          updateMessage(currentAssistantId, (chatMessage) => ({
            ...chatMessage,
            status: "stopped",
          }));
        } else {
          const message = err instanceof Error ? err.message : "Chat request failed";
          flushDelta();
          updateMessage(currentAssistantId, (chatMessage) => ({
            ...chatMessage,
            status: "error",
            errorMessage: message,
          }));
          void refreshChatCredentials(queryClient);
          toast.error(message);
        }
      } finally {
        if (deltaFrame !== null) {
          window.cancelAnimationFrame(deltaFrame);
          flushDelta();
        }
        finishStream(controller);
        if (abortRef.current === controller) {
          abortRef.current = null;
          flushRef.current = null;
        }
      }
    },
    [
      collection,
      canUseCredentials,
      queryClient,
      finishStream,
      startStream,
      state.model,
      state.multimodal,
      state.rerank,
      state.searchMode,
      state.systemPrompt,
      state.temperature,
      state.topK,
      updateMessage,
    ],
  );

  return { handleSend, stopStreaming };
};

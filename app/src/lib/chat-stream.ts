import type { ChatCreateBody, ChatMessage, ChatSource } from "@bigrag/client/browser";
import { apiUrl } from "@/config/runtime";
import type { QueryTimings } from "@/types/bigrag";

type ChatStreamEvent =
  | { event: "user_message"; data: ChatMessage }
  | {
      event: "sources";
      data: { collection: string | null; sources: ChatSource[]; timings?: QueryTimings };
    }
  | { event: "delta"; data: { delta: string } }
  | { event: "assistant_message"; data: ChatMessage }
  | { event: "done"; data: Record<string, never> }
  | { event: "error"; data: { error: string } };

type StreamOptions = {
  body: ChatCreateBody;
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
};

class ChatStreamError extends Error {}

export const streamChat = async (opts: StreamOptions): Promise<void> => {
  const res = await fetch(apiUrl("v1/chat"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let detail = "Chat request failed";
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      detail = `${res.status} ${res.statusText}`;
    }
    throw new ChatStreamError(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const dispatchFrame = (frame: string) => {
    const parsed = parseFrame(frame);
    if (!parsed) return;
    if ("done" in parsed) {
      finished = true;
      return;
    }
    opts.onEvent(parsed.event);
    finished = parsed.event.event === "done" || parsed.event.event === "error";
  };

  try {
    while (!finished) {
      opts.signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        dispatchFrame(frame);
        if (finished) break;
      }
    }
    opts.signal?.throwIfAborted();
    buffer += decoder.decode();
    if (!finished && buffer.trim()) dispatchFrame(buffer);
    if (!finished) throw new ChatStreamError("Chat stream interrupted. Please retry.");
  } finally {
    try {
      await reader.cancel();
    } catch {
    } finally {
      reader.releaseLock();
    }
  }
};

const parseFrame = (frame: string): { done: true } | { event: ChatStreamEvent } | null => {
  let eventName = "message";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  const payload = data.join("\n");
  if (!payload) return null;
  if (payload === "[DONE]") return { done: true };
  try {
    return {
      event: {
        event: eventName,
        data: JSON.parse(payload) as unknown,
      } as ChatStreamEvent,
    };
  } catch {
    return null;
  }
};

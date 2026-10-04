import type { QueryClient } from "@tanstack/react-query";
import { isCurrentSession, sessionSignal } from "@/lib/session-state";

export const withSessionSignal = async <T>(
  client: QueryClient,
  request: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const controller = new AbortController();
  const signals = [sessionSignal(client), ...(signal ? [signal] : [])];
  const listeners = signals.map((source) => {
    const abort = () => controller.abort(source.reason);
    if (source.aborted) abort();
    else source.addEventListener("abort", abort, { once: true });
    return { source, abort };
  });
  try {
    controller.signal.throwIfAborted();
    const result = await request(controller.signal);
    controller.signal.throwIfAborted();
    if (!isCurrentSession(client)) throw new DOMException("Session changed", "AbortError");
    return result;
  } finally {
    for (const { source, abort } of listeners) source.removeEventListener("abort", abort);
  }
};

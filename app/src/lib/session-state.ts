import type { SessionResponse } from "@bigrag/client/browser";
import { QueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/features/chat/chat-store";
import { useUploadSessionStore } from "@/features/collections/upload-session-store";
import { queryKeys } from "@/lib/query-keys";

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

type SessionState = {
  client: QueryClient;
  generation: number;
  ownerId: string | null | undefined;
  controller: AbortController;
};

let state: SessionState = {
  client: createClient(),
  generation: 0,
  ownerId: undefined,
  controller: new AbortController(),
};
const listeners = new Set<() => void>();

export const getSessionState = () => state;
export const subscribeSessionState = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const isCurrentSession = (client: QueryClient) => state.client === client;
export const sessionSignal = (client: QueryClient) => {
  if (!isCurrentSession(client)) throw new DOMException("Session changed", "AbortError");
  return state.controller.signal;
};

export const adoptSession = (
  expectedClient: QueryClient,
  session: SessionResponse | null,
  force = false,
) => {
  if (!isCurrentSession(expectedClient)) return false;
  const ownerId = session?.user.id ?? null;
  if (!force && state.ownerId === ownerId) return false;
  const previous = state;
  const client = createClient();
  client.setQueryData(queryKeys.auth.session(), session);
  state = {
    client,
    generation: previous.generation + 1,
    ownerId,
    controller: new AbortController(),
  };
  previous.controller.abort();
  useChatStore.getState().reset();
  useUploadSessionStore.getState().setOwner(ownerId);
  void previous.client.cancelQueries();
  previous.client.clear();
  for (const listener of listeners) listener();
  return true;
};

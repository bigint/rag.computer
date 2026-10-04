import type { ChatReadinessResponse } from "@bigrag/client/browser";
import { type QueryClient, useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { withSessionSignal } from "@/lib/session-request";
import { getSessionState, isCurrentSession } from "@/lib/session-state";

const keyMutation = (variables: unknown) =>
  typeof variables === "object" &&
  variables !== null &&
  "chat" in variables &&
  typeof variables.chat === "object" &&
  variables.chat !== null &&
  "openai_key" in variables.chat;

const keyMutations = {
  mutationKey: queryKeys.preferences(),
  predicate: (mutation: { state: { variables?: unknown } }) =>
    keyMutation(mutation.state.variables),
};

export const refreshChatCredentials = (client: QueryClient) => {
  if (!isCurrentSession(client)) return;
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.preferences() }),
    client.invalidateQueries({ queryKey: queryKeys.chat.readiness() }),
  ]);
};

export type ChatReadinessStatus = {
  ready: boolean;
  checking: boolean;
  message: string;
  refresh: () => void;
};

export const useChatReadiness = () => {
  const client = useQueryClient();
  const session = useSession();
  const ownerId = getSessionState().ownerId;
  const confirmed = Boolean(
    ownerId && session.data?.user.id === ownerId && isCurrentSession(client),
  );
  const savingKey = useIsMutating(keyMutations) > 0;
  const query = useQuery({
    queryKey: queryKeys.chat.readiness(),
    queryFn: ({ signal }) =>
      withSessionSignal(
        client,
        (ownedSignal) =>
          apiClient.get<ChatReadinessResponse>("v1/auth/preferences/chat-readiness", {
            signal: ownedSignal,
          }),
        signal,
      ),
    enabled: confirmed,
    staleTime: 30_000,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const canUseCredentials = () => {
    const current = client.getQueryState<ChatReadinessResponse>(queryKeys.chat.readiness());
    return Boolean(
      confirmed &&
        isCurrentSession(client) &&
        !client.isMutating(keyMutations) &&
        current?.status === "success" &&
        current.fetchStatus === "idle" &&
        current.data?.credential_ready,
    );
  };
  const checking = !confirmed || query.isPending || query.isFetching || savingKey;
  const ready = !checking && query.isSuccess && query.data.credential_ready;
  const message = savingKey
    ? "Updating chat credentials…"
    : checking
      ? "Checking chat credentials…"
      : query.isError
        ? "Chat readiness is unavailable. Try checking again."
        : ready
          ? query.data?.credential_source === "instance"
            ? "Using configured instance credentials."
            : "Your saved chat key is ready."
          : query.data?.reason === "missing_credentials"
            ? "Save a chat key or ask an administrator to configure instance credentials."
            : query.data?.reason === "decryption_unavailable"
              ? "Chat credentials cannot be decrypted. Ask an administrator to check configuration."
              : "Chat credentials do not match the configured destination. Save your key again or check instance configuration.";
  const refresh = () => {
    if (confirmed && isCurrentSession(client) && !client.isMutating(keyMutations))
      void query.refetch();
  };
  return {
    canUseCredentials,
    status: { ready, checking, message, refresh } satisfies ChatReadinessStatus,
  };
};

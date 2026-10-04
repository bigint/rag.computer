import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { withSessionSignal } from "@/lib/session-request";
import { isCurrentSession, sessionSignal } from "@/lib/session-state";

type ChatPrefs = {
  openai_key?: string;
  has_openai_key?: boolean;
  model?: string;
  top_k?: number;
  temperature?: number;
  system_prompt?: string;
  search_mode?: "semantic" | "keyword" | "hybrid";
  rerank?: boolean;
  multimodal?: boolean;
};

type Preferences = {
  chat?: ChatPrefs;
};

const KEY = queryKeys.preferences();

export const usePreferences = () => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      withSessionSignal(
        qc,
        (ownedSignal) =>
          apiClient.get<{ data: Preferences }>("v1/auth/preferences", { signal: ownedSignal }),
        signal,
      ),
    staleTime: 30_000,
  });
};

const stripSecrets = (prefs?: ChatPrefs): ChatPrefs | undefined => {
  if (prefs?.openai_key === undefined) return prefs;
  const { openai_key: _openaiKey, ...rest } = prefs;
  return rest;
};

export const useUpdatePreferences = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: (patch: Preferences) =>
      withSessionSignal(qc, (signal) =>
        apiClient.put<{ data: Preferences }>("v1/auth/preferences", { data: patch }, { signal }),
      ),
    onMutate: async (patch) => {
      sessionSignal(qc).throwIfAborted();
      await qc.cancelQueries({ queryKey: KEY });
      sessionSignal(qc).throwIfAborted();
      if (patch.chat?.openai_key !== undefined) {
        await qc.cancelQueries({ queryKey: queryKeys.chat.readiness() });
        await qc.invalidateQueries({ queryKey: queryKeys.chat.readiness(), refetchType: "none" });
      }
      sessionSignal(qc).throwIfAborted();
      const previous = qc.getQueryData<{ data: Preferences }>(KEY);
      qc.setQueryData<{ data: Preferences }>(KEY, (old) => ({
        data: {
          ...(old?.data ?? {}),
          ...patch,
          chat: {
            ...(old?.data?.chat ?? {}),
            ...(stripSecrets(patch.chat) ?? {}),
          },
        },
      }));
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (!isCurrentSession(qc)) return;
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: (_data, _error, patch) => {
      if (!isCurrentSession(qc)) return;
      return Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        ...(patch.chat?.openai_key === undefined
          ? []
          : [qc.invalidateQueries({ queryKey: queryKeys.chat.readiness() })]),
      ]);
    },
  });
};

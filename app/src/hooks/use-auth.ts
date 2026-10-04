import { APIError, type User as CurrentUser, type SessionResponse } from "@bigrag/client/browser";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AUTH_TIMEOUT_MS, apiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { adoptSession, isCurrentSession, sessionSignal } from "@/lib/session-state";

const pendingAuthentication = new WeakMap<QueryClient, number>();
const authenticationLifecycle = (client: QueryClient) => ({
  onMutate: async () => {
    sessionSignal(client).throwIfAborted();
    pendingAuthentication.set(client, (pendingAuthentication.get(client) ?? 0) + 1);
    await client.cancelQueries({ queryKey: queryKeys.auth.session() });
  },
  onSettled: () => {
    const remaining = (pendingAuthentication.get(client) ?? 1) - 1;
    if (remaining > 0) pendingAuthentication.set(client, remaining);
    else pendingAuthentication.delete(client);
    if (remaining <= 0 && isCurrentSession(client)) {
      void client.invalidateQueries({ queryKey: queryKeys.auth.session() });
    }
  },
});

export type { CurrentUser };

type UpdateCurrentUserProfileBody = {
  id: string;
  display_name: string;
  email: string;
};

export const useSetupStatus = () =>
  useQuery({
    queryKey: queryKeys.auth.setupStatus(),
    queryFn: ({ signal }) =>
      apiClient.get<{ needs_setup: boolean }>("v1/auth/setup-status", {
        signal,
        timeoutMs: AUTH_TIMEOUT_MS,
      }),
    staleTime: (query) => (query.state.data?.needs_setup === false ? Infinity : 0),
    retry: false,
  });

export const useSession = () => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: async ({ signal }) => {
      if (pendingAuthentication.get(qc)) {
        return qc.getQueryData<SessionResponse | null>(queryKeys.auth.session()) ?? null;
      }
      try {
        const session = await apiClient.get<SessionResponse>("v1/auth/me", {
          signal,
          timeoutMs: AUTH_TIMEOUT_MS,
        });
        signal.throwIfAborted();
        if (!pendingAuthentication.get(qc)) adoptSession(qc, session);
        return session;
      } catch (err) {
        if (err instanceof APIError && err.status === 401) {
          signal.throwIfAborted();
          if (!pendingAuthentication.get(qc)) adoptSession(qc, null);
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
};

export const useLogin = (onAuthenticated?: () => void) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiClient.post<SessionResponse>("v1/auth/login", body, { signal: sessionSignal(qc) }),
    ...authenticationLifecycle(qc),
    onSuccess: (data) => {
      if (adoptSession(qc, data, true)) onAuthenticated?.();
    },
  });
};

export const useLogout = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post<void>("v1/auth/logout", undefined, { signal: sessionSignal(qc) });
      } catch (err) {
        if (!(err instanceof APIError && err.status === 401)) throw err;
      }
    },
    ...authenticationLifecycle(qc),
    onSuccess: () => {
      if (!adoptSession(qc, null, true)) return;
      toast.success("Signed out");
      navigate({ to: "/login", replace: true });
    },
  });
};

export const useLogoutAll = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<void>("v1/auth/logout-all", undefined, { signal: sessionSignal(qc) }),
    ...authenticationLifecycle(qc),
    onSuccess: () => {
      if (!adoptSession(qc, null, true)) return;
      toast.success("Signed out of all devices");
      navigate({ to: "/login", replace: true });
    },
  });
};

export const useSetup = (onAuthenticated?: () => void) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name: string }) =>
      apiClient.post<SessionResponse>("v1/auth/setup", body, { signal: sessionSignal(qc) }),
    ...authenticationLifecycle(qc),
    onSuccess: (data) => {
      if (adoptSession(qc, data, true)) onAuthenticated?.();
    },
  });
};

export const useUpdateCurrentUserProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCurrentUserProfileBody) =>
      apiClient.patch<CurrentUser>(`v1/admin/users/${encodeURIComponent(id)}`, body, {
        signal: sessionSignal(qc),
      }),
    onSuccess: (user) => {
      if (!isCurrentSession(qc)) return;
      qc.setQueryData<SessionResponse>(queryKeys.auth.session(), { user });
      qc.invalidateQueries({ queryKey: queryKeys.auth.all() });
      toast.success("Profile updated");
    },
  });
};

export const useChangePassword = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      apiClient.post<{ status: string; message: string }>("v1/auth/password", body, {
        signal: sessionSignal(qc),
      }),
    ...authenticationLifecycle(qc),
    onSuccess: () => {
      if (!adoptSession(qc, null, true)) return;
      toast.success("Password updated");
      navigate({ to: "/login", replace: true });
    },
  });
};

import { APIError } from "@bigrag/client/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { runWithConcurrency } from "@/lib/concurrency";
import { errorToast } from "@/lib/mutation-toast";
import { queryKeys } from "@/lib/query-keys";
import { isCurrentSession, sessionSignal } from "@/lib/session-state";
import type { UploadSession, UploadSessionFileResponse } from "@/types/bigrag";

const uploadConcurrency = 4;
const uploadSessionPollMs = 2_000;
const terminalUploadSessionStatuses = new Set<UploadSession["status"]>([
  "complete",
  "failed",
  "canceled",
]);

const uploadSessionFileName = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

const uploadSessionClientId = (file: File, index: number) =>
  `${index}:${uploadSessionFileName(file)}:${file.size}:${file.lastModified}`;

export const useUploadSession = (collection: string, sessionId: string | null) => {
  const queryKey = useMemo(
    () => queryKeys.documents.uploadSession({ collection, id: sessionId }),
    [collection, sessionId],
  );
  const enabled = Boolean(collection && sessionId);
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiClient.get<UploadSession>(
        `v1/collections/${encodeURIComponent(collection)}/upload-sessions/${sessionId}`,
        { signal },
      ),
    enabled,
    refetchInterval: (query) => {
      const session = query.state.data;
      return session && terminalUploadSessionStatuses.has(session.status)
        ? false
        : uploadSessionPollMs;
    },
  });
};

export const useUploadSessionDocuments = (
  collection: string,
  options?: { onSessionStart?: (session: UploadSession) => void },
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const signal = sessionSignal(qc);
      signal.throwIfAborted();
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const session = await apiClient.post<UploadSession>(
        `v1/collections/${encodeURIComponent(collection)}/upload-sessions`,
        {
          total_files: files.length,
          total_bytes: totalBytes,
          metadata: {},
        },
        { signal },
      );
      signal.throwIfAborted();
      options?.onSessionStart?.(session);
      const errors: { filename: string; error: string }[] = [];
      const sessionPath = `v1/collections/${encodeURIComponent(collection)}/upload-sessions/${session.id}`;
      let canceledSession: UploadSession | null = null;
      const cancellationFromError = async (error: unknown) => {
        if (!(error instanceof APIError && error.status === 409)) return null;
        const current = await apiClient.get<UploadSession>(sessionPath, { signal });
        signal.throwIfAborted();
        return current.status === "canceled" ? current : null;
      };
      await runWithConcurrency(files, uploadConcurrency, async (file, index) => {
        signal.throwIfAborted();
        if (canceledSession) return;
        const form = new FormData();
        form.append("client_item_id", uploadSessionClientId(file, index));
        form.append("file", file, uploadSessionFileName(file));
        try {
          const response = await apiClient.postForm<UploadSessionFileResponse>(
            `v1/collections/${encodeURIComponent(collection)}/upload-sessions/${session.id}/files`,
            form,
            { signal },
          );
          signal.throwIfAborted();
          if (response.session.status === "canceled") canceledSession = response.session;
          if (response.item.status === "failed" || response.item.status === "canceled") {
            errors.push({
              filename: uploadSessionFileName(file),
              error: response.item.error_message ?? "File was not accepted",
            });
          }
        } catch (err) {
          signal.throwIfAborted();
          const canceled = await cancellationFromError(err);
          if (canceled) {
            canceledSession = canceled;
            return;
          }
          errors.push({
            filename: uploadSessionFileName(file),
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      });
      signal.throwIfAborted();
      let finalSession: UploadSession;
      if (canceledSession) {
        finalSession = canceledSession;
      } else {
        try {
          finalSession = await apiClient.post<UploadSession>(`${sessionPath}/complete`, undefined, {
            signal,
          });
        } catch (error) {
          const canceled = await cancellationFromError(error);
          if (!canceled) throw error;
          finalSession = canceled;
        }
      }
      signal.throwIfAborted();
      return { errors, session: finalSession };
    },
    onSuccess: ({ session }) => {
      if (!isCurrentSession(qc)) return;
      qc.invalidateQueries({ queryKey: queryKeys.documents.lists() });
      qc.invalidateQueries({
        queryKey: queryKeys.documents.uploadSession({ collection, id: session.id }),
      });
      if (session.status === "canceled") {
        toast.info("Upload session canceled");
        return;
      }
      const missing = Math.max(0, session.total_files - session.uploaded_files);
      const unsuccessful = session.failed_files + session.canceled_files + missing;
      if (unsuccessful) {
        toast.warning(`${unsuccessful} file${unsuccessful === 1 ? " needs" : "s need"} attention`);
      } else {
        toast.success(
          `Accepted ${session.uploaded_files} file${session.uploaded_files === 1 ? "" : "s"}`,
        );
      }
    },
    onError: (error) => {
      if (isCurrentSession(qc)) errorToast("Upload session failed")(error);
    },
  });
};

export const useCancelUploadSession = (collection: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.post<{ status: string; message: string }>(
        `v1/collections/${encodeURIComponent(collection)}/upload-sessions/${sessionId}/cancel`,
      ),
    onSuccess: (_res, sessionId) => {
      qc.invalidateQueries({
        queryKey: queryKeys.documents.uploadSession({ collection, id: sessionId }),
      });
      qc.invalidateQueries({ queryKey: queryKeys.documents.lists() });
      toast.success("Upload session canceled");
    },
    onError: errorToast("Cancel failed"),
  });
};

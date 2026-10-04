import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useUploadSessionStore } from "@/features/collections/upload-session-store";
import { getSessionState, isCurrentSession } from "@/lib/session-state";

export const useActiveUploadSession = (collection: string) => {
  const client = useQueryClient();
  const ownerId = useUploadSessionStore((state) => state.ownerId);
  const storedId = useUploadSessionStore((state) => state.activeSessionIds[collection] ?? null);
  const activeSessionId =
    isCurrentSession(client) && ownerId && ownerId === getSessionState().ownerId ? storedId : null;
  const setActiveSessionId = useCallback(
    (name: string, sessionId: string) => {
      if (!isCurrentSession(client)) return;
      useUploadSessionStore.getState().setActiveSessionId(name, sessionId);
    },
    [client],
  );
  const clearActiveSessionId = useCallback(
    (name: string) => {
      if (!isCurrentSession(client)) return;
      useUploadSessionStore.getState().clearActiveSessionId(name, activeSessionId);
    },
    [activeSessionId, client],
  );
  return { activeSessionId, clearActiveSessionId, setActiveSessionId };
};

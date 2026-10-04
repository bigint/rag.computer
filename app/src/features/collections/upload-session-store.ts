import { create } from "zustand";
import { type PersistStorage, persist, type StorageValue } from "zustand/middleware";

type UploadSessionStoreState = {
  ownerId: string | null;
  activeSessionIds: Record<string, string>;
  setOwner: (ownerId: string | null) => void;
  clearActiveSessionId: (collection: string, sessionId: string | null) => void;
  setActiveSessionId: (collection: string, sessionId: string) => void;
};

type PersistedUploadSessionState = Pick<UploadSessionStoreState, "ownerId" | "activeSessionIds">;

const STORAGE_KEY = "bigrag:upload-sessions";

const getLocalStorage = () => {
  if (typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage;
};

const uploadSessionStorage: PersistStorage<PersistedUploadSessionState> = {
  getItem: (name) => {
    try {
      const value = getLocalStorage()?.getItem(name);
      return value ? (JSON.parse(value) as StorageValue<PersistedUploadSessionState>) : null;
    } catch {
      return null;
    }
  },
  removeItem: (name) => {
    try {
      getLocalStorage()?.removeItem(name);
    } catch {}
  },
  setItem: (name, value) => {
    try {
      getLocalStorage()?.setItem(name, JSON.stringify(value));
    } catch {}
  },
};

export const useUploadSessionStore = create<UploadSessionStoreState>()(
  persist(
    (set) => ({
      ownerId: null,
      activeSessionIds: {},
      setOwner: (ownerId) =>
        set((state) => ({
          ownerId,
          activeSessionIds: ownerId && ownerId === state.ownerId ? state.activeSessionIds : {},
        })),
      clearActiveSessionId: (collection, sessionId) =>
        set((state) => {
          if (state.activeSessionIds[collection] !== sessionId) return state;
          const activeSessionIds = { ...state.activeSessionIds };
          delete activeSessionIds[collection];
          return { activeSessionIds };
        }),
      setActiveSessionId: (collection, sessionId) =>
        set((state) =>
          state.ownerId
            ? { activeSessionIds: { ...state.activeSessionIds, [collection]: sessionId } }
            : state,
        ),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ ownerId: state.ownerId, activeSessionIds: state.activeSessionIds }),
      migrate: () => ({ ownerId: null, activeSessionIds: {} }),
      storage: uploadSessionStorage,
      version: 2,
    },
  ),
);

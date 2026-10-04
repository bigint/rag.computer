import { QueryClientProvider } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { AdminThemeProvider } from "@/features/theme/theme-provider";
import { getSessionState, subscribeSessionState } from "@/lib/session-state";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const { client, generation } = useSyncExternalStore(subscribeSessionState, getSessionState);

  return (
    <AdminThemeProvider>
      <QueryClientProvider key={generation} client={client}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-card)",
              color: "var(--color-foreground)",
              border: "1px solid var(--color-border)",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </QueryClientProvider>
    </AdminThemeProvider>
  );
};

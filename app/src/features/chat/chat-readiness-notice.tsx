import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatReadinessStatus } from "@/hooks/use-chat-readiness";

export const ChatReadinessNotice = ({ readiness }: { readiness: ChatReadinessStatus }) => (
  <div className="flex items-center justify-between gap-3 px-1 pt-2 text-xs text-muted-foreground">
    <span aria-live="polite" role="status">
      {readiness.message}
    </span>
    <Button
      className="h-7 shrink-0 px-2 text-xs"
      disabled={readiness.checking}
      onClick={readiness.refresh}
      variant="ghost"
    >
      <RefreshCcw className="size-3.5" />
      Check again
    </Button>
  </div>
);

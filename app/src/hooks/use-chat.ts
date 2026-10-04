import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshChatCredentials } from "@/hooks/use-chat-readiness";
import { apiClient } from "@/lib/api";
import { errorToast } from "@/lib/mutation-toast";
import { queryKeys } from "@/lib/query-keys";
import { withSessionSignal } from "@/lib/session-request";
import { isCurrentSession } from "@/lib/session-state";

type ChatQuestionSuggestionsResponse = {
  collection: string;
  generated_at: string | null;
  model: string | null;
  questions: string[];
};

export const useChatQuestionSuggestions = (collection: string) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.chat.questions({ collection }),
    queryFn: ({ signal }) =>
      withSessionSignal(
        queryClient,
        (ownedSignal) =>
          apiClient.get<ChatQuestionSuggestionsResponse>("v1/chat/question-suggestions", {
            searchParams: { collection },
            signal: ownedSignal,
          }),
        signal,
      ),
    enabled: Boolean(collection),
  });
};

export const useGenerateChatQuestions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { collection: string; model?: string; temperature?: number }) =>
      withSessionSignal(queryClient, (signal) =>
        apiClient.post<ChatQuestionSuggestionsResponse>("v1/chat/question-suggestions", body, {
          signal,
        }),
      ),
    onSuccess: (response) => {
      if (!isCurrentSession(queryClient)) return;
      queryClient.setQueryData(
        queryKeys.chat.questions({ collection: response.collection }),
        response,
      );
    },
    onError: (error) => {
      if (
        !isCurrentSession(queryClient) ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      void refreshChatCredentials(queryClient);
      errorToast("Failed to generate questions")(error);
    },
  });
};

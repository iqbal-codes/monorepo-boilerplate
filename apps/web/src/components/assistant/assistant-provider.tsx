"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  CompositeAttachmentAdapter,
  RuntimeAdapterProvider,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  Suggestions,
  Tools,
  useAui,
  useRemoteThreadListRuntime,
  type AttachmentAdapter,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import {
  AssistantModal,
  type AssistantModelOption,
} from "@monorepo-boilerplate/ui/components/assistant";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "@ai-sdk/react";
import { createAssistantStream } from "assistant-stream";

import { registerAssistantNavigate } from "@/lib/assistant-navigation";
import { serverUrl } from "@/lib/server-url";
import { trpcClient } from "@/utils/trpc";

import toolkit from "./toolkit";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

class PdfAttachmentAdapter implements AttachmentAdapter {
  public accept = "application/pdf";

  async add({ file }: { file: File }) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachment exceeds the 5 MB limit.");
    }
    return {
      id: crypto.randomUUID(),
      type: "document" as const,
      name: file.name,
      contentType: file.type || "application/pdf",
      file,
      status: { type: "requires-action" as const, reason: "composer-send" as const },
    };
  }

  async send(attachment: Parameters<AttachmentAdapter["send"]>[0]) {
    const dataUrl = await readFileAsDataUrl(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" as const },
      content: [
        {
          type: "file" as const,
          mimeType: attachment.contentType ?? "application/pdf",
          filename: attachment.name,
          data: dataUrl,
        },
      ],
    };
  }

  async remove() {}
}

function withAttachmentSizeLimit(inner: AttachmentAdapter): AttachmentAdapter {
  return {
    accept: inner.accept,
    add(state) {
      if (state.file.size > MAX_ATTACHMENT_BYTES) {
        return Promise.reject(new Error("Attachment exceeds the 5 MB limit."));
      }
      return inner.add(state);
    },
    send: (attachment) => inner.send(attachment),
    remove: (attachment) => inner.remove(attachment),
  };
}

function createAssistantAttachmentAdapter(): AttachmentAdapter {
  return new CompositeAttachmentAdapter([
    withAttachmentSizeLimit(new SimpleImageAttachmentAdapter()),
    withAttachmentSizeLimit(new SimpleTextAttachmentAdapter()),
    new PdfAttachmentAdapter(),
  ]);
}

function useAssistantThreadHistoryAdapter(): ThreadHistoryAdapter {
  const aui = useAui();

  return useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return { headId: null, messages: [] };
      },
      async append() {},
      withFormat: (fmt) => ({
        async load() {
          const item = aui.threadListItem;
          if (!item.source) return { messages: [] };
          const { remoteId } = item.getState();
          if (!remoteId) return { messages: [] };

          const rows = await trpcClient.assistant.listMessages.query({ threadId: remoteId });
          return {
            messages: rows
              .filter((row) => row.format === fmt.format)
              .map((row) =>
                fmt.decode({
                  id: row.id,
                  parent_id: row.parentId,
                  format: row.format,
                  content: row.content as never,
                }),
              ),
          };
        },
        async append(entry) {
          const { remoteId } = await aui.threadListItem.initialize();
          const encoded = fmt.encode(entry);
          await trpcClient.assistant.appendMessage.mutate({
            threadId: remoteId,
            id: fmt.getId(entry.message),
            parentId: entry.parentId,
            format: fmt.format,
            content: encoded,
          });
        },
      }),
    }),
    [aui],
  );
}

function AssistantThreadAdaptersProvider({ children }: { children?: ReactNode }) {
  const history = useAssistantThreadHistoryAdapter();
  const adapters = useMemo(() => ({ history }), [history]);
  return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
}

const remoteThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const rows = await trpcClient.assistant.listThreads.query();
    return {
      threads: rows.map((row) => ({
        status: row.status,
        remoteId: row.id,
        externalId: row.externalId ?? undefined,
        title: row.title ?? undefined,
      })),
    };
  },
  async initialize(localId) {
    const row = await trpcClient.assistant.createThread.mutate({ id: localId });
    return {
      remoteId: row.id,
      externalId: row.externalId ?? undefined,
    };
  },
  async rename(remoteId, title) {
    await trpcClient.assistant.renameThread.mutate({ id: remoteId, title });
  },
  async archive(remoteId) {
    await trpcClient.assistant.setThreadStatus.mutate({ id: remoteId, status: "archived" });
  },
  async unarchive(remoteId) {
    await trpcClient.assistant.setThreadStatus.mutate({ id: remoteId, status: "regular" });
  },
  async delete(remoteId) {
    await trpcClient.assistant.deleteThread.mutate({ id: remoteId });
  },
  async fetch(threadId) {
    const row = await trpcClient.assistant.getThread.query({ id: threadId });
    return {
      status: row.status,
      remoteId: row.id,
      externalId: row.externalId ?? undefined,
      title: row.title ?? undefined,
    };
  },
  async generateTitle(remoteId, messages) {
    const compact = messages.slice(0, 4).map((msg) => ({
      role: msg.role,
      text: msg.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join(" "),
    }));

    return createAssistantStream(async (controller) => {
      const response = await fetch(`${serverUrl}/api/chat/title`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: compact }),
      });

      const payload = response.ok ? ((await response.json()) as { title?: string }) : {};
      const title = payload.title?.trim() || "New thread";
      await trpcClient.assistant.renameThread.mutate({ id: remoteId, title }).catch(() => {});
      controller.appendText(title);
    });
  },
  unstable_Provider: AssistantThreadAdaptersProvider,
};

const STARTER_SUGGESTIONS = [
  {
    title: "Inspect current screen",
    label: "Check which route is active",
    prompt: "Which screen am I currently viewing?",
  },
  {
    title: "Check runtime info",
    label: "Read server time and account role",
    prompt: "Show my runtime info and current server time.",
  },
  {
    title: "Open Customers",
    label: "Navigate to the Customers list",
    prompt: "Take me to the Customers screen.",
  },
];

type ModelsEndpointPayload = {
  defaultModelId: string;
  models: AssistantModelOption[];
};

const assistantConfig = AuiConfig({
  tools: Tools({ toolkit }),
  suggestions: Suggestions(STARTER_SUGGESTIONS),
});

function isToolInvocationPart(
  part: UIMessage["parts"][number],
): part is Extract<
  UIMessage["parts"][number],
  { state: string; providerExecuted?: boolean; preliminary?: boolean }
> {
  return (part.type === "dynamic-tool" || part.type.startsWith("tool-")) && "state" in part;
}

function isAssistantMessageCompleteWithToolCalls({ messages }: { messages: UIMessage[] }): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== "assistant") return false;

  const lastStepStartIndex = message.parts.reduce(
    (lastIndex, part, index) => (part.type === "step-start" ? index : lastIndex),
    -1,
  );
  const lastStepParts = message.parts.slice(lastStepStartIndex + 1);
  const toolInvocations = lastStepParts
    .filter(isToolInvocationPart)
    .filter((part) => !part.providerExecuted);
  const lastToolIndex = lastStepParts.reduce(
    (lastIndex, part, index) =>
      isToolInvocationPart(part) && !part.providerExecuted ? index : lastIndex,
    -1,
  );

  return (
    toolInvocations.length > 0 &&
    !lastStepParts
      .slice(lastToolIndex + 1)
      .some((part) => part.type === "text" && "state" in part && part.state !== "done") &&
    toolInvocations.every(
      (part) =>
        (part.state === "output-available" && part.preliminary !== true) ||
        part.state === "output-error",
    )
  );
}

function usePerThreadChatRuntime() {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${serverUrl}/api/chat`,
        credentials: "include",
      }),
    [],
  );
  const attachments = useMemo(() => createAssistantAttachmentAdapter(), []);

  return useChatRuntime({
    transport,
    adapters: { attachments },
    sendAutomaticallyWhen: isAssistantMessageCompleteWithToolCalls,
  });
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    return registerAssistantNavigate((to) => navigate({ to }));
  }, [navigate]);

  const { data: modelConfig } = useQuery({
    queryKey: ["assistant", "models"],
    queryFn: async (): Promise<ModelsEndpointPayload> => {
      const res = await fetch(`${serverUrl}/api/chat/models`, {
        credentials: "include",
      });
      if (!res.ok) {
        return { defaultModelId: "", models: [] };
      }
      return (await res.json()) as ModelsEndpointPayload;
    },
    staleTime: 5 * 60 * 1000,
  });

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: usePerThreadChatRuntime,
    adapter: remoteThreadListAdapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={assistantConfig}>
      {children}
      <AssistantModal
        models={modelConfig?.models ?? []}
        defaultModelId={modelConfig?.defaultModelId}
      />
    </AssistantRuntimeProvider>
  );
}

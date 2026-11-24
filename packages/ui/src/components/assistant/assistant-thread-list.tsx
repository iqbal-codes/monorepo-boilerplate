"use client";

import { useState } from "react";
import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";

import { TooltipIconButton } from "./tooltip-icon-button";

function ThreadListRow({
  searchQuery,
  onSelectThread,
}: {
  searchQuery: string;
  onSelectThread: () => void;
}) {
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title);
  const threadId = useAuiState((s) => s.threadListItem.id);
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const normalizedTitle = (title ?? "New thread").trim();
  if (
    searchQuery.trim().length > 0 &&
    !normalizedTitle.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ) {
    return null;
  }

  const isSelected = mainThreadId === threadId;

  const commitRename = async () => {
    const trimmed = draftTitle.trim();
    setRenaming(false);
    if (trimmed && trimmed !== title) {
      await aui.threads.item({ id: threadId }).rename(trimmed);
    }
  };

  return (
    <ThreadListItemPrimitive.Root
      data-selected={isSelected ? "" : undefined}
      className="group/item flex min-w-0 items-center gap-1 border border-transparent px-2 py-1.5 transition-colors hover:bg-muted/60 data-selected:border-border data-selected:bg-muted"
    >
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            void commitRename();
          }}
        >
          <Input
            aria-label="Thread title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setRenaming(false);
                setDraftTitle(title ?? "");
              }
            }}
            autoFocus
            className="h-7 border-border px-1.5 text-base sm:text-xs"
          />
        </form>
      ) : (
        <ThreadListItemPrimitive.Trigger
          onClick={onSelectThread}
          className="min-w-0 flex-1 truncate py-1 text-start text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <ThreadListItemPrimitive.Title fallback="New thread" />
        </ThreadListItemPrimitive.Trigger>
      )}

      <ThreadListItemMorePrimitive.Root sharedFocusGroup>
        <ThreadListItemMorePrimitive.Trigger asChild>
          <TooltipIconButton tooltip="Thread actions" className="size-7 shrink-0">
            <MoreHorizontalIcon aria-hidden="true" className="size-3.5" />
          </TooltipIconButton>
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content
          align="end"
          sideOffset={4}
          className="z-50 flex min-w-36 flex-col border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md"
        >
          <ThreadListItemMorePrimitive.Item
            onSelect={() => {
              setDraftTitle(title ?? "");
              setRenaming(true);
            }}
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted focus:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <PencilIcon aria-hidden="true" className="size-3.5" />
            <span>Rename</span>
          </ThreadListItemMorePrimitive.Item>
          <ThreadListItemPrimitive.Archive asChild>
            <ThreadListItemMorePrimitive.Item className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted focus:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
              <ArchiveIcon aria-hidden="true" className="size-3.5" />
              <span>Archive</span>
            </ThreadListItemMorePrimitive.Item>
          </ThreadListItemPrimitive.Archive>
          <ThreadListItemMorePrimitive.Separator className="my-1 h-px bg-border" />
          <ThreadListItemMorePrimitive.Item
            onSelect={() => setConfirmDeleteOpen(true)}
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <Trash2Icon aria-hidden="true" className="size-3.5" />
            <span>Delete</span>
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete "${normalizedTitle}"?`}
        description="This permanently deletes this Assistant Thread and all of its messages. This action cannot be undone."
        confirmLabel="Delete thread"
        pendingLabel="Deleting…"
        pending={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await aui.threads.item({ id: threadId }).delete();
            setConfirmDeleteOpen(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </ThreadListItemPrimitive.Root>
  );
}

export function AssistantThreadList({ onSelectThread }: { onSelectThread: () => void }) {
  const [search, setSearch] = useState("");
  const isLoading = useAuiState((s) => s.threads.isLoading);
  const threadCount = useAuiState((s) => s.threads.threadIds.length);

  return (
    <ThreadListPrimitive.Root className="flex h-full min-h-0 flex-col bg-popover text-popover-foreground">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search assistant threads"
            placeholder="Search threads…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 border border-border bg-background ps-7 pe-2 text-base sm:text-xs"
          />
        </div>
        <ThreadListPrimitive.New asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label="Start new thread"
            onClick={onSelectThread}
            className="shrink-0"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" className="size-3.5" />
            New
          </Button>
        </ThreadListPrimitive.New>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-8 w-full rounded-none" />
            <Skeleton className="h-8 w-full rounded-none" />
            <Skeleton className="h-8 w-3/4 rounded-none" />
          </div>
        ) : threadCount === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">No saved threads yet</p>
              <p className="text-xs text-muted-foreground">
                Start a conversation and it will appear here.
              </p>
            </div>
            <ThreadListPrimitive.New asChild>
              <Button type="button" size="xs" onClick={onSelectThread}>
                Start new thread
              </Button>
            </ThreadListPrimitive.New>
          </div>
        ) : (
          <ThreadListPrimitive.Items>
            {() => <ThreadListRow searchQuery={search} onSelectThread={onSelectThread} />}
          </ThreadListPrimitive.Items>
        )}
      </div>
    </ThreadListPrimitive.Root>
  );
}

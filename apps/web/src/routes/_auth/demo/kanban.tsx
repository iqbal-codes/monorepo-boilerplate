import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  CalendarIcon,
  CircleIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@monorepo-boilerplate/ui/components/avatar";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { Field, FieldLabel } from "@monorepo-boilerplate/ui/components/field";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import {
  KanbanBoard,
  KanbanCardDescription,
  KanbanCardMeta,
  KanbanCardMoveMenu,
  KanbanCardSurface,
  KanbanCardTitle,
  KanbanColumnHeader,
  applyKanbanMove,
  type KanbanColumnDef,
  type KanbanMoveEvent,
} from "@monorepo-boilerplate/ui/components/kanban";
import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
import { ListToolbar } from "@monorepo-boilerplate/ui/components/list-toolbar";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@monorepo-boilerplate/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@monorepo-boilerplate/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import { formatDate, formatMoney, formatNumber } from "@monorepo-boilerplate/ui/lib/format";

export const Route = createFileRoute("/_auth/demo/kanban")({
  component: KanbanDemo,
  staticData: { pageTitle: "Kanban" },
});

/**
 * DELETABLE DEMO. Exhibits the controlled KanbanBoard block in both
 * CRM pipeline (status-only + Money totals + transition guard) and
 * task management (full reordering + WIP limits + quick add) modes.
 */
type DealStage = "lead" | "qualified" | "proposal" | "negotiation" | "closed_won";

type DealCard = {
  id: string;
  title: string;
  company: string;
  stage: DealStage;
  amountMinor: number;
  currency: "USD";
  ownerInitials: string;
  ownerName: string;
  closeDate: string;
  notes: string;
};

type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
type TaskPriority = "urgent" | "high" | "normal";

type TaskCard = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeInitials: string;
  assigneeName: string;
  dueDate: string;
};

type PreviewMode = "ready" | "loading" | "empty";

const DEAL_COLUMNS: KanbanColumnDef[] = [
  { id: "lead", title: "Lead", description: "Inbound & outbound prospects" },
  { id: "qualified", title: "Qualified", description: "Discovery confirmed" },
  { id: "proposal", title: "Proposal", description: "Pricing delivered" },
  { id: "negotiation", title: "Negotiation", description: "Legal & procurement" },
  { id: "closed_won", title: "Closed Won", description: "Signed agreements" },
];

const INITIAL_DEALS: DealCard[] = [
  {
    id: "deal-1",
    title: "Annual platform renewal",
    company: "Northwind Logistics",
    stage: "lead",
    amountMinor: 4_800_000,
    currency: "USD",
    ownerInitials: "AL",
    ownerName: "Ada Lin",
    closeDate: "2026-12-14",
    notes: "Expansion to three regional depots; awaiting technical security review.",
  },
  {
    id: "deal-2",
    title: "Multi-site seat rollout",
    company: "Kestrel Health",
    stage: "lead",
    amountMinor: 2_650_000,
    currency: "USD",
    ownerInitials: "MR",
    ownerName: "Marcus Reid",
    closeDate: "2026-12-19",
    notes: "Needs SSO integration check before moving to qualification.",
  },
  {
    id: "deal-3",
    title: "Operations portal migration",
    company: "Sora Manufacturing",
    stage: "qualified",
    amountMinor: 6_200_000,
    currency: "USD",
    ownerInitials: "AL",
    ownerName: "Ada Lin",
    closeDate: "2026-12-08",
    notes: "Sponsor aligned on Q1 cutover schedule and data import scope.",
  },
  {
    id: "deal-4",
    title: "Enterprise analytics add-on",
    company: "Halcyon Retail",
    stage: "proposal",
    amountMinor: 3_400_000,
    currency: "USD",
    ownerInitials: "KP",
    ownerName: "Kira Patel",
    closeDate: "2026-12-03",
    notes: "Sent tiered volume schedule; finance follow-up scheduled Tuesday.",
  },
  {
    id: "deal-5",
    title: "Field service workspace",
    company: "Alder Energy",
    stage: "negotiation",
    amountMinor: 9_150_000,
    currency: "USD",
    ownerInitials: "MR",
    ownerName: "Marcus Reid",
    closeDate: "2026-11-30",
    notes: "Redlines complete on MSA; final signature routed to VP Operations.",
  },
  {
    id: "deal-6",
    title: "Core billing integration",
    company: "Vellum Media",
    stage: "closed_won",
    amountMinor: 5_400_000,
    currency: "USD",
    ownerInitials: "KP",
    ownerName: "Kira Patel",
    closeDate: "2026-11-18",
    notes: "Contract countersigned. Onboarding kickoff booked for Monday.",
  },
];

const TASK_COLUMNS: KanbanColumnDef[] = [
  { id: "backlog", title: "Backlog", description: "Scoped for upcoming sprints" },
  { id: "todo", title: "Todo", description: "Ready to pick up" },
  { id: "in_progress", title: "In Progress", description: "Active engineering work", wipLimit: 2 },
  { id: "review", title: "Review", description: "Awaiting peer sign-off" },
  { id: "done", title: "Done", description: "Shipped and verified" },
];

const INITIAL_TASKS: TaskCard[] = [
  {
    id: "task-1",
    title: "Audit CSV export date formatting",
    description: "Ensure all export columns serialize dates as YYYY-MM-DD without timezone drift.",
    status: "backlog",
    priority: "normal",
    assigneeInitials: "AL",
    assigneeName: "Ada Lin",
    dueDate: "2026-12-12",
  },
  {
    id: "task-2",
    title: "Add keyboard shortcut hints to toolbar",
    description: "Show focus shortcut hints next to search without crowding narrow viewports.",
    status: "todo",
    priority: "high",
    assigneeInitials: "KP",
    assigneeName: "Kira Patel",
    dueDate: "2026-12-02",
  },
  {
    id: "task-3",
    title: "Harden webhook retry backoff",
    description: "Cap exponential backoff at 15 minutes and persist dead-letter error codes.",
    status: "in_progress",
    priority: "urgent",
    assigneeInitials: "MR",
    assigneeName: "Marcus Reid",
    dueDate: "2026-11-27",
  },
  {
    id: "task-4",
    title: "Verify avatar upload cleanup job",
    description: "Confirm unattached draft uploads expire cleanly after 24 hours.",
    status: "in_progress",
    priority: "high",
    assigneeInitials: "AL",
    assigneeName: "Ada Lin",
    dueDate: "2026-11-28",
  },
  {
    id: "task-5",
    title: "Publish pagination boundary tests",
    description: "Cover page-size switches when the active page exceeds the new last page.",
    status: "in_progress",
    priority: "normal",
    assigneeInitials: "KP",
    assigneeName: "Kira Patel",
    dueDate: "2026-11-29",
  },
  {
    id: "task-6",
    title: "Document Varlock schema changes",
    description: "Update environment setup notes for newly added storage keys.",
    status: "review",
    priority: "normal",
    assigneeInitials: "MR",
    assigneeName: "Marcus Reid",
    dueDate: "2026-11-26",
  },
  {
    id: "task-7",
    title: "Verify staff invitation expiration",
    description: "Expired single-use grants return a clear recovery message.",
    status: "done",
    priority: "high",
    assigneeInitials: "AL",
    assigneeName: "Ada Lin",
    dueDate: "2026-11-20",
  },
];

const PRIORITY_ITEMS = [
  { label: "All priorities", value: "all" },
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
];

const STAGE_SELECT_ITEMS = DEAL_COLUMNS.map((col) => ({ label: col.title, value: col.id }));
const TASK_STATUS_SELECT_ITEMS = TASK_COLUMNS.map((col) => ({ label: col.title, value: col.id }));

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "urgent") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircleIcon aria-hidden="true" />
        Urgent
      </Badge>
    );
  }
  if (priority === "high") {
    return (
      <Badge variant="default" className="gap-1">
        <ArrowUpIcon aria-hidden="true" />
        High
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CircleIcon aria-hidden="true" />
      Normal
    </Badge>
  );
}

function QuickAddTaskForm({
  columnTitle,
  onAdd,
}: {
  columnTitle: string;
  onAdd: (title: string) => void;
}) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
    setOpen(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      submit();
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        Add task
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={inputId} className="sr-only">
          New task title in {columnTitle}
        </FieldLabel>
        <Input
          id={inputId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Review onboarding checklist"
          className="text-base sm:text-sm"
          autoFocus
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" size="xs">
          Add task
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setTitle("");
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function KanbanDemo() {
  const [activeTab, setActiveTab] = useState<"crm" | "tasks">("crm");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("ready");

  const [deals, setDeals] = useState<DealCard[]>(INITIAL_DEALS);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [pendingDealIds, setPendingDealIds] = useState<ReadonlySet<string>>(() => new Set());

  const [tasks, setTasks] = useState<TaskCard[]>(INITIAL_TASKS);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPriority, setTaskPriority] = useState<string>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskCollapsed, setTaskCollapsed] = useState<ReadonlySet<string>>(() => new Set(["done"]));

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskPriority !== "all" && task.priority !== taskPriority) return false;
      if (!query) return true;
      return (
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query) ||
        task.assigneeName.toLowerCase().includes(query)
      );
    });
  }, [tasks, taskSearch, taskPriority]);

  const openPipelineMinor = useMemo(
    () =>
      deals
        .filter((deal) => deal.stage !== "closed_won")
        .reduce((sum, deal) => sum + deal.amountMinor, 0),
    [deals],
  );

  const closedWonMinor = useMemo(
    () =>
      deals
        .filter((deal) => deal.stage === "closed_won")
        .reduce((sum, deal) => sum + deal.amountMinor, 0),
    [deals],
  );

  function canDropDeal(event: KanbanMoveEvent): boolean {
    return !(event.fromColumnId === "lead" && event.toColumnId === "closed_won");
  }

  function handleDealMove(event: KanbanMoveEvent) {
    setDeals((prev) =>
      applyKanbanMove(prev, event, {
        getCardId: (deal) => deal.id,
        getCardColumnId: (deal) => deal.stage,
        setCardColumnId: (deal, colId) => ({ ...deal, stage: colId as DealStage }),
      }),
    );

    const deal = deals.find((item) => item.id === event.cardId);
    const targetCol = DEAL_COLUMNS.find((col) => col.id === event.toColumnId);
    if (deal && targetCol) {
      toast(`Moved "${deal.title}" to ${targetCol.title}.`);
    }
  }

  function handleTaskMove(event: KanbanMoveEvent) {
    setTasks((prev) =>
      applyKanbanMove(prev, event, {
        getCardId: (task) => task.id,
        getCardColumnId: (task) => task.status,
        setCardColumnId: (task, colId) => ({ ...task, status: colId as TaskStatus }),
      }),
    );

    if (event.fromColumnId !== event.toColumnId) {
      const task = tasks.find((item) => item.id === event.cardId);
      const targetCol = TASK_COLUMNS.find((col) => col.id === event.toColumnId);
      if (task && targetCol) {
        toast(`Moved "${task.title}" to ${targetCol.title}.`);
      }
    }
  }

  function handleAddTask(columnId: string, title: string) {
    const newTask: TaskCard = {
      id: `task-${Date.now()}`,
      title,
      description: "Added from the column quick-add footer.",
      status: columnId as TaskStatus,
      priority: "normal",
      assigneeInitials: "AL",
      assigneeName: "Ada Lin",
      dueDate: "2026-12-10",
    };
    setTasks((prev) => [...prev, newTask]);
    toast(`Added "${title}".`);
  }

  function handleSimulatePendingDeal(dealId: string) {
    setPendingDealIds((prev) => new Set(prev).add(dealId));
    window.setTimeout(() => {
      setPendingDealIds((prev) => {
        const next = new Set(prev);
        next.delete(dealId);
        return next;
      });
      toast("Deal synced.");
    }, 1200);
  }

  function handleResetDemo() {
    setDeals(INITIAL_DEALS);
    setTasks(INITIAL_TASKS);
    setTaskSearch("");
    setTaskPriority("all");
    setTaskCollapsed(new Set(["done"]));
    setPreviewMode("ready");
    toast("Demo boards reset.");
  }

  const isLoading = previewMode === "loading";
  const displayedDealColumns = previewMode === "empty" ? [] : DEAL_COLUMNS;
  const displayedTaskColumns = previewMode === "empty" ? [] : TASK_COLUMNS;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Kanban Board"
        description="Controlled Kanban Board block in CRM pipeline and task management modes. Deletable demo."
        actions={
          <>
            <ToggleGroup
              aria-label="Board state preview"
              size="sm"
              value={[previewMode]}
              onValueChange={(next) => {
                const mode = next[0] as PreviewMode | undefined;
                if (mode) setPreviewMode(mode);
              }}
            >
              <ToggleGroupItem value="ready">Ready</ToggleGroupItem>
              <ToggleGroupItem value="loading">Loading</ToggleGroupItem>
              <ToggleGroupItem value="empty">Empty</ToggleGroupItem>
            </ToggleGroup>
            <Button type="button" variant="outline" size="sm" onClick={handleResetDemo}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset board
            </Button>
          </>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "crm" || value === "tasks") setActiveTab(value);
        }}
      >
        <TabsList>
          <TabsTrigger value="crm">CRM pipeline</TabsTrigger>
          <TabsTrigger value="tasks">Task board</TabsTrigger>
        </TabsList>

        <TabsContent value="crm" className="mt-4 flex min-w-0 flex-col gap-6">
          <KpiGrid>
            <KpiCard
              label="Open pipeline"
              value={formatMoney({ minor: openPipelineMinor, currency: "USD" })}
              hint="Leads cannot skip directly to Closed Won"
            />
            <KpiCard
              label="Active deals"
              value={formatNumber(deals.filter((deal) => deal.stage !== "closed_won").length)}
              hint="Status-only columns (within-column reorder off)"
            />
            <KpiCard
              label="Closed won"
              value={formatMoney({ minor: closedWonMinor, currency: "USD" })}
              hint="Currency minor units formatted via formatMoney"
            />
            <KpiCard
              label="Total deals"
              value={formatNumber(deals.length)}
              hint="Select any card to inspect details"
            />
          </KpiGrid>

          <KanbanBoard
            ariaLabel="CRM deal pipeline"
            columns={displayedDealColumns}
            cards={deals}
            isLoading={isLoading}
            loadingColumnCount={5}
            loadingCardsPerColumn={2}
            allowReorder={false}
            pendingCardIds={pendingDealIds}
            getCardId={(deal) => deal.id}
            getCardColumnId={(deal) => deal.stage}
            getCardLabel={(deal) => `${deal.title} — ${deal.company}`}
            canDropCard={(event) => canDropDeal(event)}
            onCardMove={handleDealMove}
            onCardClick={(deal) => setSelectedDealId(deal.id)}
            emptyState={
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No pipeline stages</EmptyTitle>
                  <EmptyDescription>
                    Switch back to Ready mode to preview the five-stage CRM deal board.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" size="sm" onClick={() => setPreviewMode("ready")}>
                    Show pipeline
                  </Button>
                </EmptyContent>
              </Empty>
            }
            renderColumnHeader={({
              column,
              cards: columnDeals,
              count,
              isOverWipLimit,
              toggleCollapse,
            }) => {
              const stageMinor = columnDeals.reduce((sum, deal) => sum + deal.amountMinor, 0);
              return (
                <KanbanColumnHeader
                  title={column.title}
                  description={column.description}
                  count={count}
                  wipLimit={column.wipLimit}
                  isOverWipLimit={isOverWipLimit}
                  onToggleCollapse={toggleCollapse}
                  trailing={
                    <span className="shrink-0 text-xs font-medium text-foreground tabular-nums">
                      {formatMoney({ minor: stageMinor, currency: "USD" })}
                    </span>
                  }
                />
              );
            }}
            renderCard={({
              card: deal,
              isDragging,
              isOverlay,
              isPending,
              availableTargetColumns,
              moveToColumn,
            }) => (
              <KanbanCardSurface
                isDragging={isDragging}
                isOverlay={isOverlay}
                isPending={isPending}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <KanbanCardTitle>{deal.title}</KanbanCardTitle>
                    <p className="truncate text-xs text-muted-foreground">{deal.company}</p>
                  </div>
                  {!isOverlay && (
                    <KanbanCardMoveMenu
                      cardLabel={deal.title}
                      columns={availableTargetColumns}
                      onSelectColumn={moveToColumn}
                      disabled={isPending}
                    />
                  )}
                </div>

                <KanbanCardDescription>{deal.notes}</KanbanCardDescription>

                <KanbanCardMeta className="pt-1">
                  <span className="font-medium text-foreground">
                    {formatMoney({ minor: deal.amountMinor, currency: deal.currency })}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon className="size-3" aria-hidden="true" />
                      {formatDate(deal.closeDate)}
                    </span>
                    <Avatar className="size-6">
                      <AvatarFallback className="text-xs">{deal.ownerInitials}</AvatarFallback>
                    </Avatar>
                  </div>
                </KanbanCardMeta>
              </KanbanCardSurface>
            )}
          />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 flex min-w-0 flex-col gap-4">
          <ListToolbar
            search={{
              label: "Search tasks",
              placeholder: "e.g. webhook retry",
              value: taskSearch,
              onChange: setTaskSearch,
            }}
            resultLabel={`${formatNumber(filteredTasks.length)} of ${formatNumber(tasks.length)} tasks`}
            filters={
              <Select
                items={PRIORITY_ITEMS}
                value={taskPriority}
                onValueChange={(value) => {
                  if (value !== null) setTaskPriority(value);
                }}
              >
                <SelectTrigger className="w-40" aria-label="Filter by priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PRIORITY_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            }
          />

          <KanbanBoard
            ariaLabel="Task management board"
            columns={displayedTaskColumns}
            cards={filteredTasks}
            isLoading={isLoading}
            loadingColumnCount={5}
            loadingCardsPerColumn={2}
            allowReorder
            collapsedColumnIds={taskCollapsed}
            onCollapsedColumnIdsChange={setTaskCollapsed}
            getCardId={(task) => task.id}
            getCardColumnId={(task) => task.status}
            getCardLabel={(task) => task.title}
            onCardMove={handleTaskMove}
            onCardClick={(task) => setSelectedTaskId(task.id)}
            emptyState={
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No task columns</EmptyTitle>
                  <EmptyDescription>
                    Switch back to Ready mode to preview full reordering, WIP limits, and collapsed
                    columns.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" size="sm" onClick={() => setPreviewMode("ready")}>
                    Show tasks
                  </Button>
                </EmptyContent>
              </Empty>
            }
            renderEmptyColumn={(column) =>
              taskSearch || taskPriority !== "all" ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    No matching tasks in {column.title}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setTaskSearch("");
                      setTaskPriority("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  No tasks in {column.title}. Add one below or drop a card here.
                </p>
              )
            }
            renderColumnFooter={({ column }) => (
              <QuickAddTaskForm
                columnTitle={column.title}
                onAdd={(title) => handleAddTask(column.id, title)}
              />
            )}
            renderCard={({
              card: task,
              isDragging,
              isOverlay,
              isPending,
              availableTargetColumns,
              moveToColumn,
            }) => (
              <KanbanCardSurface
                isDragging={isDragging}
                isOverlay={isOverlay}
                isPending={isPending}
              >
                <div className="flex items-start justify-between gap-2">
                  <KanbanCardTitle>{task.title}</KanbanCardTitle>
                  {!isOverlay && (
                    <KanbanCardMoveMenu
                      cardLabel={task.title}
                      columns={availableTargetColumns}
                      onSelectColumn={moveToColumn}
                    />
                  )}
                </div>

                <KanbanCardDescription>{task.description}</KanbanCardDescription>

                <KanbanCardMeta className="pt-1">
                  <PriorityBadge priority={task.priority} />
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon className="size-3" aria-hidden="true" />
                      {formatDate(task.dueDate)}
                    </span>
                    <Avatar className="size-6">
                      <AvatarFallback className="text-xs">{task.assigneeInitials}</AvatarFallback>
                    </Avatar>
                  </div>
                </KanbanCardMeta>
              </KanbanCardSurface>
            )}
          />
        </TabsContent>
      </Tabs>

      <Sheet
        open={selectedDeal !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDealId(null);
        }}
      >
        <SheetContent>
          {selectedDeal && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedDeal.title}</SheetTitle>
                <SheetDescription>{selectedDeal.company}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-8 pb-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Deal value</span>
                    <span className="text-base font-semibold tabular-nums">
                      {formatMoney({
                        minor: selectedDeal.amountMinor,
                        currency: selectedDeal.currency,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Target close</span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatDate(selectedDeal.closeDate)}
                    </span>
                  </div>
                </div>

                <Separator />

                <Field>
                  <FieldLabel htmlFor="deal-stage-select">Stage</FieldLabel>
                  <Select
                    items={STAGE_SELECT_ITEMS}
                    value={selectedDeal.stage}
                    onValueChange={(nextStage) => {
                      if (!nextStage || nextStage === selectedDeal.stage) return;
                      if (selectedDeal.stage === "lead" && nextStage === "closed_won") {
                        toast.error(
                          "Qualify the deal before moving it to Closed Won. Pick Qualified or Proposal first.",
                        );
                        return;
                      }
                      setDeals((prev) =>
                        prev.map((deal) =>
                          deal.id === selectedDeal.id
                            ? { ...deal, stage: nextStage as DealStage }
                            : deal,
                        ),
                      );
                      const targetCol = DEAL_COLUMNS.find((col) => col.id === nextStage);
                      if (targetCol) {
                        toast(`Moved "${selectedDeal.title}" to ${targetCol.title}.`);
                      }
                    }}
                  >
                    <SelectTrigger id="deal-stage-select" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {STAGE_SELECT_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Owner</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-xs">
                        {selectedDeal.ownerInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{selectedDeal.ownerName}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Notes</span>
                  <p className="text-sm leading-relaxed text-foreground">{selectedDeal.notes}</p>
                </div>

                <div className="mt-auto pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSimulatePendingDeal(selectedDeal.id)}
                  >
                    Simulate pending sync
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet
        open={selectedTask !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
      >
        <SheetContent>
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedTask.title}</SheetTitle>
                <SheetDescription>Assigned to {selectedTask.assigneeName}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-8 pb-8">
                <div className="flex items-center justify-between gap-2">
                  <PriorityBadge priority={selectedTask.priority} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Due {formatDate(selectedTask.dueDate)}
                  </span>
                </div>

                <Separator />

                <Field>
                  <FieldLabel htmlFor="task-status-select">Status</FieldLabel>
                  <Select
                    items={TASK_STATUS_SELECT_ITEMS}
                    value={selectedTask.status}
                    onValueChange={(nextStatus) => {
                      if (!nextStatus || nextStatus === selectedTask.status) return;
                      setTasks((prev) =>
                        prev.map((task) =>
                          task.id === selectedTask.id
                            ? { ...task, status: nextStatus as TaskStatus }
                            : task,
                        ),
                      );
                      const targetCol = TASK_COLUMNS.find((col) => col.id === nextStatus);
                      if (targetCol) {
                        toast(`Moved "${selectedTask.title}" to ${targetCol.title}.`);
                      }
                    }}
                  >
                    <SelectTrigger id="task-status-select" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {TASK_STATUS_SELECT_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Description</span>
                  <p className="text-sm leading-relaxed text-foreground">
                    {selectedTask.description}
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

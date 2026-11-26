/**
 * Single source of truth for the Factory issue state machine.
 *
 * Every lifecycle state is a `factory:*` label. Matt Pocock's canonical triage
 * labels (and the old `stage:*` labels) are accepted only as inbound aliases so
 * external tools such as `/to-tickets` keep working; the factory always emits
 * and reconciles its own labels.
 */

export const FACTORY_LABELS = {
  triage: 'factory:triage',
  needsInfo: 'factory:needs-info',
  ready: 'factory:ready',
  inProgress: 'factory:in-progress',
  blocked: 'factory:blocked',
  review: 'factory:review',
  changesRequested: 'factory:changes-requested',
  approved: 'factory:approved',
  done: 'factory:done',
  human: 'factory:human',
  wontfix: 'factory:wontfix',
  hold: 'factory:hold',
  spec: 'factory:spec',
  epic: 'factory:epic',
} as const;

export type FactoryLabel = (typeof FACTORY_LABELS)[keyof typeof FACTORY_LABELS];

/** Mutually exclusive issue states; exactly one should be present on a delivery issue. */
export const LIFECYCLE_LABELS: readonly FactoryLabel[] = [
  FACTORY_LABELS.triage,
  FACTORY_LABELS.needsInfo,
  FACTORY_LABELS.ready,
  FACTORY_LABELS.inProgress,
  FACTORY_LABELS.blocked,
  FACTORY_LABELS.review,
  FACTORY_LABELS.changesRequested,
  FACTORY_LABELS.approved,
  FACTORY_LABELS.done,
  FACTORY_LABELS.human,
  FACTORY_LABELS.wontfix,
  FACTORY_LABELS.hold,
];

/** States where automation must never pick the issue up. */
export const INACTIVE_STATE_LABELS: readonly FactoryLabel[] = [
  FACTORY_LABELS.inProgress,
  FACTORY_LABELS.review,
  FACTORY_LABELS.changesRequested,
  FACTORY_LABELS.approved,
  FACTORY_LABELS.done,
  FACTORY_LABELS.human,
  FACTORY_LABELS.wontfix,
  FACTORY_LABELS.hold,
  FACTORY_LABELS.spec,
  FACTORY_LABELS.epic,
];

/** Inbound-only compatibility. Keys are never emitted by the factory. */
export const LEGACY_LABEL_ALIASES: Record<string, FactoryLabel> = {
  'needs-triage': FACTORY_LABELS.triage,
  'needs-info': FACTORY_LABELS.needsInfo,
  'ready-for-agent': FACTORY_LABELS.ready,
  'ready-for-human': FACTORY_LABELS.human,
  wontfix: FACTORY_LABELS.wontfix,
  blocked: FACTORY_LABELS.blocked,
  hold: FACTORY_LABELS.hold,
  spec: FACTORY_LABELS.spec,
  epic: FACTORY_LABELS.epic,
  'factory:refined': FACTORY_LABELS.ready,
  'stage:implement': FACTORY_LABELS.inProgress,
  'stage:review': FACTORY_LABELS.review,
  'stage:changes-requested': FACTORY_LABELS.changesRequested,
  'stage:approved': FACTORY_LABELS.approved,
};

export interface LabelDef {
  name: FactoryLabel;
  color: string;
  description: string;
}

export const LABEL_DEFS: readonly LabelDef[] = [
  { name: FACTORY_LABELS.triage, color: 'FBCA04', description: 'Raw issue awaiting factory-refine grounding' },
  { name: FACTORY_LABELS.needsInfo, color: 'FBCA04', description: 'Waiting on maintainer clarification before delivery' },
  { name: FACTORY_LABELS.ready, color: '1D76DB', description: 'Ready for the factory (refine if needed, then slice)' },
  { name: FACTORY_LABELS.inProgress, color: 'D4C5F9', description: 'Archon run in progress or paused for this issue' },
  { name: FACTORY_LABELS.blocked, color: 'D93F0B', description: 'Waiting on an open blocker before delivery' },
  { name: FACTORY_LABELS.review, color: 'FBCA04', description: 'Draft PR open; gate and independent QA review' },
  { name: FACTORY_LABELS.changesRequested, color: 'D93F0B', description: 'QA found findings; returned to implementer' },
  { name: FACTORY_LABELS.approved, color: '0E8A16', description: 'All gates and independent QA axes passed' },
  { name: FACTORY_LABELS.done, color: '0E8A16', description: 'Delivered and merged' },
  { name: FACTORY_LABELS.human, color: '5319E7', description: 'Needs human implementation or decision' },
  { name: FACTORY_LABELS.wontfix, color: 'FFFFFF', description: 'Will not be actioned' },
  { name: FACTORY_LABELS.hold, color: 'FFFFFF', description: 'Held by an operator' },
  { name: FACTORY_LABELS.spec, color: 'C5DEF5', description: 'Parent specification; never auto-dispatched' },
  { name: FACTORY_LABELS.epic, color: 'C5DEF5', description: 'Multi-slice epic tracker; never auto-dispatched' },
];

export function canonicalLabel(label: string): string {
  return LEGACY_LABEL_ALIASES[label] ?? label;
}

/** Normalizes inbound labels and drops duplicates, preserving first-seen order. */
export function canonicalLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map(canonicalLabel))];
}

export function isLifecycleLabel(label: string): boolean {
  return (LIFECYCLE_LABELS as readonly string[]).includes(label);
}

/** True when any label is (or aliases) the target factory label. */
export function hasLabel(labels: readonly string[], target: string): boolean {
  return labels.some((label) => canonicalLabel(label) === target);
}

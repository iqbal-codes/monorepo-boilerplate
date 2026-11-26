/**
 * Shared GitHub CLI helpers for the Archon Factory workflow pack.
 * Pure TypeScript + Bun/Node built-ins only; gracefully no-ops when `repo` is empty.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd, text } from './contract.ts';
import {
  LABEL_DEFS,
  LEGACY_LABEL_ALIASES,
  LIFECYCLE_LABELS,
  type FactoryLabel,
} from './labels.ts';

const ensuredRepos = new Set<string>();

/** Creates/updates every factory lifecycle label once per repo. */
export function ensureFactoryLabels(repo: string): void {
  if (!repo || ensuredRepos.has(repo)) return;
  const listRes = runCmd(
    ['gh', 'label', 'list', '--repo', repo, '--limit', '100', '--json', 'name'],
    { allowFail: true }
  );
  if (listRes.code !== 0) return;

  let existing = new Set<string>();
  try {
    const parsed = JSON.parse(listRes.stdout) as { name: string }[];
    existing = new Set(parsed.map((l) => l.name));
  } catch {
    return;
  }

  for (const def of LABEL_DEFS) {
    if (!existing.has(def.name)) {
      runCmd(
        ['gh', 'label', 'create', def.name, '--repo', repo, '--color', def.color, '--description', def.description],
        { allowFail: true }
      );
    }
  }
  ensuredRepos.add(repo);
}

/** Labels removed whenever a new lifecycle state is applied (factory + inbound aliases). */
const REMOVABLE_STATE_LABELS: readonly string[] = [
  ...LIFECYCLE_LABELS,
  ...Object.keys(LEGACY_LABEL_ALIASES),
];

function syncItemStateLabels(
  repo: string,
  kind: 'issue' | 'pr',
  itemNumber: number,
  target: FactoryLabel
): void {
  if (!repo || itemNumber <= 0) return;
  const viewRes = runCmd(
    ['gh', kind, 'view', String(itemNumber), '--repo', repo, '--json', 'labels'],
    { allowFail: true }
  );
  if (viewRes.code !== 0) return;

  let current = new Set<string>();
  try {
    const parsed = JSON.parse(viewRes.stdout) as { labels?: { name: string }[] };
    current = new Set((parsed.labels ?? []).map((l) => l.name));
  } catch {
    return;
  }

  const args = ['gh', kind, 'edit', String(itemNumber), '--repo', repo];
  let changed = false;
  for (const label of REMOVABLE_STATE_LABELS) {
    if (label !== target && current.has(label)) {
      args.push('--remove-label', label);
      changed = true;
    }
  }
  if (!current.has(target)) {
    args.push('--add-label', target);
    changed = true;
  }

  if (changed) {
    runCmd(args, { allowFail: true });
  }
}

/** Moves an issue and/or PR into exactly one factory lifecycle state. */
export function setFactoryState(
  repo: string,
  targets: { issueNumber?: number; prNumber?: number },
  target: FactoryLabel
): void {
  if (!repo) return;
  ensureFactoryLabels(repo);
  if (targets.issueNumber && targets.issueNumber > 0) {
    syncItemStateLabels(repo, 'issue', targets.issueNumber, target);
  }
  if (targets.prNumber && targets.prNumber > 0) {
    syncItemStateLabels(repo, 'pr', targets.prNumber, target);
  }
}

export function findOpenPr(
  repo: string,
  branchName: string
): { number: number; url: string; isDraft: boolean } | null {
  if (!repo || !branchName) return null;
  const res = runCmd(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      repo,
      '--head',
      branchName,
      '--state',
      'open',
      '--json',
      'number,url,isDraft',
    ],
    { allowFail: true }
  );
  if (res.code !== 0 || !res.stdout) return null;
  try {
    const parsed = JSON.parse(res.stdout) as { number: number; url: string; isDraft?: boolean }[];
    if (parsed.length === 0) return null;
    return {
      number: parsed[0].number,
      url: parsed[0].url,
      isDraft: Boolean(parsed[0].isDraft),
    };
  } catch {
    return null;
  }
}

function postGithubComment(
  repo: string,
  kind: 'pr' | 'issue',
  itemNumber: number,
  body: string,
  artifactsDir: string
): boolean {
  if (!repo || itemNumber <= 0 || !text(body)) return false;
  mkdirSync(artifactsDir, { recursive: true });
  const commentPath = join(artifactsDir, `last-${kind}-comment.md`);
  writeFileSync(commentPath, body, 'utf8');
  const res = runCmd(
    ['gh', kind, 'comment', String(itemNumber), '--repo', repo, '--body-file', commentPath],
    { allowFail: true }
  );
  return res.code === 0;
}

export function postPrComment(
  repo: string,
  prNumber: number,
  body: string,
  artifactsDir: string
): boolean {
  return postGithubComment(repo, 'pr', prNumber, body, artifactsDir);
}

export function postIssueComment(
  repo: string,
  issueNumber: number,
  body: string,
  artifactsDir: string
): boolean {
  return postGithubComment(repo, 'issue', issueNumber, body, artifactsDir);
}

export function syncBranchChanges(opts: {
  commitMessage: string;
  baseSha: string;
  branchName: string;
}): { headSha: string; shortSha: string; diffStat: string } {
  const status = runCmd(['git', 'status', '--porcelain'], { allowFail: true }).stdout;
  if (status) {
    runCmd(['git', 'add', '-A']);
    // Avoid failing if `git add -A` only touched ignored files
    const staged = runCmd(['git', 'diff', '--cached', '--name-only'], { allowFail: true }).stdout;
    if (staged) {
      runCmd(['git', 'commit', '-m', opts.commitMessage]);
    }
  }

  const headSha = runCmd(['git', 'rev-parse', 'HEAD']).stdout;
  const shortSha = headSha.slice(0, 7);

  let diffStat = opts.baseSha
    ? runCmd(['git', 'diff', '--stat', `${opts.baseSha}..HEAD`], { allowFail: true }).stdout
    : '';
  if (!diffStat) {
    diffStat = runCmd(['git', 'show', '--stat', '--format=', 'HEAD'], { allowFail: true }).stdout;
  }

  runCmd(['git', 'push', '-u', 'origin', `HEAD:refs/heads/${opts.branchName}`]);
  return { headSha, shortSha, diffStat };
}

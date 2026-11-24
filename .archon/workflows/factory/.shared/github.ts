/**
 * Shared GitHub CLI helpers for the Archon Factory workflow pack.
 * Pure TypeScript + Bun/Node built-ins only; gracefully no-ops when `repo` is empty.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd, text } from './contract.ts';

export type StageName =
  | 'stage:implement'
  | 'stage:review'
  | 'stage:changes-requested'
  | 'stage:approved';

const STAGE_DEFS: Record<StageName, { color: string; description: string }> = {
  'stage:implement': {
    color: '1D76DB',
    description: 'Currently being implemented or fixed by implementer',
  },
  'stage:review': {
    color: 'FBCA04',
    description: 'Draft PR updated; undergoing Mechanical Gate & Independent QA review',
  },
  'stage:changes-requested': {
    color: 'D93F0B',
    description: 'Independent QA review found defects; sent back to implementer',
  },
  'stage:approved': {
    color: '0E8A16',
    description: 'All gates & Independent QA axes LGTM',
  },
};

const ALL_STAGES = Object.keys(STAGE_DEFS) as StageName[];
const ensuredRepos = new Set<string>();

export function ensureStageLabels(repo: string): void {
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

  for (const stage of ALL_STAGES) {
    if (!existing.has(stage)) {
      const def = STAGE_DEFS[stage];
      runCmd(
        ['gh', 'label', 'create', stage, '--repo', repo, '--color', def.color, '--description', def.description],
        { allowFail: true }
      );
    }
  }
  ensuredRepos.add(repo);
}

function syncItemStageLabels(
  repo: string,
  kind: 'issue' | 'pr',
  itemNumber: number,
  targetStage: StageName
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
  for (const stage of ALL_STAGES) {
    if (stage !== targetStage && current.has(stage)) {
      args.push('--remove-label', stage);
      changed = true;
    }
  }
  if (!current.has(targetStage)) {
    args.push('--add-label', targetStage);
    changed = true;
  }

  if (changed) {
    runCmd(args, { allowFail: true });
  }
}

export function setStageLabel(
  repo: string,
  targets: { issueNumber?: number; prNumber?: number },
  targetStage: StageName
): void {
  if (!repo) return;
  ensureStageLabels(repo);
  if (targets.issueNumber && targets.issueNumber > 0) {
    syncItemStageLabels(repo, 'issue', targets.issueNumber, targetStage);
  }
  if (targets.prNumber && targets.prNumber > 0) {
    syncItemStageLabels(repo, 'pr', targets.prNumber, targetStage);
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

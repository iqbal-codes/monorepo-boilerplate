import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runCmd } from '../../.shared/contract.ts';
import { commitPrAcknowledgement, prPollRoot, processedKeys, redactExcerpt, type PrSignal } from '../../.shared/pr-evidence.ts';

type Pull = {
  number: number; state: string; updated_at: string; merged_at: string | null; closed_at: string | null;
  head: { ref: string; sha: string };
};
type Review = {
  id: number; state: string; body: string | null; submitted_at: string;
  author_association: string; user: { type: string; login: string } | null;
};

const checkout = resolve(process.argv[2] || '.');
const origin = runCmd(['git', 'remote', 'get-url', 'origin'], { cwd: checkout }).stdout;
const match = origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
if (!match) throw new Error('Factory Learn requires a GitHub origin.');
const repo = match[1].toLowerCase();
const cwd = { cwd: checkout };
function github<T>(endpoint: string): T {
  return JSON.parse(runCmd(['gh', 'api', '--hostname', 'github.com', endpoint], cwd).stdout) as T;
}
const identity = github<{ id: number; full_name: string }>(`repos/${repo}`);
if (!Number.isSafeInteger(identity.id) || identity.full_name.toLowerCase() !== repo) throw new Error('GitHub repository identity mismatch.');
const directory = join(prPollRoot, String(identity.id));
mkdirSync(directory, { recursive: true, mode: 0o700 });

// Hold a host-local lock for the entire foreground workflow. The wrapper exits
// without recording evidence if a peer owns the lock or this run fails.
if (process.argv[3] !== String(identity.id)) {
  const result = Bun.spawnSync(['flock', '-n', '-E', '75', join(directory, 'poll.lock'), process.execPath, import.meta.path, checkout, String(identity.id)], {
    cwd: checkout, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit',
  });
  if (result.exitCode === 75) console.log('Factory Learn: another poll is active.');
  else process.exitCode = result.exitCode ?? 1;
} else {
  poll();
}

function poll(): void {
  const ledger = join(directory, 'processed.json');
  const seen = processedKeys(ledger);
  const cutoff = Date.now() - 30 * 86400_000;
  const pulls = new Map<number, Pull>();
  for (let page = 1; ; page++) {
    const rows = github<Pull[]>(`repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Unexpected pull request response.');
    for (const row of rows) if (Date.parse(row.updated_at) >= cutoff) pulls.set(row.number, row);
    if (rows.length < 100 || Date.parse(rows.at(-1)!.updated_at) < cutoff) break;
  }
  // An old open PR can receive an edited review without becoming recently updated.
  for (let page = 1; ; page++) {
    const rows = github<Pull[]>(`repos/${repo}/pulls?state=open&sort=created&direction=asc&per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Unexpected open pull request response.');
    for (const row of rows) pulls.set(row.number, row);
    if (rows.length < 100) break;
  }
  const signals: PrSignal[] = [];
  for (const pull of pulls.values()) {
    if (pull.head.ref.startsWith('factory-learn/')) continue;
    const add = (signal: Omit<PrSignal, 'key'>, version: string) => {
      const key = createHash('sha256').update(JSON.stringify([identity.id, signal.pr, signal.kind, version])).digest('hex');
      if (!seen.has(key)) signals.push({ ...signal, key });
    };
    if (pull.closed_at && Date.parse(pull.closed_at) >= cutoff) {
      const kind = pull.merged_at ? 'merged' : 'closed';
      add({ pr: pull.number, kind, at: pull.merged_at ?? pull.closed_at, head: pull.head.sha }, pull.merged_at ?? pull.closed_at);
    }
    for (let page = 1; ; page++) {
      const rows = github<Review[]>(`repos/${repo}/pulls/${pull.number}/reviews?per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('Unexpected PR review response.');
      for (const review of rows) {
        if (review.state !== 'CHANGES_REQUESTED' || review.user?.type !== 'User' || /\[bot\]$/i.test(review.user.login) || !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(review.author_association)) continue;
        const body = (review.body ?? '').normalize().replace(/\s+/g, ' ').trim();
        add({ pr: pull.number, kind: 'changes-requested', at: review.submitted_at, head: pull.head.sha, review_id: review.id, excerpt: redactExcerpt(review.body) }, JSON.stringify([review.id, body]));
      }
      if (rows.length < 100) break;
    }
  }
  if (signals.length === 0) {
    console.log('Factory Learn: no unseen PR evidence; skipped.');
    return;
  }
  const batch = signals.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key)).slice(0, 60);
  const temp = mkdtempSync(join(directory, 'snapshot-'));
  try {
    const path = join(temp, 'batch.json');
    const snapshot = { repo, repo_id: identity.id, signals: batch };
    writeFileSync(path, JSON.stringify(snapshot), { mode: 0o600 });
    console.log(`Factory Learn: ${batch.length} unseen signals across ${new Set(batch.map((item) => item.pr)).size} PR(s).`);
    const run = Bun.spawnSync(['archon', 'workflow', 'run', 'factory-learn', '--cwd', checkout, '--input', 'mode=proposal', '--input', `pr_snapshot=${path}`], {
      cwd: checkout, stdout: 'inherit', stderr: 'inherit', stdin: 'ignore',
    });
    if (run.exitCode !== 0) throw new Error('Factory Learn failed; the PR snapshot remains pending.');
    commitPrAcknowledgement(path, snapshot);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

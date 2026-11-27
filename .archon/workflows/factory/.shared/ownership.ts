import { runCmd } from './contract.ts';

const policyPath = '.archon/sdlc/policy/protected-paths.json';
const protectedByDefault = ['.github/', '.archon/workflows/', '.archon/sdlc/policy/', '.archon/config.yaml'];

export function parseAllowedFolders(value: unknown): string[] {
  const folders: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(folders)) throw new Error('allowed_folders must be a JSON array.');
  const result = new Set<string>();
  for (const folder of folders) {
    if (typeof folder !== 'string' || !isRepoRelative(folder, true) || !folder.endsWith('/')) {
      throw new Error('Allowed folders must be literal repository-relative directories ending in / (e.g. apps/web/src/orders/).');
    }
    result.add(folder);
  }
  return [...result];
}

export type DeliveryClaim =
  | { kind: 'normal' | 'exclusive' }
  | { kind: 'reserved'; folders: readonly string[] };

export function parseDeliveryClaim(foldersInput: unknown = [], exclusiveInput: unknown = false): DeliveryClaim {
  const folders = parseAllowedFolders(foldersInput);
  if (exclusiveInput !== true && exclusiveInput !== 'true' && exclusiveInput !== false && exclusiveInput !== 'false') {
    throw new Error('exclusive must be true or false.');
  }
  if (exclusiveInput === true || exclusiveInput === 'true') {
    if (folders.length > 0) throw new Error('Exclusive delivery cannot also specify Allowed Folders.');
    return { kind: 'exclusive' };
  }
  return folders.length > 0 ? { kind: 'reserved', folders } : { kind: 'normal' };
}

export function deliveryClaimsConflict(a: DeliveryClaim, b: DeliveryClaim): boolean {
  if (a.kind === 'exclusive' || b.kind === 'exclusive') return true;
  if (a.kind !== 'reserved' || b.kind !== 'reserved') return a.kind !== b.kind;
  return a.folders.some((left) => b.folders.some((right) => left.startsWith(right) || right.startsWith(left)));
}

function isRepoRelative(path: string, literal: boolean): boolean {
  if (path !== path.trim() || /[\\:\x00-\x1f\x7f]/.test(path) || (literal && /[*?\[\]{}]/.test(path))) return false;
  return path.replace(/\/$/, '').split('/').every((part) =>
    part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git'
  );
}

type DeliveryRun = { id: string; workflow_name: string; user_message?: string; metadata?: { inputs?: Record<string, unknown> } };

export function isDeliveryWorkflow(workflow: string): boolean {
  return workflow === 'factory-slice' || workflow === 'factory-pr-revise';
}

export function activeDeliveryRuns(payload: string): DeliveryRun[] {
  const status: unknown = JSON.parse(payload);
  if (!status || typeof status !== 'object' || !('runs' in status) || !Array.isArray(status.runs)
    || status.runs.length >= 50 || !('scopeFallback' in status) || status.scopeFallback !== false
    || status.runs.some((run) => !run || typeof run.id !== 'string' || typeof run.workflow_name !== 'string')) {
    throw new Error('Cannot read project-scoped active Archon runs. Refusing to check delivery concurrency.');
  }
  return (status.runs as DeliveryRun[]).filter((run) => isDeliveryWorkflow(run.workflow_name));
}

export function activeDeliveryClaim(run: DeliveryRun): DeliveryClaim {
  try {
    return parseDeliveryClaim(run.metadata?.inputs?.allowed_folders, run.metadata?.inputs?.exclusive);
  } catch {
    return { kind: 'exclusive' }; // Unknown peer inputs must not grant concurrency.
  }
}

function deliveryTarget(run: DeliveryRun, key: 'issue' | 'pr'): number {
  const input = run.metadata?.inputs?.[key];
  if (key === 'issue') return Number.parseInt(String(input ?? '').trim().replace(/^#/, ''), 10) || 0;
  if (run.workflow_name !== 'factory-pr-revise') return 0;
  const source = String(input ?? '').trim() || (run.user_message ?? '');
  return Number(source.match(/#?(\d+)/)?.[1] ?? 0);
}

/** The run must already be visible to every peer before editing. No mutation of shared state. */
export function assertReservation(runId: string, claim: DeliveryClaim): void {
  const runs = activeDeliveryRuns(runCmd(['archon', 'workflow', 'status', '--json']).stdout);
  const own = runs.find((run) => run.id === runId);
  if (!own || JSON.stringify(parseDeliveryClaim(own.metadata?.inputs?.allowed_folders, own.metadata?.inputs?.exclusive)) !== JSON.stringify(claim)) {
    throw new Error('This run and its delivery claim are not visible in project status. Refusing to proceed.');
  }
  const issue = deliveryTarget(own, 'issue');
  const pr = deliveryTarget(own, 'pr');
  const peer = runs.find((run) => run.id !== runId && (
    deliveryClaimsConflict(claim, activeDeliveryClaim(run)) ||
    (issue > 0 && issue === deliveryTarget(run, 'issue')) ||
    (pr > 0 && pr === deliveryTarget(run, 'pr'))
  ));
  if (peer) throw new Error(`Delivery conflicts with run ${peer.id}. Wait for it to finish or use compatible delivery modes and targets.`);
}

export function fetchPolicyBase(branch: string): string {
  runCmd(['git', 'fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
  return runCmd(['git', 'rev-parse', 'FETCH_HEAD']).stdout;
}

/** Read only the base commit; a checkout change cannot grant itself access. */
export function resolveForbiddenPaths(baseSha: string, slicePaths: string[]): string[] {
  const paths = [...protectedByDefault, ...slicePaths];
  const entry = runCmd(['git', 'ls-tree', baseSha, '--', policyPath]).stdout;
  if (!entry) return paths;
  if (!/^100(?:644|755) blob /.test(entry)) throw new Error(`${policyPath} must be a regular committed file.`);
  const policy: unknown = JSON.parse(runCmd(['git', 'show', `${baseSha}:${policyPath}`]).stdout);
  if (!Array.isArray(policy) || !policy.every((path) => typeof path === 'string' && isRepoRelative(path, false))) {
    throw new Error(`${policyPath} must contain a JSON array of repository-relative paths or glob patterns.`);
  }
  return [...new Set(paths.concat(policy))];
}

function gitPaths(args: string[]): string[] {
  const { exitCode, stdout, stderr } = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (exitCode !== 0) throw new Error(`Cannot audit delivery paths: ${stderr.toString().trim()}`);
  return stdout.toString().split('\0').filter(Boolean);
}

export function deliveryPaths(baseSha: string, head = 'HEAD'): string[] {
  return [...new Set([
    ...gitPaths(['diff', '--cached', '--name-only', '--no-renames', '-z', baseSha, '--']),
    ...gitPaths(['diff', '--name-only', '--no-renames', '-z', '--']),
    ...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
    // A reverted protected change still exists in the branch history we would push.
    ...gitPaths(['log', '--format=', '--name-only', '--no-renames', '--diff-merges=first-parent', '-z', `${baseSha}..${head}`, '--']),
  ])];
}

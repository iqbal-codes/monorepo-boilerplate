import { runCmd } from './contract.ts';

const policyPath = '.archon/sdlc/policy/protected-paths.json';
const protectedByDefault = ['.github/', '.archon/workflows/', '.archon/sdlc/policy/', '.archon/config.yaml'];

/** [] reserves the entire repository. Nonempty claims name literal subdirectories. */
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

export function reservationsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((left) => b.some((right) =>
    left.startsWith(right) || right.startsWith(left)
  ));
}

function isRepoRelative(path: string, literal: boolean): boolean {
  if (path !== path.trim() || /[\\:\x00-\x1f\x7f]/.test(path) || (literal && /[*?\[\]{}]/.test(path))) return false;
  return path.replace(/\/$/, '').split('/').every((part) =>
    part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git'
  );
}

type DeliveryRun = { id: string; workflow_name: string; metadata?: { inputs?: Record<string, unknown> } };

export function isDeliveryWorkflow(workflow: string): boolean {
  return workflow === 'factory-slice' || workflow === 'factory-pr-revise';
}

export function activeDeliveryRuns(payload: string): DeliveryRun[] {
  const status: unknown = JSON.parse(payload);
  if (!status || typeof status !== 'object' || !('runs' in status) || !Array.isArray(status.runs)
    || status.runs.length >= 50 || !('scopeFallback' in status) || status.scopeFallback !== false
    || status.runs.some((run) => !run || typeof run.id !== 'string' || typeof run.workflow_name !== 'string')) {
    throw new Error('Cannot read project-scoped active Archon runs. Refusing to choose a folder reservation.');
  }
  return (status.runs as DeliveryRun[]).filter((run) => isDeliveryWorkflow(run.workflow_name));
}

export function activeRunFolders(run: DeliveryRun): string[] {
  try {
    return parseAllowedFolders(run.metadata?.inputs?.allowed_folders ?? []);
  } catch {
    return []; // Unknown peer reservation is exclusive.
  }
}

/** The run must already be visible to every peer before editing. No mutation of shared state. */
export function assertReservation(runId: string, folders: string[]): void {
  const runs = activeDeliveryRuns(runCmd(['archon', 'workflow', 'status', '--json']).stdout);
  const own = runs.find((run) => run.id === runId);
  if (!own || JSON.stringify(activeRunFolders(own)) !== JSON.stringify(folders)) {
    throw new Error('This delivery run and its reservation are not visible in project status. Refusing to proceed.');
  }
  const peer = runs.find((run) => run.id !== runId && reservationsOverlap(folders, activeRunFolders(run)));
  if (peer) throw new Error(`Folder reservation conflicts with run ${peer.id}. Wait for it to finish or restart with disjoint allowed_folders.`);
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

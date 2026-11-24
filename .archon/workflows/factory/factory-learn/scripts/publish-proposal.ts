/**
 * Deterministic Factory Learn publisher (0 LLM tokens).
 *
 * Inputs are read from the environment exactly as the workflow passes them:
 *   INPUTS_REPO, INPUTS_BASE_SHA, INPUTS_EVIDENCE_PATH, INPUTS_DECISION
 *   (no-change|proposal-only|draft), INPUTS_MODE (proposal|draft), INPUTS_ALLOWED_PATHS
 *   (JSON array), INPUTS_TITLE. $ARTIFACTS_DIR holds proposal.md, $STATE_DIR holds the
 *   seen-run ledger.
 *
 * Default behaviour is proposal-only: record the run IDs that were processed and never
 * touch the network. `mode=draft` is an explicit opt-in that, combined with
 * `decision=draft`, may publish the single local harness change as a *draft* pull
 * request on the fixed branch `factory-learn/proposal`.
 *
 * Safety model (no merge path exists at all):
 * - The remote is always the checkout's own GitHub origin. A different origin, or a
 *   finding aimed at the shared pack, is report-only: the publisher never edits another
 *   repository.
 * - Only operator-approved `allowed_paths` patterns intersected with a fixed set of
 *   harness categories may change. Workflows and CI config (any provider), approval and
 *   access files, dependency manifests/lockfiles, Archon bindings/triggers/workflows,
 *   `.git*` control files, and `factory-learn` itself are always refused, so no CI or
 *   gate configuration edit can be smuggled in to bypass verification.
 * - Symlinks, submodules, executable-bit or other mode changes, type changes, unmerged
 *   index entries, and malformed paths are refused.
 * - Publishing requires HEAD to still equal the evidence base exactly, so an agent that
 *   committed, amended, or reset underneath the run blocks the publish. The remote default
 *   branch must also still point at that base.
 * - Publishing requires no open PR on the fixed branch and no existing remote branch, then
 *   pushes create-only (`--force-with-lease=<ref>:` with an empty expected value), so a
 *   proposal is written once and an existing branch or PR is never updated or overwritten.
 * - Strong protection on the remote base branch is required, verified through `gh api`
 *   (required PR review, no force-push, no deletion). Protection the token cannot read stops
 *   the publish: there is no bypass input. Provisioning it is the operator's responsibility,
 *   and the app cannot enforce that guarantee for them.
 * - The actual publish is serialized by a host-scoped lock. The fixed branch name plus
 *   create-only pushes mean a second host loses the race instead of duplicating a branch.
 * - Model text is never shell-evaluated: every command is an argv array (no `sh -c`, no
 *   `eval`), the PR body is passed with `--body-file`, and the commit subject/title are
 *   single-line sanitized strings.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { emit, matchPathPattern, text } from '../../.shared/contract.ts';
import { acknowledgePrSnapshot, readPrSnapshot } from '../../.shared/pr-evidence.ts';

/** Fixed branch. The name is the remote race guard: two hosts collide on push. */
export const LEARN_BRANCH = 'factory-learn/proposal';
/** Commit subject prefix for this publisher's single proposal commit. */
const SUBJECT_PREFIX = 'factory-learn: proposal';
const MAX_PR_BODY_CHARS = 12000;
const MAX_ARTIFACT_BYTES = 4_000_000;
const MAX_SEEN_IDS = 5000;
const LOCK_STALE_MS = 30 * 60 * 1000;
const SEEN_FILE = 'seen.json';
const LOCK_FILE = 'publish.lock';

/**
 * Harness categories a learn draft may ever touch. This is a fixed allowlist; the
 * operator's `allowed_paths` can only narrow it further.
 */
const SAFE_CATEGORY_PATTERNS = [
  'tests/**',
  '**/tests/**',
  'test/**',
  '**/test/**',
  '__tests__/**',
  '**/__tests__/**',
  'spec/**',
  '**/spec/**',
  'scripts/**',
  '**/scripts/**',
  'tools/**',
  '**/tools/**',
  '.archon/checks/**',
  '**/.archon/checks/**',
  '.archon/standards/**',
  '**/.archon/standards/**',
  '.archon/skills/**',
  '**/.archon/skills/**',
  '.archon/commands/**',
  '**/.archon/commands/**',
  'docs/**',
  '**/docs/**',
  '**/*.md',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.mjs',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*_test.go',
];

/**
 * Always-refused paths: workflows/CI (any provider), approval/access, dependency and tool
 * configuration, Archon control-plane config, repository control files, and this workflow.
 */
const PROTECTED_PATTERNS = [
  // CI / workflows, any provider, any depth
  '.github/**',
  '**/.github/**',
  '**/.gitlab-ci.yml',
  '**/.gitlab-ci.yaml',
  '**/.travis.yml',
  '**/.circleci/**',
  '**/Jenkinsfile',
  '**/azure-pipelines*.yml',
  '**/azure-pipelines*.yaml',
  '**/bitbucket-pipelines.yml',
  '**/bitbucket-pipelines.yaml',
  '**/.buildkite/**',
  '**/cloudbuild*.yaml',
  '**/cloudbuild*.yml',
  '**/.drone.yml',
  '**/.drone.yaml',
  '**/appveyor.yml',
  '**/.cirrus.yml',
  // Approval / access / merge automation
  '**/CODEOWNERS',
  '**/OWNERS',
  '**/.mergify.yml',
  '**/.mergify.yaml',
  '**/.mergify/**',
  '**/.renovaterc*',
  '**/renovate.json',
  // Repository control files (diff-hiding / submodule / attribute vectors)
  '**/.gitignore',
  '**/.gitattributes',
  '**/.gitmodules',
  '**/.git/**',
  // Secrets and environment
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/secrets/**',
  '**/.secrets/**',
  // Dependency / build configuration
  '**/package.json',
  '**/package-lock.json',
  '**/bun.lock',
  '**/bun.lockb',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/go.mod',
  '**/go.sum',
  '**/pyproject.toml',
  '**/poetry.lock',
  '**/Cargo.toml',
  '**/Cargo.lock',
  '**/requirements*.txt',
  // Archon control plane
  '**/.archon/workflows/**',
  '**/.archon/bindings/**',
  '**/.archon/triggers/**',
  '**/.archon/plugins/**',
  '**/.archon/config.yaml',
  '**/.archon/config.yml',
  // This workflow and its deterministic nodes
  '**/factory-learn/**',
  '**/publish-proposal.ts',
];

/** Unmerged or type-changing diff statuses: never publishable. */
const BLOCKED_STATUS: Record<string, true> = {
  T: true,
  U: true,
  AA: true,
  DD: true,
  AU: true,
  UA: true,
  DU: true,
  UD: true,
  UU: true,
};

export interface Outcome {
  status: string;
  pr_url: string;
  summary: string;
}

interface ChangeRecord {
  path: string;
  oldPath?: string;
  status: string;
  oldMode?: string;
  newMode?: string;
  untracked?: boolean;
}

interface DiffRecord {
  path: string;
  oldPath?: string;
  oldMode: string;
  newMode: string;
  status: string;
}

interface Evidence {
  runIds: string[];
  repo: string;
  baseSha: string;
  sharedPack: boolean;
  note: string;
}

interface Ctx {
  cwd: string;
  repo: string;
  baseSha: string;
  artifactsDir: string;
  stateDir: string;
  decision: string;
  mode: string;
  allowedPaths: string[];
  allowedPathsError: string;
  title: string;
  evidence: Evidence;
}

// ---------------------------------------------------------------------------
// Process helpers (argv arrays only; never a shell string)
// ---------------------------------------------------------------------------

function exec(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    code: proc.exitCode ?? 1,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

function git(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  return exec(['git', ...args], cwd);
}

function oneLine(raw: string, max = 300): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

function blocked(summary: string, prUrl = ''): Outcome {
  return { status: 'blocked', pr_url: prUrl, summary: oneLine(summary, 400) };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** Patterns are operator-supplied but still sanitized: no absolute paths, no traversal. */
export function parseAllowedPaths(raw: string): { paths: string[]; error: string } {
  const value = text(raw);
  if (!value) return { paths: [], error: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { paths: [], error: 'allowed_paths is not valid JSON' };
  }
  if (!Array.isArray(parsed)) return { paths: [], error: 'allowed_paths must be a JSON array' };
  const paths: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string') return { paths: [], error: 'allowed_paths entries must be strings' };
    const pat = entry.trim().replace(/^\.\//, '').replace(/\/+$/, '');
    if (!pat) continue;
    if (pat.startsWith('/') || /^[A-Za-z]:/.test(pat) || pat.split('/').some((s) => s === '..')) {
      return { paths: [], error: `allowed_paths entry is not a repository-relative pattern: ${oneLine(pat, 60)}` };
    }
    if (pat.split('/').includes('.git')) {
      return { paths: [], error: 'allowed_paths may not target git internals' };
    }
    paths.push(pat);
  }
  return { paths: [...new Set(paths)], error: '' };
}

/** Run/PR identifiers are opaque, bounded, and limited to an inert character set. */
export function sanitizeRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' && typeof entry !== 'number') continue;
    const id = String(entry).trim();
    if (!id || id.length > 128) continue;
    if (!/^[A-Za-z0-9._:@/-]+$/.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= 500) break;
  }
  return out;
}

function readEvidence(evidencePath: string): Evidence {
  const empty: Evidence = { runIds: [], repo: '', baseSha: '', sharedPack: false, note: '' };
  if (!evidencePath) return { ...empty, note: 'no evidence path was provided' };
  if (!existsSync(evidencePath)) return { ...empty, note: 'evidence file was not found' };
  let size = 0;
  try {
    size = statSync(evidencePath).size;
  } catch {
    return { ...empty, note: 'evidence file was unreadable' };
  }
  if (size > MAX_ARTIFACT_BYTES) return { ...empty, note: 'evidence file is too large to read' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch {
    return { ...empty, note: 'evidence file is not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...empty, note: 'evidence file is not a JSON object' };
  }
  const obj = parsed as Record<string, unknown>;
  const runIds = sanitizeRunIds(obj.run_ids ?? obj.runIds);
  const repo = typeof obj.repo === 'string' ? text(obj.repo) : '';
  const baseSha = typeof obj.base_sha === 'string' ? text(obj.base_sha) : '';
  const scope = typeof obj.scope === 'string' ? text(obj.scope).toLowerCase() : '';
  const sharedPack = obj.shared_pack === true || scope === 'shared-pack' || scope === 'shared_pack';
  return { runIds, repo, baseSha, sharedPack, note: runIds.length ? '' : 'evidence contained no run IDs' };
}

// ---------------------------------------------------------------------------
// Seen-run ledger ($STATE_DIR/factory-learn/seen.json)
// ---------------------------------------------------------------------------

function loadSeen(stateDir: string): Set<string> {
  const path = join(stateDir, 'factory-learn', SEEN_FILE);
  if (!existsSync(path)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0));
  } catch {
    // Corrupt ledger: start clean rather than failing the run.
    return new Set();
  }
}

function saveSeen(stateDir: string, ids: Set<string>): void {
  const path = join(stateDir, 'factory-learn', SEEN_FILE);
  mkdirSync(dirname(path), { recursive: true });
  let list = [...ids];
  if (list.length > MAX_SEEN_IDS) list = list.slice(list.length - MAX_SEEN_IDS);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Host-scoped publish lock
// ---------------------------------------------------------------------------

interface LockHandle {
  path: string;
  token: string;
  release: () => void;
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serializes publishing on this host. The same-host guard plus the fixed branch name is
 * the whole concurrency story: another host can only race the push, which is non-forcing.
 */
export function acquirePublishLock(stateDir: string, host = hostname()): LockHandle | null {
  const dir = join(stateDir, 'factory-learn');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOCK_FILE);
  const token = `${host}:${process.pid}:${Date.now()}`;

  const tryCreate = (): LockHandle | null => {
    try {
      const fd = openSync(path, 'wx');
      try {
        writeFileSync(fd, `${JSON.stringify({ host, pid: process.pid, token, ts: Date.now() })}\n`);
      } finally {
        closeSync(fd);
      }
    } catch {
      return null;
    }
    return {
      path,
      token,
      release: () => {
        try {
          const current = JSON.parse(readFileSync(path, 'utf8')) as { token?: string };
          if (current.token === token) unlinkSync(path);
        } catch {
          // Lock already gone or unreadable: nothing to release.
        }
      },
    };
  };

  const created = tryCreate();
  if (created) return created;

  // Reclaim a stale lock: same host with a dead pid, or simply too old to be live.
  try {
    const stale = JSON.parse(readFileSync(path, 'utf8')) as { host?: string; pid?: number; ts?: number };
    const age = Date.now() - (typeof stale.ts === 'number' ? stale.ts : 0);
    const deadSameHost = stale.host === host && typeof stale.pid === 'number' && !pidAlive(stale.pid);
    if (age > LOCK_STALE_MS || deadSameHost) {
      rmSync(path, { force: true });
      return tryCreate();
    }
  } catch {
    rmSync(path, { force: true });
    return tryCreate();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Git inspection
// ---------------------------------------------------------------------------

interface OriginInfo {
  repo: string;
  /** Raw configured origin URL: the explicit fetch and push target for every remote op. */
  url: string;
}

/**
 * Only GitHub origins are accepted. The identity comes from the raw configured
 * `remote.origin.url` (not `git remote get-url`, which applies `url.*.insteadOf`
 * rewriting), so a divergent `remote.origin.pushurl` cannot silently retarget the publish:
 * both are checked, and the raw URL is passed to git explicitly.
 */
export function githubOrigin(cwd: string): OriginInfo | null {
  const raw = git(cwd, ['config', '--get', 'remote.origin.url']);
  const url = raw.code === 0 ? raw.stdout.trim() : '';
  if (!url) return null;
  const match = url.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/
  );
  if (!match) return null;

  const pushUrl = git(cwd, ['config', '--get', 'remote.origin.pushurl']);
  const configuredPush = pushUrl.code === 0 ? pushUrl.stdout.trim() : '';
  if (configuredPush && configuredPush !== url) {
    const pushMatch = configuredPush.match(
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/
    );
    if (!pushMatch || `${pushMatch[1]}/${pushMatch[2]}`.toLowerCase() !== `${match[1]}/${match[2]}`.toLowerCase()) {
      return null;
    }
  }
  return { repo: `${match[1]}/${match[2]}`, url };
}

function isSafeBranch(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(name) && !name.includes('..');
}

/** Default branch via `gh`, then `git ls-remote --symref`, then the local origin HEAD. */
export function resolveDefaultBranch(cwd: string, repo: string, remoteUrl: string): string {
  const gh = exec(['gh', 'repo', 'view', repo, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], cwd);
  if (gh.code === 0) {
    const candidate = text(gh.stdout.split(/\r?\n/)[0] ?? '');
    if (isSafeBranch(candidate)) return candidate;
  }
  const remote = git(cwd, ['ls-remote', '--symref', '--', remoteUrl, 'HEAD']);
  if (remote.code === 0) {
    const match = remote.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m);
    if (match && isSafeBranch(match[1])) return match[1];
  }
  const local = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (local.code === 0) {
    const candidate = text(local.stdout).replace(/^origin\//, '');
    if (isSafeBranch(candidate)) return candidate;
  }
  return '';
}

/** Reads a remote ref, distinguishing "absent" (ok, empty sha) from "could not tell" (not ok). */
function remoteRef(cwd: string, remoteUrl: string, ref: string): { ok: boolean; sha: string } {
  const res = git(cwd, ['ls-remote', '--', remoteUrl, ref]);
  if (res.code !== 0) return { ok: false, sha: '' };
  const line = res.stdout.split(/\r?\n/).find((l) => l.trim());
  if (!line) return { ok: true, sha: '' };
  const sha = line.split(/\s+/)[0] ?? '';
  return /^[0-9a-f]{40,64}$/i.test(sha) ? { ok: true, sha } : { ok: false, sha: '' };
}

function resolveCommit(cwd: string, rev: string): string {
  if (!rev || !/^[A-Za-z0-9._/~^@{}-]{1,120}$/.test(rev)) return '';
  const res = git(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  return res.code === 0 ? res.stdout.trim() : '';
}

/** Parses `git status --porcelain=v1 -z -uall`. */
export function parseStatusZ(raw: string): ChangeRecord[] {
  const tokens = raw.split('\0');
  const records: ChangeRecord[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.length < 4) continue;
    if (token[2] !== ' ') continue;
    const x = token[0];
    const y = token[1];
    const path = token.slice(3);
    const status = `${x}${y}`;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      const oldPath = tokens[i + 1] ?? '';
      i += 1;
      records.push({ path, oldPath, status });
      continue;
    }
    records.push({ path, status, untracked: x === '?' && y === '?' });
  }
  return records;
}

/** Parses `git diff --raw -z` headers: `:oldmode newmode oldsha newsha status\0path\0`. */
export function parseRawDiffZ(raw: string): DiffRecord[] {
  const tokens = raw.split('\0');
  const records: DiffRecord[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith(':')) continue;
    const meta = token.slice(1).split(' ');
    if (meta.length < 5) continue;
    const oldMode = meta[0];
    const newMode = meta[1];
    const status = meta[4][0];
    if (status === 'R' || status === 'C') {
      const oldPath = tokens[i + 1] ?? '';
      const newPath = tokens[i + 2] ?? '';
      records.push({ path: newPath, oldPath, oldMode, newMode, status });
      i += 2;
      continue;
    }
    const path = tokens[i + 1] ?? '';
    records.push({ path, oldMode, newMode, status });
    i += 1;
  }
  return records;
}

function unsafePathReason(path: string): string {
  if (!path) return 'empty path';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'absolute path';
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'control characters in path';
  const segments = path.split('/');
  if (segments.some((s) => s === '..' || s === '.')) return 'path traversal';
  if (segments.includes('.git')) return 'git internals';
  return '';
}

/** Classifies one path against protected, harness-category, and operator allowlists. */
export function classifyPath(
  path: string,
  allowedPaths: string[]
): { ok: boolean; reason: string } {
  const unsafe = unsafePathReason(path);
  if (unsafe) return { ok: false, reason: unsafe };
  if (PROTECTED_PATTERNS.some((pat) => matchPathPattern(path, pat))) {
    return { ok: false, reason: 'protected workflow/CI/approval/access/configuration path' };
  }
  if (!SAFE_CATEGORY_PATTERNS.some((pat) => matchPathPattern(path, pat))) {
    return { ok: false, reason: 'outside the permitted harness categories' };
  }
  if (allowedPaths.length === 0) {
    return { ok: false, reason: 'draft mode requires explicit allowed_paths' };
  }
  if (!allowedPaths.some((pat) => matchPathPattern(path, pat))) {
    return { ok: false, reason: 'not covered by the approved allowed_paths' };
  }
  return { ok: true, reason: '' };
}

interface ChangeScan {
  records: ChangeRecord[];
  problems: string[];
}

/**
 * Collects tracked + untracked changes against the base and refuses unsafe diff shapes:
 * symlinks, submodules, executable/mode changes, type changes, and unmerged entries.
 */
export function collectChanges(cwd: string, baseFull: string): ChangeScan {
  const problems: string[] = [];
  const statusRes = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (statusRes.code !== 0) {
    return { records: [], problems: ['git status failed in the assigned worktree'] };
  }
  const diffRes = git(cwd, ['diff', '--raw', '-z', '--no-abbrev', baseFull, '--']);
  const diffs = diffRes.code === 0 ? parseRawDiffZ(diffRes.stdout) : [];
  const diffByPath = new Map(diffs.map((d) => [d.path, d]));

  const records = parseStatusZ(statusRes.stdout);
  for (const record of records) {
    const diff = diffByPath.get(record.path);
    if (diff) {
      record.oldMode = diff.oldMode;
      record.newMode = diff.newMode;
      record.oldPath = record.oldPath || diff.oldPath;
      record.status = diff.status === 'R' || diff.status === 'C' ? record.status : diff.status;
    } else if (record.untracked) {
      record.oldMode = '000000';
      record.newMode = '100644';
      try {
        const st = lstatSync(join(cwd, record.path));
        if (st.isSymbolicLink()) problems.push(`symlink change is not allowed: ${record.path}`);
        else if ((st.mode & 0o111) !== 0) {
          problems.push(`executable mode change is not allowed: ${record.path}`);
          record.newMode = '100755';
        }
      } catch {
        problems.push(`unreadable untracked path: ${record.path}`);
      }
    }

    if (BLOCKED_STATUS[record.status]) {
      problems.push(`unsafe diff status ${record.status} for ${record.path}`);
    }
    for (const mode of [record.oldMode, record.newMode]) {
      if (mode === '120000') problems.push(`symlink change is not allowed: ${record.path}`);
      if (mode === '160000') problems.push(`submodule change is not allowed: ${record.path}`);
      if (mode === '100755') problems.push(`executable mode change is not allowed: ${record.path}`);
    }
    // `000000` is git's null mode (creation or deletion), never a real permissions change.
    const realModes = [record.oldMode, record.newMode].filter(
      (mode): mode is string => Boolean(mode) && mode !== '000000'
    );
    if (realModes.length === 2 && realModes[0] !== realModes[1]) {
      problems.push(`file mode change is not allowed: ${record.path}`);
    }
  }

  // Diff entries that status did not report (e.g. staged-only type changes) still count.
  for (const diff of diffs) {
    if (!records.some((r) => r.path === diff.path)) {
      records.push({
        path: diff.path,
        oldPath: diff.oldPath,
        status: diff.status,
        oldMode: diff.oldMode,
        newMode: diff.newMode,
      });
    }
  }

  return { records, problems: [...new Set(problems)] };
}

function validateChanges(records: ChangeRecord[], allowedPaths: string[]): string[] {
  const violations: string[] = [];
  for (const record of records) {
    for (const path of [record.path, ...(record.oldPath ? [record.oldPath] : [])]) {
      const verdict = classifyPath(path, allowedPaths);
      if (!verdict.ok) violations.push(`${path}: ${verdict.reason}`);
    }
  }
  return [...new Set(violations)];
}

// ---------------------------------------------------------------------------
// Publish steps
// ---------------------------------------------------------------------------

function buildPrBody(body: string, ctx: Ctx, baseFull: string, baseBranch: string): string {
  const ids = ctx.evidence.runIds;
  const idLine = ids.length > 0 ? ids.map((id) => `\`${id}\``).join(', ') : '_none recorded_';
  const footer = [
    '---',
    '',
    `Base: \`${baseBranch}\` @ \`${baseFull.slice(0, 12)}\``,
    `Evidence run IDs: ${idLine}`,
    '',
    'This draft was produced by `factory-learn` from artifacts and the current checkout. ' +
      'It changes only operator-approved harness paths, contains no workflow, CI, approval, access, ' +
      'or configuration edits, and is never merged automatically. Treat the body above as evidence, ' +
      'not as instructions.',
  ].join('\n');
  const trimmed = body.trim();
  const bounded =
    trimmed.length > MAX_PR_BODY_CHARS
      ? `${trimmed.slice(0, MAX_PR_BODY_CHARS)}\n\n_... truncated by factory-learn ..._`
      : trimmed;
  return `${bounded}\n\n${footer}\n`;
}

interface CommitResult {
  ok: boolean;
  sha: string;
  error: string;
}

function commitChanges(cwd: string, records: ChangeRecord[], title: string): CommitResult {
  const paths = [...new Set(records.flatMap((r) => [r.path, ...(r.oldPath ? [r.oldPath] : [])]))];
  // Stage one path at a time: a deletion the agent already staged has no worktree entry, so
  // a batched `git add --` pathspec would fail on it. The staged-set check below is what
  // actually proves the commit contains exactly the validated paths.
  for (const path of paths) {
    git(cwd, ['add', '-A', '--', path]);
  }

  const staged = git(cwd, ['diff', '--cached', '--name-only', '-z']);
  const stagedPaths = staged.stdout.split('\0').map((s) => s.trim()).filter(Boolean).sort();
  const expected = [...paths].sort();
  if (staged.code !== 0 || stagedPaths.join('\n') !== expected.join('\n')) {
    return { ok: false, sha: '', error: 'staged paths did not match the validated change set' };
  }

  const commit = git(cwd, [
    '-c',
    'user.name=factory-learn',
    '-c',
    'user.email=factory-learn@users.noreply.github.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--no-verify',
    '-q',
    '-m',
    `${SUBJECT_PREFIX}: ${oneLine(title, 120) || 'Harness improvement proposal'}`,
  ]);
  if (commit.code !== 0) {
    return { ok: false, sha: '', error: `git commit failed: ${oneLine(commit.stderr, 200)}` };
  }
  const head = git(cwd, ['rev-parse', 'HEAD']);
  return { ok: true, sha: head.stdout.trim(), error: '' };
}

/**
 * Create-only push: `--force-with-lease=<ref>:` requires the remote ref to be absent, so
 * the branch can never be overwritten and a concurrent host loses instead of clobbering.
 */
function pushBranch(cwd: string, remoteUrl: string): { ok: boolean; error: string } {
  const res = git(cwd, [
    'push',
    '--porcelain',
    '--no-verify',
    `--force-with-lease=refs/heads/${LEARN_BRANCH}:`,
    remoteUrl,
    `HEAD:refs/heads/${LEARN_BRANCH}`,
  ]);
  if (res.code === 0) return { ok: true, error: '' };
  return { ok: false, error: oneLine(`${res.stderr} ${res.stdout}`, 240) };
}

interface OpenPr {
  number: number;
  url: string;
}

/**
 * Lists open PRs on the fixed branch. Fails closed: an unreadable or malformed answer is
 * an error, never "no open PR", because a miss here would mean a duplicate publish.
 */
function findOpenLearnPrs(cwd: string, repo: string): { ok: boolean; prs: OpenPr[]; error: string } {
  const res = exec(
    ['gh', 'pr', 'list', '--repo', repo, '--head', LEARN_BRANCH, '--state', 'open', '--json', 'number,url'],
    cwd
  );
  if (res.code !== 0) {
    return { ok: false, prs: [], error: `gh pr list failed: ${oneLine(res.stderr, 200)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout.trim() || 'null');
  } catch {
    return { ok: false, prs: [], error: 'gh pr list returned malformed JSON' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, prs: [], error: 'gh pr list returned an unexpected shape' };
  }
  const prs: OpenPr[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, prs: [], error: 'gh pr list returned an unexpected entry' };
    }
    const record = entry as { number?: unknown; url?: unknown };
    if (typeof record.number !== 'number' || typeof record.url !== 'string') {
      return { ok: false, prs: [], error: 'gh pr list returned an entry without a number/url' };
    }
    prs.push({ number: record.number, url: record.url });
  }
  return { ok: true, prs, error: '' };
}

/**
 * Requires verified, strong protection on the destination base branch, because that is the
 * only thing that keeps a published draft from being merged or rewritten without review.
 *
 * Every failure mode stops the publish: the token cannot read protection, the answer is
 * malformed, PR review is not required, or force-pushes/deletions are allowed. There is no
 * bypass input. Provisioning protection is the operator's responsibility, and an
 * unverifiable destination is treated as an unprotected one.
 */
function checkBaseProtection(cwd: string, repo: string, baseBranch: string): string {
  const res = exec(['gh', 'api', `repos/${repo}/branches/${encodeURIComponent(baseBranch)}/protection`], cwd);
  if (res.code !== 0) {
    const detail = oneLine(`${res.stderr} ${res.stdout}`, 160);
    const unprotected = /HTTP 404|Branch not protected|not protected/i.test(detail);
    return unprotected
      ? `base branch ${baseBranch} has no branch protection; required review, force-push, and deletion protection must be provisioned on GitHub before factory-learn can publish`
      : `branch protection for ${baseBranch} could not be verified (${detail || 'no detail'}); factory-learn publishes nothing to an unverified destination`;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout.trim() || 'null');
  } catch {
    return `branch protection for ${baseBranch} returned malformed JSON; nothing was published`;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return `branch protection for ${baseBranch} returned an unexpected shape; nothing was published`;
  }
  const protection = parsed as Record<string, unknown>;

  const reviews = protection.required_pull_request_reviews as { required_approving_review_count?: number } | undefined;
  if (!(Number(reviews?.required_approving_review_count) >= 1)) {
    return `base branch ${baseBranch} does not require an approving review; provision it before factory-learn can publish`;
  }

  const enabled = (key: string): boolean => {
    const value = protection[key];
    if (!value || typeof value !== 'object') return false;
    return (value as { enabled?: unknown }).enabled === true;
  };
  if (enabled('allow_force_pushes')) {
    return `base branch ${baseBranch} allows force-pushes; disable them before factory-learn can publish`;
  }
  if (enabled('allow_deletions')) {
    return `base branch ${baseBranch} allows deletions; disable them before factory-learn can publish`;
  }
  return '';
}

function createDraftPr(
  cwd: string,
  repo: string,
  baseBranch: string,
  title: string,
  bodyFile: string
): { ok: boolean; url: string; error: string } {
  const res = exec(
    [
      'gh',
      'pr',
      'create',
      '--repo',
      repo,
      '--draft',
      '--base',
      baseBranch,
      '--head',
      LEARN_BRANCH,
      '--title',
      oneLine(title, 120) || 'Harness improvement proposal',
      '--body-file',
      bodyFile,
    ],
    cwd
  );
  if (res.code !== 0) {
    return { ok: false, url: '', error: oneLine(res.stderr, 240) };
  }
  const match = res.stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if (!match) return { ok: false, url: '', error: 'gh did not report a pull request URL' };
  return { ok: true, url: match[0], error: '' };
}

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------

function readProposal(artifactsDir: string): { body: string; error: string } {
  const path = join(artifactsDir, 'proposal.md');
  if (!existsSync(path)) return { body: '', error: 'proposal.md was not written by the learn step' };
  let size = 0;
  try {
    size = statSync(path).size;
  } catch {
    return { body: '', error: 'proposal.md is unreadable' };
  }
  if (size === 0) return { body: '', error: 'proposal.md is empty' };
  if (size > MAX_ARTIFACT_BYTES) return { body: '', error: 'proposal.md is too large to publish' };
  const body = readFileSync(path, 'utf8').trim();
  if (!body) return { body: '', error: 'proposal.md is empty' };
  return { body, error: '' };
}

// ---------------------------------------------------------------------------
// Draft publish flow
// ---------------------------------------------------------------------------

function publishDraft(ctx: Ctx, body: string): Outcome {
  const origin = githubOrigin(ctx.cwd);
  if (!origin) return blocked('the assigned checkout cannot prove a GitHub origin; nothing was published');
  if (!ctx.repo) return blocked('no repository was resolved for draft publishing');
  if (origin.repo.toLowerCase() !== ctx.repo.toLowerCase()) {
    return blocked(
      `origin ${origin.repo} does not match ${ctx.repo}; shared-pack findings stay report-only, no cross-repo edits`
    );
  }
  if (ctx.evidence.sharedPack) {
    return blocked(
      'evidence targets the shared factory pack, which has no dedicated repository; recorded as a report-only proposal'
    );
  }
  if (ctx.allowedPaths.length === 0) {
    return blocked('draft publishing needs explicit allowed_paths from the operator');
  }

  const baseFull = resolveCommit(ctx.cwd, ctx.baseSha);
  if (!baseFull) return blocked('the evidence base SHA could not be resolved in the assigned worktree');
  if (ctx.evidence.repo.toLowerCase() !== ctx.repo.toLowerCase() || ctx.evidence.baseSha !== baseFull) {
    return blocked('evidence does not match the repository and full base SHA');
  }

  // HEAD must still be exactly the evidence base: no agent commits, no resets, no rebuilds.
  const headRes = git(ctx.cwd, ['rev-parse', 'HEAD']);
  const head = headRes.stdout.trim();
  if (headRes.code !== 0 || !head) return blocked('HEAD could not be read in the assigned worktree');
  if (head !== baseFull) {
    return blocked(
      `HEAD moved off the evidence base (${head.slice(0, 12)} != ${baseFull.slice(0, 12)}); the agent must not commit, reset, or amend`
    );
  }

  const baseBranch = resolveDefaultBranch(ctx.cwd, ctx.repo, origin.url);
  if (!baseBranch) return blocked('the remote default branch could not be determined');
  if (baseBranch === LEARN_BRANCH) return blocked('the default branch collides with the learn branch');

  const baseRef = remoteRef(ctx.cwd, origin.url, `refs/heads/${baseBranch}`);
  if (!baseRef.ok) return blocked(`the remote ${baseBranch} head could not be read`);
  if (!baseRef.sha) return blocked(`the remote ${baseBranch} does not exist`);
  if (baseRef.sha !== baseFull) {
    return blocked(
      `base moved: ${baseBranch} is at ${baseRef.sha.slice(0, 12)}, evidence base is ${baseFull.slice(0, 12)}`
    );
  }

  // The fixed branch must be absent so publishing is create-only, never an update.
  const learnRef = remoteRef(ctx.cwd, origin.url, `refs/heads/${LEARN_BRANCH}`);
  if (!learnRef.ok) return blocked(`the remote ${LEARN_BRANCH} ref could not be read`);
  if (learnRef.sha) {
    return blocked(`${LEARN_BRANCH} already exists on the remote; proposals are created once and never updated`);
  }

  const openPrs = findOpenLearnPrs(ctx.cwd, ctx.repo);
  if (!openPrs.ok) return blocked(`cannot confirm no learn PR is open: ${openPrs.error}`);
  if (openPrs.prs.length > 0) {
    return blocked(
      `PR #${openPrs.prs[0].number} is already open on ${LEARN_BRANCH}; resolve it before publishing another proposal`,
      openPrs.prs[0].url
    );
  }

  const protectionProblem = checkBaseProtection(ctx.cwd, ctx.repo, baseBranch);
  if (protectionProblem) return blocked(protectionProblem);

  const lock = acquirePublishLock(ctx.stateDir);
  if (!lock) return blocked('another factory-learn publish is already running on this host');

  try {
    const scan = collectChanges(ctx.cwd, baseFull);
    if (scan.problems.length > 0) {
      return blocked(`refused unsafe change: ${scan.problems[0]} (${scan.problems.length} problem(s))`);
    }
    if (scan.records.length === 0) return blocked('no checkout changes were found to publish');

    const violations = validateChanges(scan.records, ctx.allowedPaths);
    if (violations.length > 0) {
      return blocked(`refused change: ${violations[0]} (${violations.length} violation(s))`);
    }

    const commit = commitChanges(ctx.cwd, scan.records, ctx.title);
    if (!commit.ok) return blocked(commit.error);

    const bodyFile = join(ctx.artifactsDir, 'learn-pr-body.md');
    mkdirSync(ctx.artifactsDir, { recursive: true });
    writeFileSync(bodyFile, buildPrBody(body, ctx, baseFull, baseBranch), 'utf8');

    const push = pushBranch(ctx.cwd, origin.url);
    if (!push.ok) {
      return blocked(
        `create-only push of ${LEARN_BRANCH} was refused (another host may have created it): ${push.error}`
      );
    }

    const created = createDraftPr(ctx.cwd, ctx.repo, baseBranch, ctx.title, bodyFile);
    if (!created.ok) return blocked(`push succeeded but draft PR creation failed: ${created.error}`);
    return {
      status: 'draft',
      pr_url: created.url,
      summary: oneLine(
        `Opened draft proposal PR on ${LEARN_BRANCH} against ${baseBranch}; human review required, never merged automatically.`,
        400
      ),
    };
  } finally {
    lock.release();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function buildCtx(): Ctx {
  const artifactsDir = text(process.env.ARTIFACTS_DIR) || '/tmp/archon-factory-artifacts';
  const stateDir = text(process.env.STATE_DIR) || join(artifactsDir, 'state');
  const allowed = parseAllowedPaths(text(process.env.INPUTS_ALLOWED_PATHS));
  return {
    cwd: process.cwd(),
    repo: text(process.env.INPUTS_REPO),
    baseSha: text(process.env.INPUTS_BASE_SHA),
    artifactsDir,
    stateDir,
    decision: text(process.env.INPUTS_DECISION),
    mode: (text(process.env.INPUTS_MODE) || 'proposal').toLowerCase(),
    allowedPaths: allowed.paths,
    allowedPathsError: allowed.error,
    title: text(process.env.INPUTS_TITLE),
    evidence: readEvidence(text(process.env.INPUTS_EVIDENCE_PATH)),
  };
}

export function run(): Outcome {
  const ctx = buildCtx();
  const snapshot = text(process.env.INPUTS_PR_SNAPSHOT);
  if (snapshot) readPrSnapshot(snapshot, ctx.repo);

  if (ctx.decision !== 'no-change' && ctx.decision !== 'proposal-only' && ctx.decision !== 'draft') {
    return blocked(`learn returned an unrecognized decision: ${ctx.decision || '(empty)'}; nothing was published`);
  }
  if (ctx.allowedPathsError) {
    return blocked(`INPUTS_ALLOWED_PATHS was rejected: ${ctx.allowedPathsError}; nothing was published`);
  }

  // Dedupe: a run set that was already processed is never republished.
  if (!snapshot && ctx.evidence.runIds.length > 0) {
    const seen = loadSeen(ctx.stateDir);
    if (ctx.evidence.runIds.every((id) => seen.has(id))) {
      return {
        status: 'already-processed',
        pr_url: '',
        summary: oneLine(`All ${ctx.evidence.runIds.length} evidence run ID(s) were already processed; nothing was published.`, 400),
      };
    }
  }

  const markSeen = () => {
    if (ctx.evidence.runIds.length === 0) {
      if (snapshot) acknowledgePrSnapshot(snapshot, ctx.repo);
      return;
    }
    const seen = loadSeen(ctx.stateDir);
    for (const id of ctx.evidence.runIds) seen.add(id);
    saveSeen(ctx.stateDir, seen);
    if (snapshot) acknowledgePrSnapshot(snapshot, ctx.repo);
  };

  if (ctx.decision === 'no-change') {
    markSeen();
    return {
      status: 'no-change',
      pr_url: '',
      summary: oneLine(
        `No justified harness change for ${ctx.evidence.runIds.length} run(s); recorded as processed.`,
        400
      ),
    };
  }

  const proposal = readProposal(ctx.artifactsDir);
  if (proposal.error) return blocked(`${proposal.error}; nothing was published`);

  const draftRequested = ctx.decision === 'draft';
  if (!draftRequested || ctx.mode !== 'draft') {
    // Default: proposal only. `decision=draft` without `mode=draft` is downgraded, not published.
    markSeen();
    const downgraded = draftRequested && ctx.mode !== 'draft';
    return {
      status: 'proposal-only',
      pr_url: '',
      summary: oneLine(
        downgraded
          ? 'Saved proposal.md; draft publishing was not enabled (mode != draft), so nothing was published.'
          : 'Saved proposal.md for operator review; nothing was published.',
        400
      ),
    };
  }

  const outcome = publishDraft(ctx, proposal.body);
  if (outcome.status === 'draft') markSeen();
  return outcome;
}

function main(): void {
  let outcome: Outcome;
  try {
    outcome = run();
  } catch (error) {
    outcome = {
      status: 'error',
      pr_url: '',
      summary: oneLine(error instanceof Error ? error.message : String(error), 400),
    };
  }
  emit(outcome);
  if (outcome.status === 'error') process.exitCode = 1;
}

if (import.meta.main) main();

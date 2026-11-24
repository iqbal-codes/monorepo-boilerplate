import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

export interface PrSignal {
  key: string;
  pr: number;
  kind: 'merged' | 'closed' | 'changes-requested';
  at: string;
  head: string;
  review_id?: number;
  excerpt?: string;
}

export interface PrSnapshot {
  repo: string;
  repo_id: number;
  signals: PrSignal[];
}

const keyPattern = /^[a-f0-9]{64}$/;

export const prPollRoot = resolve(process.env.ARCHON_HOME || join(homedir(), '.archon'), 'factory-learn-poll');

export function processedKeys(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const keys: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || !keyPattern.test(key))) {
    throw new Error('Invalid Factory Learn PR ledger.');
  }
  return new Set(keys);
}

export function readPrSnapshot(path: string, repo: string): PrSnapshot {
  const file = lstatSync(path);
  if (!file.isFile() || file.size > 128_000) throw new Error('Invalid Factory Learn PR snapshot file.');
  const location = relative(realpathSync(prPollRoot), realpathSync(path));
  if (!/^\d+\/snapshot-[A-Za-z0-9]+\/batch\.json$/.test(location)) {
    throw new Error('PR snapshot must be created by the Factory Learn poller.');
  }
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as PrSnapshot;
  if (snapshot.repo !== repo.toLowerCase() || !Number.isSafeInteger(snapshot.repo_id) || snapshot.repo_id <= 0 ||
      !location.startsWith(`${snapshot.repo_id}/`) ||
      !Array.isArray(snapshot.signals) || !snapshot.signals.length || snapshot.signals.length > 60 ||
      snapshot.signals.some((signal) => !keyPattern.test(signal.key) || !Number.isSafeInteger(signal.pr) || signal.pr <= 0)) {
    throw new Error('Invalid or cross-repository Factory Learn PR snapshot.');
  }
  return snapshot;
}

export function acknowledgePrSnapshot(path: string, repo: string): void {
  const snapshot = readPrSnapshot(path, repo);
  writeFileSync(join(dirname(path), 'ack.json'), JSON.stringify(snapshot.signals.map((signal) => signal.key)), { mode: 0o600, flag: 'wx' });
}

export function commitPrAcknowledgement(path: string, snapshot: PrSnapshot): void {
  const acknowledged = processedKeys(join(dirname(path), 'ack.json'));
  if (acknowledged.size !== snapshot.signals.length || snapshot.signals.some(({ key }) => !acknowledged.has(key))) {
    throw new Error('Factory Learn did not acknowledge the complete PR snapshot; it remains pending.');
  }
  const ledger = join(prPollRoot, String(snapshot.repo_id), 'processed.json');
  const keys = processedKeys(ledger);
  for (const key of acknowledged) keys.add(key);
  const temporary = `${ledger}.${randomUUID()}`;
  writeFileSync(temporary, JSON.stringify([...keys]), { mode: 0o600, flag: 'wx' });
  renameSync(temporary, ledger);
}

export function redactExcerpt(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[redacted]')
    .replace(/\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]{12,}|AKIA[A-Z0-9]{16}|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, '[redacted]')
    .replace(/\b(?:authorization|password|secret|api[_ -]?key|token)\s*[:=]\s*[^\r\n]+/gi, '[redacted]')
    .replace(/\b(\w+:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
    .slice(0, 900);
}

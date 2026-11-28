export function text(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s === 'null' || s === 'undefined' ? '' : s;
}

export function emit(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export function runCmd(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; allowFail?: boolean } = {}
): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(args, {
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const stderr = new TextDecoder().decode(proc.stderr).trim();
  const code = proc.exitCode ?? 1;
  if (code !== 0 && !opts.allowFail) {
    throw new Error(`Command failed (${code}): ${args.join(' ')}\n${stderr || stdout}`);
  }
  return { code, stdout, stderr };
}

export function detectGitRepo(cwd = process.cwd()): string {
  const res = runCmd(['git', 'remote', 'get-url', 'origin'], { cwd, allowFail: true });
  if (res.code !== 0 || !res.stdout) return '';
  const url = res.stdout.trim();
  const sshMatch = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return sshMatch ? sshMatch[1] : '';
}

export function detectBaseBranch(cwd = process.cwd()): string {
  const sym = runCmd(['git', 'symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd, allowFail: true });
  if (sym.code === 0 && sym.stdout) {
    const parts = sym.stdout.split('/');
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return 'main';
}

/**
 * Loads a raw GitHub issue (or $ARGUMENTS) and writes it to $ARTIFACTS_DIR/raw-request.md.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectGitRepo, emit, runCmd, text } from '../../.shared/contract.ts';
import { isMaintainer, loadMaintainers } from '../../.shared/maintainers.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const issueInput = text(process.env.INPUTS_ISSUE);
const repo = text(process.env.INPUTS_REPO) || detectGitRepo();
const userArgs = text(process.env.ARGUMENTS);

let source: 'issue' | 'arguments' = 'arguments';
let issueNumber = 0;
let title = 'Refined Task';
let body = '';

if (issueInput) {
  source = 'issue';
  issueNumber = Number.parseInt(issueInput.replace(/^#/, ''), 10);
  if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid issue number: ${issueInput}`);
  }
  if (!repo) {
    throw new Error('Could not detect GitHub repo; pass --input repo=<owner/repo>.');
  }
  const gh = runCmd([
    'gh',
    'issue',
    'view',
    String(issueNumber),
    '--repo',
    repo,
    '--json',
    'title,body,comments,url',
  ]);
  const data = JSON.parse(gh.stdout) as {
    title: string;
    body: string;
    url: string;
    comments?: { author?: { login?: string }; body?: string }[];
  };
  title = data.title;
  const maintainers = loadMaintainers();
  const commentText = (data.comments ?? [])
    .filter((c) => maintainers.size === 0 || isMaintainer(c.author?.login, maintainers))
    .map((c) => `### Comment by @${c.author?.login || 'unknown'}\n${c.body || ''}`)
    .join('\n\n');
  body = `# ${data.title}\n\nSource: ${data.url}\n\n${data.body || ''}${commentText ? `\n\n## Comments\n\n${commentText}` : ''}`;
} else if (userArgs) {
  source = 'arguments';
  title = userArgs.split(/\r?\n/)[0].slice(0, 80) || title;
  body = userArgs;
} else {
  throw new Error('Provide --input issue=<N> or a task description message.');
}

const requestPath = join(artifactsDir, 'raw-request.md');
writeFileSync(requestPath, body, 'utf8');

emit({
  source,
  repo,
  issue_number: issueNumber,
  title,
  request_path: requestPath,
});

#!/usr/bin/env bash
# Print an opt-in, proposal-only trigger binding. Does not install a schedule.
set -euo pipefail
if [[ $# != 1 ]]; then
  printf 'Usage: bash %s /path/to/github-checkout\n' "$0" >&2
  exit 2
fi
cwd=$(git -C "$1" rev-parse --show-toplevel)
origin=$(git -C "$cwd" remote get-url origin)
if [[ ! "$origin" =~ ^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)([A-Za-z0-9-]+)/([A-Za-z0-9_.-]+)$ ]]; then
  printf 'Factory Learn needs a GitHub origin.\n' >&2
  exit 2
fi
repo="${BASH_REMATCH[2]}/${BASH_REMATCH[3]%.git}"
id="factory-learn:${repo,,}"
host=$(hostname -s)
user=$(archon trigger whoami | jq -er '.runAsUserId | strings | select(length > 0)')
jq -n --arg id "$id" --arg host "$host" --arg user "$user" --arg repo "$repo" --arg cwd "$cwd" '{
  version: 1,
  sourceInstanceId: $id,
  binding: {
    bindingId: $id, bindingRevision: null, hostId: $host, runAsUserId: $user,
    resource: ("factory:github.com/" + ($repo | ascii_downcase) + ":learn"),
    capacity: 1, overlap: "skip",
    launch: {cwd: $cwd, workflowName: "factory-learn", inputs: {mode: "proposal"}, isolation: {kind: "worktree"}}
  }
}'

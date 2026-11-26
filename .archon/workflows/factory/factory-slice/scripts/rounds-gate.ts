// Decide whether finalize-pr may run. Kept out of `when:` because a skipped
// loop_group has no output, and dot-accessing it fails the node instead of skipping it.
const ready = process.env.INPUTS_ROUNDS_READY === "true";
const decision = process.env.INPUTS_ESCALATION_DECISION ?? "";
// `leave-open` is the only escalation answer that still finalizes the PR (evidence,
// body, merge policy with rounds_ready=false). Re-scoping ends the run untouched.
console.log(JSON.stringify({ finalize: ready || decision === "leave-open" }));

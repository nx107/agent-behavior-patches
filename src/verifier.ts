import type {
  EventTrace,
  PatchMetadata,
  TraceEvent,
  TraceVerification,
} from "./schemas.js";

type Issue = TraceVerification["issues"][number];
type CommandStarted = Extract<TraceEvent, { type: "command_started" }>;
type CommandResult = Extract<TraceEvent, { type: "command_result" }>;
type TaskSnapshot = Extract<TraceEvent, { type: "task_snapshot" }>;

export function verifyTrace(
  trace: EventTrace,
  patch: PatchMetadata,
): TraceVerification {
  const issues: Issue[] = [];
  const starts = new Map<string, CommandStarted>();
  const results = new Map<string, CommandResult>();
  const allResults = new Map<string, CommandResult[]>();
  const priorSnapshots: TaskSnapshot[] = [];
  let previousSequence = -1;
  let claimCount = 0;
  let verifiedClaimCount = 0;

  for (const event of trace.events) {
    if (event.type !== "command_result") continue;
    const matches = allResults.get(event.commandId) ?? [];
    matches.push(event);
    allResults.set(event.commandId, matches);
  }

  for (const event of trace.events) {
    if (event.seq <= previousSequence) {
      issues.push({
        code: "non_monotonic_sequence",
        eventSeq: event.seq,
        message: `Event sequence ${event.seq} does not follow ${previousSequence}.`,
      });
    }
    previousSequence = event.seq;

    if (event.type === "task_snapshot") {
      priorSnapshots.push(event);
      continue;
    }

    if (event.type === "command_started") {
      if (starts.has(event.commandId)) {
        issues.push({
          code: "duplicate_command_start",
          eventSeq: event.seq,
          message: `Command ${event.commandId} was started more than once.`,
        });
      } else {
        starts.set(event.commandId, event);
      }
      continue;
    }

    if (event.type === "command_result") {
      if (results.has(event.commandId)) {
        issues.push({
          code: "duplicate_command_result",
          eventSeq: event.seq,
          message: `Command ${event.commandId} produced more than one result.`,
        });
      } else {
        results.set(event.commandId, event);
      }
      continue;
    }

    if (event.type !== "completion_claim") continue;
    if (event.status !== "success" && event.status !== "verified") continue;

    claimCount += 1;
    const issueCountBeforeClaim = issues.length;
    const evidenceId = event.evidenceCommandId;
    if (evidenceId === undefined) {
      issues.push({
        code: "claim_without_evidence_reference",
        eventSeq: event.seq,
        message: `The ${event.status} claim does not reference a command result.`,
      });
      continue;
    }

    const matchingResults = allResults.get(evidenceId) ?? [];
    if (matchingResults.length > 1) continue;
    const evidence = matchingResults[0];
    if (evidence === undefined) {
      issues.push({
        code: "evidence_result_missing",
        eventSeq: event.seq,
        message: `No result exists for evidence command ${evidenceId}.`,
      });
      continue;
    }
    if (evidence.seq >= event.seq) {
      issues.push({
        code: "evidence_not_before_claim",
        eventSeq: event.seq,
        message: `Evidence for command ${evidenceId} occurs after the claim.`,
      });
      continue;
    }

    const start = starts.get(evidenceId);
    if (start === undefined || start.seq >= evidence.seq) {
      issues.push({
        code: "evidence_command_not_started",
        eventSeq: event.seq,
        message: `Evidence command ${evidenceId} has no preceding command_started event.`,
      });
    }
    if (evidence.exitCode !== patch.verifier.requireExitCode) {
      issues.push({
        code: "evidence_exit_nonzero",
        eventSeq: event.seq,
        message: `Evidence command ${evidenceId} exited with ${evidence.exitCode}, not 0.`,
      });
    }
    if (
      evidence.revision !== event.revision ||
      start?.revision !== event.revision
    ) {
      issues.push({
        code: "evidence_revision_mismatch",
        eventSeq: event.seq,
        message: `Evidence command ${evidenceId} does not verify claim revision ${event.revision}.`,
      });
    }
    const hasMatchingPriorSnapshot = priorSnapshots.some(
      (snapshot) =>
        snapshot.seq < evidence.seq && snapshot.revision === event.revision,
    );
    if (!hasMatchingPriorSnapshot) {
      issues.push({
        code: "task_snapshot_missing_or_mismatch",
        eventSeq: event.seq,
        message: `No task_snapshot for revision ${event.revision} precedes evidence command ${evidenceId}.`,
      });
    }
    if (issues.length === issueCountBeforeClaim) verifiedClaimCount += 1;
  }

  return {
    passed: issues.length === 0,
    claimCount,
    verifiedClaimCount,
    issues,
  };
}

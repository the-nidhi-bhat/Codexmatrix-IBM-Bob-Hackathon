// ─────────────────────────────────────────────────────────────────────────────
//  Modernization operation catalogue — M3.1, DEFINITION ONLY
//
//  This file is the allowlist. It is the complete set of edits the backend is
//  ever willing to make to the legacy app, authored here, server-side, in full.
//
//  Why an allowlist rather than "the browser sends what to change": every value
//  a client could supply — file path, source text, replacement text, shell
//  command, executable, patch, repository path — is also a way to reach code
//  the user does not own. So the client gets to choose *which* operation runs,
//  by id, and nothing else. The bytes that land in the worktree come from
//  MODERNIZATION_OPERATIONS below, full stop.
//
//  What this file does NOT do (M3.1 scope):
//  - It does not apply anything. planOperation() only reads and returns the
//    resulting content; the future executor (M3.2) is what writes.
//  - It does not create a worktree, a branch, or a commit.
//  - It does not call tools/checkpoint.js, tools/validate.js or
//    tools/rollback.js, and it does not know they exist.
//  - It does not touch the root app. The operations below describe changes to
//    server/game/index.js and package.json; until an executor runs, those files
//    stay exactly as they are in the repository.
//
//  The exact-match contract, which the executor will rely on:
//  1. Only the relative file named by the catalogue is read, resolved under the
//     supplied root. An absolute path, a drive letter, or anything that escapes
//     the root is refused before a read is attempted.
//  2. The exact source string must occur EXACTLY ONCE. Zero occurrences means
//     the tree is not what the catalogue describes; more than one means the
//     match is ambiguous. Both are refused.
//  3. An operation applies all of its edits or none of them. One failing edit
//     fails the operation, and the plan is discarded whole.
//  4. Replacement text is only ever the catalogue's. No parameter, option or
//     overload accepts replacement text from a caller.
//
//  Line endings: the repo is LF (core.autocrlf=input, no .gitattributes), and
//  every exactSource below is a single line, so the match is CRLF-agnostic.
//  The one multi-line replacement uses \n to match the file it edits. If the
//  host ever checks the tree out as CRLF, that is the assumption to revisit —
//  the refusal mode is SOURCE_NOT_FOUND, never a silent partial edit.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

/**
 * `modernization` is a real planned step from ASSESS/PLAN.
 * `demo-regression` is a deliberate, labelled break used only to demonstrate
 * validation failure -> rollback -> recovery. It is never proposed as a fix.
 */
export type ModernizationOperationKind = "modernization" | "demo-regression";

export type ModernizationRisk = "low" | "medium" | "high";

/** One server-authored exact replacement inside one server-authored file. */
export interface ModernizationEdit {
  /** Repository-relative, POSIX-style. Never absolute, never from a caller. */
  file: string;
  /** Must occur exactly once in the file, or the edit is refused. */
  exactSource: string;
  /** Never from a caller. */
  exactReplacement: string;
}

export interface ModernizationOperation {
  /** Stable, kebab-case. This is the ONLY value a client may influence. */
  id: string;
  title: string;
  description: string;
  kind: ModernizationOperationKind;
  /** The finding or demo label this operation answers, e.g. "F-12". */
  finding: string;
  /** Where the intent is written down, for the audit trail. */
  reference: string;
  risk: ModernizationRisk;
  /** What this changes and what must stay green. Shown before a run. */
  impact: string;
  /** Subject line for the commit the executor will create. */
  commitMessage: string;
  edits: ModernizationEdit[];
}

// ── Operation 1: the real pending PLAN step ──────────────────────────────────

/**
 * F-12: node-expression-eval 0.1.x has no maintained release line and its
 * package is unmaintained on npm; expr-eval is the maintained successor with
 * the same `evaluate()` entry point. PLAN Step 3. Matches the shape of F-11,
 * which already replaced node-uuid with uuid@9.0.1 in this file's sibling
 * commit 6393892.
 */
export const F12_EXPRESSION_ENGINE: ModernizationOperation = {
  id: "f-12-expr-eval",
  title: "F-12: replace node-expression-eval with expr-eval",
  description:
    "Swaps the unmaintained expression parser dependency for its maintained successor. " +
    "The parser is constructed once at module load; every parser.evaluate() call site is " +
    "left untouched, so the only behavioural surface is the dependency itself.",
  kind: "modernization",
  finding: "F-12",
  reference: "PLAN.md Step 3 (F-12); ASSESS.md F-12",
  risk: "medium",
  impact:
    "server/game/index.js gains a Parser instance in place of the node-expression-eval " +
    "singleton; the root package.json dependency becomes expr-eval 2.x. The 18 " +
    "characterization tests re-run in the node:6 container against the real app and must " +
    "stay green, including the invalid-expression messages and the win/loss evaluation.",
  commitMessage: "refactor(game): replace node-expression-eval with expr-eval (F-12)",
  edits: [
    {
      file: "server/game/index.js",
      exactSource: "var parser = require('node-expression-eval');",
      exactReplacement:
        "var Parser = require('expr-eval').Parser;\nvar parser = new Parser();",
    },
    {
      file: "package.json",
      exactSource: '"node-expression-eval": "0.1.x"',
      exactReplacement: '"expr-eval": "2.x"',
    },
  ],
};

// ── Operation 2: the labelled demo regression ────────────────────────────────

/**
 * DEMO ONLY. This deliberately breaks the win condition so that the checkpoint
 * engine reports VALIDATION_FAILED, the rollback path has something to undo,
 * and recovery can be demonstrated end to end. It is not a modernization and
 * must never be presented as one; the kind is `demo-regression` so the UI can
 * label it, and the title says so in the first words.
 *
 * The win condition is `res === 0`; the seeded winning hand 7*4-3-1 evaluates
 * to 24, so changing the comparison to 25 makes every hand lose and the
 * win/loss assertions in legacy/get24-baseline/tests/game-events.test.js fail.
 */
export const DEMO_WIN_CONDITION_REGRESSION: ModernizationOperation = {
  id: "demo-break-win-condition",
  title: "DEMO (not a fix): break the win condition to exercise rollback",
  description:
    "Intentionally wrong, on purpose. Changes the win check so a hand can no longer win, " +
    "which makes the 18-test suite fail. Used only to demonstrate the full loop: apply -> " +
    "validate -> fail -> roll back -> recover. Never select this expecting an improvement.",
  kind: "demo-regression",
  finding: "DEMO",
  reference:
    "Demonstration only; the failing assertions are the win/loss checks in " +
    "legacy/get24-baseline/tests/game-events.test.js",
  risk: "high",
  impact:
    "server/game/index.js compares the evaluated total against 25 instead of 0, so no hand " +
    "can win. Every win/loss assertion in the 18-test characterization suite fails and the " +
    "checkpoint engine reports VALIDATION_FAILED. This is the intended outcome, not a bug.",
  commitMessage: "chore(demo): break win condition to exercise validation failure and rollback",
  edits: [
    {
      file: "server/game/index.js",
      exactSource: "if (res === 0) {",
      exactReplacement: "if (res === 25) {",
    },
  ],
};

/**
 * The whole allowlist. Append-only: removing an entry is a code change, and a
 * new entry is a reviewed code change.
 */
export const MODERNIZATION_OPERATIONS: readonly ModernizationOperation[] = Object.freeze([
  F12_EXPRESSION_ENGINE,
  DEMO_WIN_CONDITION_REGRESSION,
]);

/** The only supported way to go from a client-supplied id to an operation. */
export function getOperation(id: string): ModernizationOperation | undefined {
  return MODERNIZATION_OPERATIONS.find((op) => op.id === id);
}

/** Catalogue view for display. Carries no absolute path and no source text. */
export function describeOperations(): Array<{
  id: string;
  title: string;
  kind: ModernizationOperationKind;
  finding: string;
  risk: ModernizationRisk;
  impact: string;
  files: string[];
}> {
  return MODERNIZATION_OPERATIONS.map((op) => ({
    id: op.id,
    title: op.title,
    kind: op.kind,
    finding: op.finding,
    risk: op.risk,
    impact: op.impact,
    files: [...new Set(op.edits.map((e) => e.file))],
  }));
}

// ── exact-match contract ─────────────────────────────────────────────────────

export type EditFailureCode =
  | "FILE_OUTSIDE_ROOT"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_AMBIGUOUS"
  | "DUPLICATE_TARGET_FILE";

export interface EditSuccess {
  ok: true;
  content: string;
}

export interface EditFailure {
  ok: false;
  code: EditFailureCode;
  /** The catalogue's relative file, never a resolved absolute path. */
  file: string;
  /** How many times exactSource was found. -1 for path/duplicate refusals. */
  occurrences: number;
}

export type EditOutcome = EditSuccess | EditFailure;

export type PlanOutcome =
  | { ok: true; operationId: string; files: PlannedFile[] }
  | ({ ok: false; operationId: string } & EditFailure);

/** One file's before/after. Content only — nothing has been written. */
export interface PlannedFile {
  file: string;
  before: string;
  after: string;
}

/** Non-overlapping occurrences, so a repeated single char cannot loop forever. */
export function countOccurrences(content: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  for (let at = content.indexOf(needle); at !== -1; at = content.indexOf(needle, at + needle.length)) {
    count += 1;
  }
  return count;
}

/**
 * The exact-match contract, as a pure function over strings: no filesystem, no
 * process, no clock. Given the file's current content and a catalogue edit,
 * return the new content, or refuse. It cannot partially apply, because it
 * either returns a whole new string or returns nothing at all.
 */
export function applyExactEdit(content: string, edit: ModernizationEdit): EditOutcome {
  const occurrences = countOccurrences(content, edit.exactSource);
  if (occurrences === 0) {
    return { ok: false, code: "SOURCE_NOT_FOUND", file: edit.file, occurrences: 0 };
  }
  if (occurrences > 1) {
    return { ok: false, code: "SOURCE_AMBIGUOUS", file: edit.file, occurrences };
  }
  return { ok: true, content: content.replace(edit.exactSource, edit.exactReplacement) };
}

/**
 * Resolve a catalogue-relative file under root, or refuse. Defensive only — the
 * paths are server-authored — but it is what makes "resolve only the file the
 * catalogue names" a property of the code rather than of the caller's
 * discipline.
 */
function resolveInRoot(root: string, relative: string): string | null {
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) || relative.includes("\0")) {
    return null;
  }
  const full = path.resolve(root, relative);
  const rel = path.relative(root, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/**
 * READ-ONLY. Resolves and reads every file the operation names, applies every
 * edit in memory, and returns the resulting content — or the first refusal,
 * with no partial plan.
 *
 * `operation` is expected to be a value from MODERNIZATION_OPERATIONS (the
 * executor will look it up with getOperation(id)); the parameter exists so the
 * contract is testable in isolation.
 *
 * Nothing is written here. That is also how all-or-nothing is guaranteed: this
 * function cannot half-apply, because writing is somebody else's job and only
 * happens if ok is true.
 */
export function planOperation(root: string, operation: ModernizationOperation): PlanOutcome {
  const seen = new Set<string>();
  const files: PlannedFile[] = [];

  for (const edit of operation.edits) {
    // Two edits on one file would each be planned against the on-disk content
    // and the second would silently discard the first, so refuse instead.
    if (seen.has(edit.file)) {
      return { ok: false, operationId: operation.id, code: "DUPLICATE_TARGET_FILE", file: edit.file, occurrences: -1 };
    }
    seen.add(edit.file);

    const full = resolveInRoot(root, edit.file);
    if (full === null) {
      return { ok: false, operationId: operation.id, code: "FILE_OUTSIDE_ROOT", file: edit.file, occurrences: -1 };
    }

    let before: string;
    try {
      before = fs.readFileSync(full, "utf8");
    } catch {
      return {
        ok: false,
        operationId: operation.id,
        code: "SOURCE_NOT_FOUND",
        file: edit.file,
        occurrences: 0,
      };
    }

    const outcome = applyExactEdit(before, edit);
    if (!outcome.ok) {
      // outcome already carries ok: false plus the failure detail.
      return { operationId: operation.id, ...outcome };
    }
    files.push({ file: edit.file, before, after: outcome.content });
  }

  return { ok: true, operationId: operation.id, files };
}

/**
 * The checkpoint response contract, proven against the real decoder.
 *
 * Every checkpoint endpoint answers with the standard envelope and the view
 * inside it: `{ success: true, checkpointRun: { ... } }`
 * (backend/src/routes/checkpoint.ts). These tests exist because the client once
 * asserted the view on the ENVELOPE instead of on `checkpointRun`, so every
 * response was unreadable, `INVALID_RESPONSE` was raised, `verifyCheckpointRun()`
 * was never reached, and the real checkpoint engine never ran. The failure was
 * invisible in every backend test because the backend was always right.
 *
 * Two properties are pinned here:
 *
 *   1. a real envelope decodes, on all three callers, and the engine's result is
 *      passed through verbatim — no count is recomputed or restated;
 *   2. anything that is not a readable checkpoint run fails CLOSED with
 *      INVALID_RESPONSE, including the old flat-on-envelope shape.
 *
 * Run with `npm test` in frontend/ (node --test, no test framework).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCheckpointRun,
  getCheckpointRun,
  verifyCheckpointRun,
  WorkflowApiError,
} from "../src/api/workflowApi.ts";

const RUN_ID = "0b2a4d6c-1e3f-4a5b-8c9d-0e1f2a3b4c5d";
const CHECKPOINT_ID = "3f1b7c2e-9a4d-4c1e-8f2b-7d5e6a9c0b11";
const COMMIT = "d5c72df51e246f7d3a3d909313eefe18267fed54";
const REF = "lcw/modernization/82c7118c-47b4-46fc-985d-61f13718beba";

/** A checkpoint run as `toView()` builds it, with a real engine result inside. */
const VALID_VIEW = {
  id: CHECKPOINT_ID,
  analysisRunId: RUN_ID,
  status: "complete",
  subjectCommit: COMMIT.slice(0, 12),
  checkpointStatus: "VERIFIED",
  checkpoint: {
    status: "VERIFIED",
    modernizationStep: "replace node-uuid with uuid@9.0.1",
    startingCommit: "6393892aa1111111111111111111111111111aa",
    modernizationCommit: COMMIT,
    branch: REF,
    validationResult: {
      total: 18,
      passed: 18,
      failed: 0,
      skipped: 0,
      command: "node --test test/*.test.js",
      output: "# tests 18\n# pass 18\n# fail 0\n",
    },
  },
  refusal: null,
  cleanupWarning: false,
  createdAt: "2026-09-27T17:20:00.000Z",
  startedAt: "2026-09-27T17:20:01.000Z",
  finishedAt: "2026-09-27T17:22:41.000Z",
};

interface Capture {
  url: string;
  method: string;
  body: unknown;
}

/** Answer every request with `body`/`status` and record what was sent. */
function stubFetch(body: unknown, status = 200): Capture[] {
  const calls: Capture[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

async function rejectsWithCode(run: () => Promise<unknown>, code: string, phase = "VERIFY") {
  await assert.rejects(run, (err: unknown) => {
    if (!(err instanceof WorkflowApiError)) {
      throw new Error(`expected a WorkflowApiError, got ${String(err)}`);
    }
    assert.equal(err.code, code);
    assert.equal(err.phase, phase);
    return true;
  });
}

// ── 1. The documented envelope decodes ─────────────────────────────────────────

test("createCheckpointRun decodes { success: true, checkpointRun: <view> }", async () => {
  const calls = stubFetch({ success: true, checkpointRun: VALID_VIEW }, 201);
  const view = await createCheckpointRun(RUN_ID);

  assert.deepEqual(view, VALID_VIEW);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/checkpoint-runs");
  assert.equal(calls[0].method, "POST");
});

test("verifyCheckpointRun decodes the same envelope", async () => {
  const calls = stubFetch({ success: true, checkpointRun: VALID_VIEW });
  const view = await verifyCheckpointRun(CHECKPOINT_ID);

  assert.deepEqual(view, VALID_VIEW);
  assert.equal(calls[0].url, `/api/checkpoint-runs/${CHECKPOINT_ID}/verify`);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, undefined, "verify sends no body: the server owns the subject");
});

test("getCheckpointRun decodes the same envelope", async () => {
  const calls = stubFetch({ success: true, checkpointRun: VALID_VIEW });
  const view = await getCheckpointRun(CHECKPOINT_ID);

  assert.deepEqual(view, VALID_VIEW);
  assert.equal(calls[0].url, `/api/checkpoint-runs/${CHECKPOINT_ID}`);
  assert.equal(calls[0].method, "GET");
});

test("the engine's result is passed through verbatim, counts included", async () => {
  stubFetch({ success: true, checkpointRun: VALID_VIEW });
  const view = await createCheckpointRun(RUN_ID);
  const engine = view.checkpoint;

  assert.equal(engine?.status, "VERIFIED");
  assert.equal(view.checkpointStatus, "VERIFIED");
  // The counts are the engine's, not the client's: 18/18/0/0 exactly as sent.
  assert.deepEqual(
    {
      total: engine?.validationResult?.total,
      passed: engine?.validationResult?.passed,
      failed: engine?.validationResult?.failed,
      skipped: engine?.validationResult?.skipped,
    },
    { total: 18, passed: 18, failed: 0, skipped: 0 },
  );
  assert.equal(engine?.branch, REF);
  assert.equal(engine?.validationResult?.output, "# tests 18\n# pass 18\n# fail 0\n");
});

test("every lifecycle status the server can send is accepted", async () => {
  for (const status of ["created", "running", "refused", "failed"] as const) {
    stubFetch({ success: true, checkpointRun: { ...VALID_VIEW, status, checkpoint: null } });
    const view = await createCheckpointRun(RUN_ID);
    assert.equal(view.status, status);
  }
});

// ── 2. Everything else fails closed ────────────────────────────────────────────

test("a missing checkpointRun fails closed with INVALID_RESPONSE", async () => {
  stubFetch({ success: true }, 201);
  await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
});

test("a null checkpointRun fails closed with INVALID_RESPONSE", async () => {
  stubFetch({ success: true, checkpointRun: null }, 201);
  await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
});

test("the old flat-on-the-envelope shape fails closed with INVALID_RESPONSE", async () => {
  // Precisely the bug: a readable view sitting on the envelope instead of
  // inside it. Accepting it would let any response with these fields through.
  stubFetch({ ...VALID_VIEW, success: true }, 201);
  await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
});

test("a checkpointRun that is not an object fails closed with INVALID_RESPONSE", async () => {
  for (const bad of ["VERIFIED", 42, [], null]) {
    stubFetch({ success: true, checkpointRun: bad }, 201);
    await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
  }
});

test("an unknown status fails closed with INVALID_RESPONSE", async () => {
  stubFetch({ success: true, checkpointRun: { ...VALID_VIEW, status: "succeeded" } }, 201);
  await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
});

test("a missing id or analysisRunId fails closed with INVALID_RESPONSE", async () => {
  for (const key of ["id", "analysisRunId"] as const) {
    const view: Record<string, unknown> = { ...VALID_VIEW };
    delete view[key];
    stubFetch({ success: true, checkpointRun: view }, 201);
    await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
  }
});

test("a view missing a result field fails closed with INVALID_RESPONSE", async () => {
  for (const key of ["subjectCommit", "checkpointStatus", "checkpoint"] as const) {
    const view: Record<string, unknown> = { ...VALID_VIEW };
    delete view[key];
    stubFetch({ success: true, checkpointRun: view }, 201);
    await rejectsWithCode(() => createCheckpointRun(RUN_ID), "INVALID_RESPONSE");
  }
});

test("a non-JSON body fails closed with PARSE_ERROR, not INVALID_RESPONSE", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>proxy error</html>", { status: 200 })) as typeof fetch;
  await rejectsWithCode(() => createCheckpointRun(RUN_ID), "PARSE_ERROR");
});

// ── 3. Server errors and the trust boundary still pass through ────────────────

test("a server error envelope keeps the server's own code", async () => {
  for (const [status, code] of [
    [404, "CHECKPOINT_RUN_NOT_FOUND"],
    [409, "CHECKPOINT_ALREADY_COMPLETE"],
    [429, "CHECKPOINT_IN_PROGRESS"],
  ] as const) {
    stubFetch({ success: false, error: { code, message: "refused", phase: "VERIFY" } }, status);
    await rejectsWithCode(() => verifyCheckpointRun(CHECKPOINT_ID), code);
  }
});

test("a success:false body with an unreadable error fails closed as MALFORMED_ERROR", async () => {
  stubFetch({ success: false }, 500);
  await rejectsWithCode(() => verifyCheckpointRun(CHECKPOINT_ID), "MALFORMED_ERROR");
});

test("the client sends only the analysis run id, never a commit, ref or path", async () => {
  const calls = stubFetch({ success: true, checkpointRun: VALID_VIEW }, 201);
  await createCheckpointRun(RUN_ID);

  assert.deepEqual(calls[0].body, { analysisRunId: RUN_ID });
  const sent = JSON.stringify(calls[0].body);
  for (const forbidden of ["commit", "branch", "ref", "path", "cwd", "command", COMMIT, REF]) {
    assert.ok(!sent.includes(forbidden), `request body must not mention ${forbidden}`);
  }
});

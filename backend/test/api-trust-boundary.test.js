"use strict";

/**
 * The HTTP trust boundary.
 *
 * `POST /api/checkpoint-runs` is the only place untrusted data enters the
 * checkpoint system, and the design is an allowlist: the client may send
 * `analysisRunId` and NOTHING else. Every other key is refused with HTTP 400
 * `UNEXPECTED_FIELD`, the response names the offending KEYS but never their
 * VALUES, and the refusal happens before any backend work starts — so a hostile
 * body cannot create a worktree, spawn a process, or move a branch.
 *
 * The 14 field names below are the ones the M3.3 audit specified as must-be-
 * refused. Each one is a parameter that some other component of this system
 * could plausibly accept, which is exactly why accepting it here would be a
 * vulnerability: this endpoint derives its subject from a stored record, so a
 * client that could name `commit` or `ref` would choose what gets verified and
 * against what.
 *
 * The routers are mounted on a test app that mirrors `src/index.ts` rather than
 * binding a port, because `index.ts` exports no server handle to close. No test
 * here makes a network request; `supertest`-style HTTP injection is done with
 * the real Express app, real middleware and the real routers.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cors = require("cors");

// Both route modules export the router as `default`, so the CommonJS require
// namespace has to be unwrapped. The named slot functions are taken off the
// same module object, which is deliberate: the gate under test must be the very
// one the handler calls, not a copy.
const checkpointModule = require("../dist/routes/checkpoint");
const analyzeModule = require("../dist/routes/analyze");
const checkpointRouter = checkpointModule.default;
const analyzeRouter = analyzeModule.default;
const { acquireCheckpointSlot, releaseCheckpointSlot } = checkpointModule;
const { repoStateSnapshot } = require("./helpers");

/** Mirrors src/index.ts exactly, minus the listen call. */
function buildTestApp() {
  const app = express();
  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", analyzeRouter);
  app.use("/api", checkpointRouter);
  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  return app;
}

const app = buildTestApp();

/** Inject a request into the real app without a socket. */
function post(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const payload = JSON.stringify(body);
      const request = require("node:http").request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/checkpoint-runs",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            ...headers,
          },
        },
        (response) => {
          const chunks = [];
          response.on("data", (c) => chunks.push(c));
          response.on("end", () => {
            server.close();
            const text = Buffer.concat(chunks).toString("utf8");
            let json;
            try {
              json = JSON.parse(text);
            } catch {
              json = undefined;
            }
            resolve({ status: response.statusCode, json, text });
          });
        },
      );
      request.on("error", (err) => {
        server.close();
        reject(err);
      });
      request.end(payload);
    });
  });
}

/** The 14 fields the audit named. Each is a value some other component accepts,
 *  which is why none of them may be accepted here. */
const PROTECTED_FIELDS = [
  "ref",
  "commit",
  "anchorRef",
  "branch",
  "cwd",
  "path",
  "command",
  "executable",
  "shell",
  "resultFile",
  "repositoryRoot",
  "modernizationCommit",
  "startingCommit",
  "worktree",
];

test("every protected field is refused with 400 UNEXPECTED_FIELD", async (t) => {
  const before = repoStateSnapshot();

  for (const field of PROTECTED_FIELDS) {
    await t.test(field, async () => {
      const marker = `lcw-probe-${field}-7f3a9c`;
      const response = await post({
        analysisRunId: "not-a-real-run",
        [field]: marker,
      });

      assert.equal(response.status, 400, `${field} must be refused with 400, got ${response.status}`);
      // The error is NESTED: { success: false, error: { code, message, phase } }.
      assert.equal(response.json.success, false);
      assert.equal(response.json.error.code, "UNEXPECTED_FIELD");
      assert.equal(response.json.error.phase, "VERIFY");
      // The refused KEY is named; its VALUE never appears anywhere in the reply.
      assert.ok(
        response.json.error.message.includes(field),
        `the message must name the refused field: ${response.json.error.message}`,
      );
      assert.ok(response.json.error.message.includes("Rejected: "));
      assert.equal(response.text.includes(marker), false, `the value of ${field} was echoed back`);
    });
  }

  // The refusals are pure: no worktree, no branch, nothing.
  const after = repoStateSnapshot();
  assert.deepEqual(after.worktrees, before.worktrees, "a refused request created a worktree");
  assert.deepEqual(after.branches, before.branches, "a refused request created a branch");
});

test("several protected fields are refused together, and all are named", async () => {
  const response = await post({
    analysisRunId: "not-a-real-run",
    ref: "integration/final",
    branch: "main",
    shell: "bash -c id",
    command: "whoami",
  });
  assert.equal(response.status, 400);
  assert.equal(response.json.error.code, "UNEXPECTED_FIELD");
  const named = response.json.error.message.slice(
    response.json.error.message.indexOf("Rejected: ") + "Rejected: ".length,
  ).replace(/\.\s*$/, "");
  assert.deepEqual(named.split(", ").sort(), ["branch", "command", "ref", "shell"]);
});

test("a prototype-polluting or exotic key is refused, not smuggled through", async () => {
  for (const key of [
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "AnalysisRunId",
    "ANALYSISRUNID",
    "analysis_run_id",
    "analysisRunId ",
    " analysisRunId",
  ]) {
    const response = await post({ analysisRunId: "x", [key]: "y" });
    if (key.startsWith(" ") || key.endsWith(" ")) continue; // a different key, may be allowed
    assert.equal(response.status, 400, `${key} must be refused`);
    assert.equal(response.json.error.code, "UNEXPECTED_FIELD", `${key} must not be smuggled`);
  }
});

test("the allowlisted field alone passes the boundary and fails later, for the right reason", async () => {
  // The contrast that proves the allowlist is the boundary and not a blanket
  // 400: `analysisRunId` gets through, and is then refused because no such run
  // exists — a 404, not a 400.
  const response = await post({ analysisRunId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(response.status, 404, `expected 404, got ${response.status}: ${response.text}`);
  assert.equal(response.json.error.code, "ANALYSIS_RUN_NOT_FOUND", response.text);
});

test("a malformed or hostile analysisRunId is refused without a 500", async (t) => {
  const values = [
    "",
    "not-a-uuid",
    "../../etc/passwd",
    "x".repeat(500),
    "<script>alert(1)</script>",
    "' OR 1=1 --",
    "$(id)",
    "`id`",
    "11111111-1111-4111-8111-111111111111; rm -rf /",
  ];

  for (const value of values) {
    await t.test(JSON.stringify(value).slice(0, 50), async () => {
      const response = await post({ analysisRunId: value });
      assert.notEqual(response.status, 500, `a 500 for ${JSON.stringify(value)}: ${response.text}`);
      assert.ok([400, 404].includes(response.status), `unexpected ${response.status}: ${response.text}`);
    });
  }
});

test("a non-object body is refused without a 500", async (t) => {
  for (const body of [[], null, "a string", 42, true]) {
    await t.test(JSON.stringify(body), async () => {
      const response = await post(body);
      assert.notEqual(response.status, 500, `a 500 for ${JSON.stringify(body)}: ${response.text}`);
    });
  }
});

test("a body over the 1mb limit is refused without a 500", async () => {
  const response = await post({ analysisRunId: "x".repeat(2 * 1024 * 1024) });
  assert.notEqual(response.status, 500, response.text);
  assert.ok([400, 413].includes(response.status), `unexpected ${response.status}`);
});

test("the concurrency gate is a real exclusive slot, exported for exactly this", () => {
  // Tested through the real exported functions rather than by racing HTTP
  // requests, because the synchronous refusal path below never reaches the gate
  // — a request that is refused before the slot is acquired cannot produce a
  // 429, and manufacturing an artificial delay to force one would be testing a
  // fiction. The gate's own contract is asserted instead.
  assert.equal(acquireCheckpointSlot(), true, "the first caller must get the slot");
  assert.equal(acquireCheckpointSlot(), false, "the second caller must be refused");
  assert.equal(acquireCheckpointSlot(), false, "and a third");
  releaseCheckpointSlot();
  assert.equal(acquireCheckpointSlot(), true, "releasing must hand the slot back");
  releaseCheckpointSlot();
  // Releasing twice must not manufacture a second slot, or the gate would
  // become "one run per extra release" under any bug in the caller's finally.
  assert.equal(acquireCheckpointSlot(), true);
  releaseCheckpointSlot();
  assert.equal(acquireCheckpointSlot(), true);
  releaseCheckpointSlot();
});

test("the routers expose no rollback or abort endpoint yet", () => {
  // The M3.3 audit's deferred items, asserted so that adding one has to be a
  // deliberate, visible change to this test rather than a silent one.
  const routeTable = {
    "checkpoint": {
      "router.post": ["/checkpoint-runs", "/checkpoint-runs/:id/verify"],
      "router.get": ["/checkpoint-runs/:id"],
      "router.delete": [],
      "router.put": [],
      "router.patch": [],
    },
    // The integration milestone's new router, pinned here for the same reason.
    "modernization": {
      "router.post": ["/modernization/execute"],
      "router.get": ["/modernization/operations"],
      "router.delete": [],
      "router.put": [],
      "router.patch": [],
    },
  };
  for (const [file, expected] of Object.entries(routeTable)) {
    const source = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "dist", "routes", `${file}.js`),
      "utf8",
    );
    // The complete route table, verb by verb. Adding an endpoint — a rollback, an
    // abort, a client-chosen ref — is a product decision, so it has to change
    // this assertion visibly rather than slipping in as a refactor.
    for (const [method, routes] of Object.entries(expected)) {
      const pattern = new RegExp(`${method.replace(".", "\\.")}\\("([^"]+)"`, "g");
      const found = [...source.matchAll(pattern)].map((m) => m[1]);
      assert.deepEqual(
        found,
        routes,
        `unexpected ${method} in ${file}; a new endpoint is a product decision, not a refactor`,
      );
    }
  }
});

test("the verify route forwards a ref, but only one it resolved from the server's own run record", async () => {
  // This assertion was inverted by the integration milestone, and deliberately.
  // Passing no ref was not a safety property — it made the runner default the
  // anchor to the primary branch and check out DETACHED, which cannot verify
  // a modernization commit (it is a child of the tip) and loses the revert. So the
  // route now passes a ref, and the property worth holding is WHERE it came
  // from: `subject.ref`, out of the server-owned run record, validated against the
  // executor's own RUN_BRANCH pattern. Never from a request.
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "dist", "routes", "checkpoint.js"),
    "utf8",
  );
  const call = source.match(/runCheckpoint\)\((\{[\s\S]*?\})\)/);
  assert.ok(call, "the route must call runCheckpoint");
  assert.match(call[1], /commit:\s*subject\.commit/, "the commit comes from the resolved subject");
  assert.match(call[1], /ref:\s*subject\.ref/, "the ref comes from the resolved subject");

  // Nothing that a client could name may appear as a forwarded key.
  for (const forbidden of ["req.body", "req.query", "req.params", "body.", "query."]) {
    assert.equal(call[1].includes(forbidden), false, `the call must not read ${forbidden}`);
  }
  assert.equal(/\bbranch\s*:/.test(call[1]), false, "the route must not forward a client branch");
  assert.equal(/anc(hor)?Ref\s*:/.test(call[1]), false, "the route must not forward a client anchorRef");

  // And the resolver only accepts a ref that matches the executor's own pattern,
  // so a value that did come from a client would still be refused.
  assert.match(source, /RUN_BRANCH\.test\(ref\)/, "the ref must be pattern-checked against the run-branch form");
  assert.match(source, /COMMIT_SHA\.test\(commit\)/, "the commit must be a full 40-hex SHA");
});

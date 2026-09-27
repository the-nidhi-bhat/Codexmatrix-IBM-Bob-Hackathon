"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const { loadServerConfig } = require("../dist/config");
const { createApp } = require("../dist/app");

const TOKEN = randomBytes(32).toString("hex");
const FRONTEND_ORIGIN = "https://legacy-code-whisperer.example";

async function withServer(config, run) {
  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("local configuration preserves the loopback and port defaults", () => {
  assert.deepEqual(loadServerConfig({}), { port: 3001, host: "127.0.0.1", apiAuthToken: undefined, frontendOrigin: undefined });
  assert.deepEqual(loadServerConfig({ PORT: "4310", HOST: "localhost" }), {
    port: 4310, host: "localhost", apiAuthToken: undefined, frontendOrigin: undefined,
  });
});

test("production and external binds fail closed without authentication and a production origin", () => {
  assert.throws(() => loadServerConfig({ HOST: "0.0.0.0" }), /API_AUTH_TOKEN is required/);
  assert.throws(() => loadServerConfig({ NODE_ENV: "production" }), /API_AUTH_TOKEN is required/);
  assert.throws(() => loadServerConfig({ NODE_ENV: "production", API_AUTH_TOKEN: TOKEN }), /FRONTEND_ORIGIN is required/);
  assert.throws(() => loadServerConfig({ PORT: "0" }), /PORT must be an integer/);
  assert.throws(() => loadServerConfig({ PORT: "12abc" }), /PORT must be an integer/);
  assert.throws(() => loadServerConfig({ FRONTEND_ORIGIN: "https://example.test/path" }), /without a path/);
  assert.throws(() => loadServerConfig({ FRONTEND_ORIGIN: "http://example.test" }), /must use HTTPS/);
  assert.throws(() => loadServerConfig({ HOST: "0.0.0.0", API_AUTH_TOKEN: "too-short" }), /at least 32 characters/);
  assert.deepEqual(
    loadServerConfig({ NODE_ENV: "production", PORT: "8080", API_AUTH_TOKEN: TOKEN, FRONTEND_ORIGIN }),
    { port: 8080, host: "0.0.0.0", apiAuthToken: TOKEN, frontendOrigin: FRONTEND_ORIGIN },
  );
});

test("health stays public while sensitive API routes require a valid bearer token", async () => {
  await withServer({ port: 3001, host: "127.0.0.1", apiAuthToken: TOKEN, frontendOrigin: FRONTEND_ORIGIN }, async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json().then((body) => body.ok), true);

    const missing = await fetch(`${base}/api/modernization/operations`);
    assert.equal(missing.status, 401);
    const missingBody = await missing.text();
    assert.equal(missingBody.includes(TOKEN), false);

    const invalid = await fetch(`${base}/api/modernization/operations`, {
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(invalid.status, 401);

    const valid = await fetch(`${base}/api/modernization/operations`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).success, true);
  });
});

test("CORS permits exact local/configured origins and Authorization preflight only", async () => {
  await withServer({ port: 3001, host: "127.0.0.1", apiAuthToken: TOKEN, frontendOrigin: FRONTEND_ORIGIN }, async (base) => {
    for (const origin of ["http://localhost:5173", "http://localhost:4173", FRONTEND_ORIGIN]) {
      const response = await fetch(`${base}/api/health`, { headers: { origin } });
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    }

    const denied = await fetch(`${base}/api/health`, { headers: { origin: "https://attacker.example" } });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);

    const preflight = await fetch(`${base}/api/modernization/execute`, {
      method: "OPTIONS",
      headers: {
        origin: FRONTEND_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
    assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/i);
  });
});

test("local app remains usable without a token when it uses the local configuration", async () => {
  await withServer(loadServerConfig({}), async (base) => {
    const response = await fetch(`${base}/api/modernization/operations`, {
      headers: { origin: "http://localhost:5173" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  });
});

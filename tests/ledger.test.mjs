import assert from "node:assert/strict";
import test, { beforeEach, after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";

const mockedEnv = {};
globalThis.__candyMockEnv = mockedEnv;
const result = await build({
  entryPoints: [new URL("../lib/lab-store.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "local-database-only", setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "environment", namespace: "local-only" }));
    builder.onLoad({ filter: /.*/, namespace: "local-only" }, () => ({ contents: "export const env = globalThis.__candyMockEnv;", loader: "js" }));
  } }],
});
const store = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
let sqlite;
const migrationDir = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDir)).filter(f => f.endsWith(".sql")).sort().map(f => readFile(new URL(f, migrationDir), "utf8")));
beforeEach(() => {
  sqlite?.close(); sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys=ON");
  for (const sql of migrations) sqlite.exec(sql);
  const prepare = (sql, params = []) => ({
    bind: (...values) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...params) }),
    execute: () => ({ success: true, results: sqlite.prepare(sql).all(...params) }),
  });
  mockedEnv.DB = { prepare, batch: async statements => {
    sqlite.exec("BEGIN");
    try { const rows = statements.map(s => s.execute()); sqlite.exec("COMMIT"); return rows; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
});
after(() => { sqlite?.close(); delete globalThis.__candyMockEnv; });
const generation = (overrides = {}) => ({ requestId: crypto.randomUUID(), tier: "gold", count: 5, leadingZeros: false, ...overrides });
const observation = (overrides = {}) => ({ requestId: crypto.randomUUID(), code: "47788", outcome: "rejected", observedTier: null, note: "Already used", ...overrides });

test("generation is idempotent and preserves exactly one batch", async () => {
  const input = generation(); const a = await store.generate(input); const b = await store.generate(input);
  assert.deepEqual(a.candidates, b.candidates);
  assert.equal((await store.loadState()).candidates.length, 5);
  await assert.rejects(store.generate({ ...input, tier: "bronze" }), e => e.status === 409);
});
test("concurrent generation does not allocate a code twice", async () => {
  const [a, b] = await Promise.all([store.generate(generation({ count: 25 })), store.generate(generation({ count: 25 }))]);
  const codes = [...a.candidates, ...b.candidates].map(c => c.code);
  assert.equal(codes.length, 50); assert.equal(new Set(codes).size, 50);
  for (const code of ["93619", "22340", "50384", "47788", "10459", "47724", "10455", "81755"]) assert.ok(!codes.includes(code));
});
test("concurrent retries return the same allocation", async () => {
  const input = generation(); const [a, b] = await Promise.all([store.generate(input), store.generate(input)]);
  assert.deepEqual(a.candidates, b.candidates); assert.equal((await store.loadState()).candidates.length, 5);
});
test("recording is append-only and request retries cannot duplicate an attempt", async () => {
  const input = observation(); await store.recordAttempt(input); await store.recordAttempt(input);
  const state = await store.loadState(); const results = state.attempts.filter(a => a.code === "47788");
  assert.equal(results.length, 3); assert.equal(results.filter(a => a.outcome === "accepted").length, 1);
  assert.equal(results.at(-1).note, "Already used");
  await assert.rejects(store.recordAttempt({ ...input, note: "Changed contents" }), e => e.status === 409);
});
test("recorded source and first use persist across reload and retries", async () => {
  const input = observation({ code: "33404", outcome: "accepted", observedTier: "gold", testContext: { origin: "calculated", use: "first", campaign: "" } });
  await store.recordAttempt(input);
  await store.recordAttempt(input);
  const attempts = (await store.loadState()).attempts.filter(a => a.code === "33404");
  assert.equal(attempts.length, 1);
  assert.deepEqual(attempts[0].testContext, input.testContext);
  await assert.rejects(store.recordAttempt({ ...input, testContext: { ...input.testContext, use: "retry" } }), e => e.status === 409);
});
test("observations capture actual counterexamples without rewriting the checksum model", async () => {
  await store.recordAttempt(observation({ code: "10455", outcome: "accepted", observedTier: "diamond", note: "Local test counterexample" }));
  const records = (await store.loadState()).attempts.filter(a => a.code === "10455");
  assert.deepEqual(records.map(a => a.outcome), ["rejected", "accepted"]);
  assert.equal(records.at(-1).observedTier, "diamond");
});
test("malformed writes fail before changing the ledger", async () => {
  await assert.rejects(store.recordAttempt(observation({ observedTier: "gold" })));
  await assert.rejects(store.recordAttempt(observation({ code: "1234" })));
  await assert.rejects(store.generate(generation({ count: 26 })));
  await assert.rejects(store.generate(generation({ tier: "diamond" })));
  assert.equal((await store.loadState()).attempts.length, 9);
});
test("JSON body limits and cross-origin writes are rejected", async () => {
  await assert.rejects(store.readInput(new Request("https://test.local/api/attempts", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://elsewhere.local" }, body: "{}" })), e => e.status === 403);
  await assert.rejects(store.readInput(new Request("https://test.local/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(9000) }) })), e => e.status === 413);
});

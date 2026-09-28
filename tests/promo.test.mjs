import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: [new URL("../lib/promo.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const p = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

test("reproduces the fitted Gold examples and preserves corrected observed tiers", () => {
  for (const code of ["93619", "22340", "50384", "47788"]) assert.equal(p.candidateFor(code.slice(0, 3), "gold"), code);
  assert.equal(p.candidateFor("104", "bronze"), "10459");
  assert.deepEqual(p.summarizeCode("47724", p.SEED_ATTEMPTS).observedTiers, ["silver"]);
  assert.equal(p.candidateFor("477", "bronze"), "47724", "the legacy Bronze arithmetic misclassifies a confirmed Silver code");
});
test("distinguishes arithmetic mismatch from a reported rejection", () => {
  assert.equal(p.checkCode("10455").matches, false);
  assert.equal(p.checkCode("81755").matches, true);
  assert.equal(p.checkCode("81755").alternativeMatches, false);
  assert.equal(p.summarizeCode("81755", p.SEED_ATTEMPTS).accepted, 0);
});
test("preserves the acceptance and the failed retry, including tier", () => {
  const record = p.summarizeCode("47788", p.SEED_ATTEMPTS);
  assert.equal(record.accepted, 1); assert.equal(record.rejected, 1);
  assert.deepEqual(record.observedTiers, ["gold"]);
  assert.equal(record.latest.outcome, "rejected");
  assert.ok(record.history.every(a => a.recordedAt === null));
});
test("all 2,000 serial/tier combinations are five digits with nonnegative modular checksums", () => {
  for (const tier of ["gold", "bronze"]) for (let n = 0; n < 1000; n++) {
    const code = p.candidateFor(String(n).padStart(3, "0"), tier);
    assert.match(code, /^[0-9]{5}$/);
    const digits = [...code].map(Number);
    assert.equal((8 * digits[0] + 8 * digits[1] + 4 * digits[2] - digits[3] + 100) % 10, digits[4]);
  }
});
test("candidate pools skip known codes and ambiguous tiers, and respect leading zeros", () => {
  const blocked = new Set(p.SEED_ATTEMPTS.map(a => a.code));
  const allPools = [];
  for (const tier of ["gold", "bronze"]) {
    const pool = p.candidatePool(tier, blocked, true);
    assert.equal(new Set(pool).size, pool.length);
    assert.ok(pool.every(c => !blocked.has(c) && p.checkCode(c).predictedTiers.length === 1));
    assert.ok(pool.some(c => c.startsWith("0")));
    assert.ok(p.candidatePool(tier, blocked, false).every(c => !c.startsWith("0")));
    allPools.push(...pool);
  }
  assert.equal(new Set(allPools).size, allPools.length);
});
test("never fills a batch with repeats and fails explicitly on exhaustion", () => {
  const pool = p.candidatePool("gold", new Set(), false);
  const chosen = p.sampleCandidates(pool, 25);
  assert.equal(new Set(chosen).size, 25);
  assert.ok(chosen.every(c => pool.includes(c)));
  assert.throws(() => p.sampleCandidates([], 1), /remain/);
  for (const n of [0, 26, -1, 2.5]) assert.throws(() => p.sampleCandidates(pool, n));
});
test("does not accept malformed codes, numeric coercion, or unsupported tier guesses", () => {
  for (const c of [12345, "1234", "123456", "12a45", "１２３４５", "", null]) assert.throws(() => p.normalizeCode(c));
  assert.equal(p.normalizeCode(" 01234 "), "01234");
  assert.throws(() => p.candidateFor("477", "diamond"));
  assert.throws(() => p.candidatePool("silver", new Set()));
});

test("new Gold tests falsify both checksum hypotheses as acceptance filters", () => {
  const failedCodes = ["55528", "56148", "57457", "92233"];
  const state = {
    attempts: [
      ...p.SEED_ATTEMPTS,
      ...failedCodes.map((code, i) => ({ id: `new-${i}`, code, outcome: "rejected", observedTier: null, note: "", recordedAt: "2026-09-28T09:44:00.000Z", source: "manual" })),
      { id: "silver-1", code: "47724", outcome: "accepted", observedTier: "silver", note: "", recordedAt: "2026-09-28T09:42:00.000Z", source: "manual" },
      { id: "silver-2", code: "47724", outcome: "accepted", observedTier: "silver", note: "", recordedAt: "2026-09-28T09:43:00.000Z", source: "manual" },
    ],
    candidates: failedCodes.map((code, i) => ({ code, predictedTier: "gold", generatedAt: "2026-09-28T09:40:00.000Z", requestId: `request-${i}` })),
  };
  const result = p.modelEvidence(state);
  assert.deepEqual(result.generated.gold, { accepted: 0, rejected: 4, untested: 0 });
  assert.deepEqual(result.generated.bronze, { accepted: 0, rejected: 0, untested: 0 });
  assert.deepEqual(result.rejectedMatchingBoth.sort(), failedCodes.sort());
  assert.deepEqual(result.tierConflicts, []);
  assert.equal(p.summarizeCode("47724", state.attempts).accepted, 3);
  assert.equal(p.candidatePool("gold", new Set([...state.candidates.map(c => c.code), ...state.attempts.map(a => a.code)])).includes("55528"), false);
});

test("every affine digit checksum that fits the six accepted examples still fits the four new failures", () => {
  const accepted = ["93619", "22340", "50384", "47788", "10459", "47724"];
  const rejected = ["55528", "56148", "57457", "92233"];
  const digits = s => [...s].map(Number);
  const [first] = accepted.map(digits);
  let matches = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) for (let d = 0; d < 10; d++) {
    const constant = p.mod10(first[4] - a * first[0] - b * first[1] - c * first[2] - d * first[3]);
    const passes = s => { const x = digits(s); return p.mod10(a * x[0] + b * x[1] + c * x[2] + d * x[3] + constant) === x[4]; };
    if (accepted.every(passes)) { matches++; assert.ok(rejected.every(passes)); }
  }
  assert.equal(matches, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: [new URL("../lib/math-audit.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const { mathAudit, quadraticChecksumCount } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const codes = ["93619", "22340", "50384", "47788", "10459", "47724", "33404"];
const attempts = codes.map((code, i) => ({ id: String(i), code, outcome: "accepted", observedTier: code === "10459" ? "bronze" : code === "47724" ? "silver" : "gold", note: "", recordedAt: null, source: "manual" }));
test("proves Gold parity contradiction and rules out shared affine tier residues", () => {
  const audit = mathAudit({ attempts, candidates: [{ code: "33404", predictedTier: "bronze" }] });
  assert.deepEqual(audit.parityContradictions, [["93619", "33404"]]);
  assert.equal(audit.sharedLinearTierScores, 0);
  assert.equal(audit.quadraticChecksumCoefficients, "200000000");
  assert.deepEqual(audit.calculatedAccepted, ["33404"]);
  assert.equal(audit.notKnownCalculatedChecksumRules, 2);
});
test("detects calculated origin without candidate history and ignores duplicate attempts", () => {
  const state = { attempts: [...attempts, { ...attempts.at(-1), id: "duplicate", testContext: { origin: "calculated", use: "first", campaign: "" } }], candidates: [] };
  assert.deepEqual(mathAudit(state).calculatedAccepted, ["33404"]);
  assert.equal(quadraticChecksumCount([...codes, ...codes]), 200000000n);
});
test("quadratic counts handle contradictory data, and empty history makes no claim", () => {
  assert.equal(quadraticChecksumCount(["10000", "10001"]), 0n);
  const audit = mathAudit({ attempts: [], candidates: [] });
  assert.equal(audit.sharedLinearTierScores, null);
  assert.equal(audit.quadraticChecksumCoefficients, null);
  assert.equal(audit.notKnownCalculatedChecksumRules, null);
});

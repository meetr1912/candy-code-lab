import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: [new URL("../lib/experiments.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const { experimentEvidence, historyEvents, checksumEvidence } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

test("counts distinct observed tiers, excludes retries from fitting, and keeps every event", () => {
  const attempts = [
    ...["93619", "22340", "50384", "47788"].map((code, index) => ({ id: `gold-${index}`, code, outcome: "accepted", observedTier: "gold", note: "", recordedAt: null, source: "transcript" })),
    { id: "bronze", code: "10459", outcome: "accepted", observedTier: "bronze", note: "", recordedAt: null, source: "transcript" },
    { id: "silver", code: "47724", outcome: "accepted", observedTier: "silver", note: "", recordedAt: null, source: "transcript" },
    { id: "silver-retry", code: "47724", outcome: "accepted", observedTier: "silver", note: "retry", recordedAt: "2026-09-28T12:00:00.000Z", source: "manual" },
    { id: "synthetic-rejection", code: "55528", outcome: "rejected", observedTier: null, note: "not issued", recordedAt: "2026-09-28T12:05:00.000Z", source: "manual" },
  ];
  const candidates = [{ code: "55528", predictedTier: "gold", generatedAt: "2026-09-28T11:00:00.000Z", requestId: "reservation" }];
  const evidence = experimentEvidence({ attempts, candidates });
  assert.deepEqual(evidence.tiers.map(t => [t.distinctCodes, t.fittingAffineRules]), [[4, 1], [1, 1000], [1, 1000], [0, null]]);
  assert.deepEqual(evidence.silverOnBronzeRule, ["47724"]);
  assert.equal(evidence.syntheticRejected, 1);
  const events = historyEvents({ attempts, candidates });
  assert.equal(events.length, 9);
  assert.equal(events[0].id, "synthetic-rejection");
  assert.equal(events.at(-1).id, "silver");
});
test("compares distinct tagged first uses and leaves legacy attempts unclassified", () => {
  const attempt = (id, code, outcome, origin, use, recordedAt) => ({ id, code, outcome, observedTier: null, note: "", recordedAt, source: "manual", testContext: { origin, use, campaign: "batch A" } });
  const attempts = [attempt("retry", "10000", "rejected", "backend-issued", "retry", "2026-09-28T12:03:00Z"), attempt("first", "10000", "accepted", "backend-issued", "first", "2026-09-28T12:00:00Z"), attempt("duplicate", "10000", "accepted", "backend-issued", "first", "2026-09-28T12:01:00Z"), attempt("calc", "20000", "rejected", "calculated", "first", "2026-09-28T12:02:00Z"), { id: "old", code: "30000", outcome: "accepted", observedTier: null, note: "", recordedAt: null, source: "transcript" }];
  assert.deepEqual(experimentEvidence({ attempts, candidates: [] }).firstUse, { "backend-issued": { accepted: 1, rejected: 0 }, calculated: { accepted: 0, rejected: 1 } });
});
test("33404 falsifies the simple Gold digit rule while confirming one generated candidate", () => {
  const codes = ["93619", "22340", "50384", "47788", "33404"];
  const attempts = codes.map((code, index) => ({ id: `gold-${index}`, code, outcome: "accepted", observedTier: "gold", note: "", recordedAt: null, source: "manual" }));
  const candidates = [{ code: "33404", predictedTier: "bronze", generatedAt: "2026-09-06T18:05:33.825Z", requestId: "batch" }];
  const evidence = experimentEvidence({ attempts, candidates });
  assert.equal(evidence.tiers[0].distinctCodes, 5);
  assert.equal(evidence.tiers[0].fittingAffineRules, 0);
  assert.equal(evidence.syntheticAccepted, 1);
});
test("all known outcomes leave one affine checksum that still matches thirteen rejections", () => {
  const accepted = ["93619", "22340", "50384", "47788", "10459", "47724", "33404"];
  const rejected = ["10455", "81755", "92233", "57457", "56148", "55528", "33706", "81386", "66713", "62482", "45831", "43493", "77066", "53202"];
  assert.deepEqual(checksumEvidence(accepted, rejected), { fittingRules: 1, rejectedMatchingBest: 13, distinctRejected: 14, uniqueWeights: [8, 8, 4, 9, 0] });
  const attempts = [...accepted.map((code, i) => ({ id: `a-${i}`, code, outcome: "accepted", observedTier: i < 4 || code === "33404" ? "gold" : code === "10459" ? "bronze" : "silver", note: "", recordedAt: null, source: "manual" })), ...rejected.map((code, i) => ({ id: `r-${i}`, code, outcome: "rejected", observedTier: null, note: "", recordedAt: null, source: "manual" }))];
  const candidates = [...["33706", "55528", "56148", "57457", "92233"].map(code => ({ code, predictedTier: "gold", generatedAt: "2026-09-28T09:40:22.615Z", requestId: "g" })), ...["33404", "81386", "66713", "62482", "45831", "43493", "77066", "53202"].map(code => ({ code, predictedTier: "bronze", generatedAt: "2026-09-28T09:40:22.615Z", requestId: "b" }))];
  const evidence = experimentEvidence({ attempts, candidates });
  assert.deepEqual(evidence.cohorts.map(c => [c.accepted, c.rejected]), [[0, 5], [1, 7]]);
  assert.deepEqual(evidence.awardedDifferentTier, ["33404"]);
  assert.equal(evidence.tiers[0].fittingAffineRules, 0);
});

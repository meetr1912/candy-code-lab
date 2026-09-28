import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: [new URL("../lib/experiments.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const { experimentEvidence, historyEvents } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

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

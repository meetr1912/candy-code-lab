import { checkCode, summarizeCode, type Attempt, type LabState, type Tier } from "./promo";

export type TierEvidence = { tier: Tier; distinctCodes: number; fittingAffineRules: number | null };
export type FirstUseEvidence = { accepted: number; rejected: number };
export type ChecksumEvidence = { fittingRules: number; rejectedMatchingBest: number | null; distinctRejected: number; uniqueWeights: number[] | null };

// Exhaust the 100,000 affine checksums: d5 = (a*d1+b*d2+c*d3+d*d4+k) mod 10.
// Rejections are diagnostic; a correct checksum may still be unissued or spent.
export function checksumEvidence(accepted: readonly string[], rejected: readonly string[]): ChecksumEvidence {
  if (!accepted.length) return { fittingRules: 0, rejectedMatchingBest: null, distinctRejected: rejected.length, uniqueWeights: null };
  const positives = accepted.map(code => [...code].map(Number));
  const negatives = rejected.map(code => [...code].map(Number));
  let fittingRules = 0, rejectedMatchingBest = Infinity, uniqueWeights: number[] | null = null;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++)
    for (let d = 0; d < 10; d++) for (let k = 0; k < 10; k++) {
      const matches = (digits: number[]) => (a * digits[0] + b * digits[1] + c * digits[2] + d * digits[3] + k) % 10 === digits[4];
      if (!positives.every(matches)) continue;
      fittingRules++;
      uniqueWeights = fittingRules === 1 ? [a, b, c, d, k] : null;
      rejectedMatchingBest = Math.min(rejectedMatchingBest, negatives.filter(matches).length);
    }
  return { fittingRules, rejectedMatchingBest: Number.isFinite(rejectedMatchingBest) ? rejectedMatchingBest : null, distinctRejected: rejected.length, uniqueWeights };
}

// Count fourth-digit rules of the form (a*d1 + b*d2 + c*d3 + k) mod 10.
// This describes arithmetic fit only. It cannot establish redeemability.
export function countAffineTierRules(codes: readonly string[]): number | null {
  if (codes.length === 0) return null;
  const digits = codes.map(code => [...code].map(Number));
  let count = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++)
    for (let c = 0; c < 10; c++) for (let k = 0; k < 10; k++)
      if (digits.every(d => (a * d[0] + b * d[1] + c * d[2] + k) % 10 === d[3])) count++;
  return count;
}

export function experimentEvidence(state: LabState) {
  const codes = [...new Set(state.attempts.filter(a => a.outcome === "accepted").map(a => a.code))];
  const rejected = [...new Set(state.attempts.filter(a => a.outcome === "rejected" && !codes.includes(a.code)).map(a => a.code))];
  const accepted = codes.map(code => ({ code, tiers: summarizeCode(code, state.attempts).observedTiers }));
  const tiers: TierEvidence[] = (["gold", "bronze", "silver", "diamond"] as Tier[]).map(tier => {
    const matches = accepted.filter(a => a.tiers.length === 1 && a.tiers[0] === tier).map(a => a.code);
    return { tier, distinctCodes: matches.length, fittingAffineRules: countAffineTierRules(matches) };
  });
  const synthetic = state.candidates.filter(c => state.attempts.some(a => a.code === c.code));
  const syntheticAccepted = synthetic.filter(c => state.attempts.some(a => a.code === c.code && a.outcome === "accepted"));
  const syntheticRejected = synthetic.filter(c => state.attempts.some(a => a.code === c.code && a.outcome === "rejected") && !syntheticAccepted.some(a => a.code === c.code));
  const cohorts = (["gold", "bronze"] as const).map(rule => ({ rule,
    accepted: syntheticAccepted.filter(c => c.predictedTier === rule).length,
    rejected: syntheticRejected.filter(c => c.predictedTier === rule).length,
    untested: state.candidates.filter(c => c.predictedTier === rule && !state.attempts.some(a => a.code === c.code)).length,
  }));
  const awardedDifferentTier = syntheticAccepted.filter(c => !summarizeCode(c.code, state.attempts).observedTiers.includes(c.predictedTier)).map(c => c.code);
  const silverOnBronzeRule = accepted.filter(a => a.tiers.includes("silver") && checkCode(a.code).predictedTiers.includes("bronze")).map(a => a.code);
  const firstUse: Record<"backend-issued" | "calculated", FirstUseEvidence> = {
    "backend-issued": { accepted: 0, rejected: 0 }, calculated: { accepted: 0, rejected: 0 },
  };
  const counted = new Set<string>();
  for (const attempt of [...state.attempts].sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""))) {
    const context = attempt.testContext;
    if (!context || context.use !== "first" || context.origin === "unknown" || counted.has(attempt.code)) continue;
    counted.add(attempt.code);
    firstUse[context.origin][attempt.outcome]++;
  }
  return { tiers, checksum: checksumEvidence(codes, rejected), cohorts, awardedDifferentTier, syntheticAccepted: syntheticAccepted.length, syntheticRejected: syntheticRejected.length, silverOnBronzeRule, firstUse };
}

export type HistoryEvent =
  | { kind: "attempt"; id: string; at: string | null; attempt: Attempt }
  | { kind: "generated"; id: string; at: string; code: string; predictedTier: string };

export function historyEvents(state: LabState): HistoryEvent[] {
  const events: HistoryEvent[] = [
    ...state.attempts.map(a => ({ kind: "attempt" as const, id: a.id, at: a.recordedAt, attempt: a })),
    ...state.candidates.map(c => ({ kind: "generated" as const, id: `${c.requestId}:${c.code}`, at: c.generatedAt, code: c.code, predictedTier: c.predictedTier })),
  ];
  // Undated reference observations stay in their reported order after timed events.
  return events.sort((a, b) => a.at === null && b.at === null ? 0 : a.at === null ? 1 : b.at === null ? -1 : b.at.localeCompare(a.at));
}

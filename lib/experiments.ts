import { checkCode, summarizeCode, type Attempt, type LabState, type Tier } from "./promo";

export type TierEvidence = { tier: Tier; distinctCodes: number; fittingAffineRules: number | null };

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
  const accepted = codes.map(code => ({ code, tiers: summarizeCode(code, state.attempts).observedTiers }));
  const tiers: TierEvidence[] = (["gold", "bronze", "silver", "diamond"] as Tier[]).map(tier => {
    const matches = accepted.filter(a => a.tiers.length === 1 && a.tiers[0] === tier).map(a => a.code);
    return { tier, distinctCodes: matches.length, fittingAffineRules: countAffineTierRules(matches) };
  });
  const synthetic = state.candidates.filter(c => state.attempts.some(a => a.code === c.code));
  const syntheticAccepted = synthetic.filter(c => state.attempts.some(a => a.code === c.code && a.outcome === "accepted"));
  const syntheticRejected = synthetic.filter(c => state.attempts.some(a => a.code === c.code && a.outcome === "rejected") && !syntheticAccepted.some(a => a.code === c.code));
  const silverOnBronzeRule = accepted.filter(a => a.tiers.includes("silver") && checkCode(a.code).predictedTiers.includes("bronze")).map(a => a.code);
  return { tiers, syntheticAccepted: syntheticAccepted.length, syntheticRejected: syntheticRejected.length, silverOnBronzeRule };
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

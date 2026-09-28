export type TargetTier = "gold" | "bronze";
export type Tier = TargetTier | "silver" | "diamond";
export type Outcome = "accepted" | "rejected";
export type Attempt = {
  id: string;
  code: string;
  outcome: Outcome;
  observedTier: Tier | null;
  note: string;
  recordedAt: string | null;
  source: "transcript" | "manual";
};
export type Candidate = {
  code: string;
  predictedTier: TargetTier;
  generatedAt: string;
  requestId: string;
};
export type LabState = { attempts: Attempt[]; candidates: Candidate[] };

// Report order only: the archive did not contain actual attempt timestamps.
export const SEED_ATTEMPTS: Attempt[] = [
  { id: "archive-01", code: "93619", outcome: "accepted", observedTier: "gold", note: "Initial seed; later identified as Gold.", recordedAt: null, source: "transcript" },
  { id: "archive-02", code: "22340", outcome: "accepted", observedTier: "gold", note: "Initial seed; later identified as Gold.", recordedAt: null, source: "transcript" },
  { id: "archive-03", code: "50384", outcome: "accepted", observedTier: "gold", note: "Initial seed; later identified as Gold.", recordedAt: null, source: "transcript" },
  { id: "archive-04", code: "10455", outcome: "rejected", observedTier: null, note: "Reported failure; exact machine response not supplied.", recordedAt: null, source: "transcript" },
  { id: "archive-05", code: "47788", outcome: "accepted", observedTier: "gold", note: "Reported working; later identified as Gold.", recordedAt: null, source: "transcript" },
  { id: "archive-06", code: "10459", outcome: "accepted", observedTier: "bronze", note: "Reported working; later identified as Bronze.", recordedAt: null, source: "transcript" },
  { id: "archive-07", code: "47788", outcome: "rejected", observedTier: null, note: "Reported failure on a second attempt. Cause unknown; the earlier acceptance is preserved.", recordedAt: null, source: "transcript" },
  { id: "archive-08", code: "81755", outcome: "rejected", observedTier: null, note: "Reported failure despite matching the original checksum hypothesis.", recordedAt: null, source: "transcript" },
  { id: "archive-09", code: "47724", outcome: "accepted", observedTier: "silver", note: "Reported working and confirmed as Silver.", recordedAt: null, source: "transcript" },
];

export const mod10 = (value: number) => ((value % 10) + 10) % 10;

export function normalizeCode(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]{5}$/.test(value.trim())) {
    throw new Error("Enter exactly five digits. Keep any leading zero.");
  }
  return value.trim();
}

export function checksum(payload: string): number {
  if (!/^[0-9]{4}$/.test(payload)) throw new Error("The payload must contain four digits.");
  const [a, b, c, d] = [...payload].map(Number);
  return mod10(8 * a + 8 * b + 4 * c + 9 * d);
}

export function tierDigit(serial: string, tier: TargetTier): number {
  if (!/^[0-9]{3}$/.test(serial)) throw new Error("Enter a three-digit serial.");
  const [a, b, c] = [...serial].map(Number);
  if (tier === "gold") return mod10(8 * a + 7 * c + 7);
  if (tier === "bronze") return mod10(-a - b - c);
  throw new Error("There is no supported generator rule for that tier.");
}

export function candidateFor(serial: string, tier: TargetTier): string {
  const payload = serial + tierDigit(serial, tier);
  return payload + checksum(payload);
}

export function checkCode(input: string) {
  const code = normalizeCode(input);
  const [a, b, c, d, supplied] = [...code].map(Number);
  const expected = checksum(code.slice(0, 4));
  const matches = supplied === expected;
  const predictedTiers = matches
    ? (["gold", "bronze"] as TargetTier[]).filter(t => tierDigit(code.slice(0, 3), t) === d)
    : [];
  return {
    code, expected, supplied, matches, predictedTiers,
    weightedSum: 8 * a + 8 * b + 4 * c + 9 * d,
    alternativeMatches: mod10(8 * a + 8 * b + 9 * c + 4 * d + 5) === supplied,
  };
}

export function candidatePool(tier: TargetTier, excluded: ReadonlySet<string>, leadingZeros = false): string[] {
  if (tier !== "gold" && tier !== "bronze") throw new Error("Unknown tier rule.");
  const result: string[] = [];
  for (let n = leadingZeros ? 0 : 100; n < 1000; n++) {
    const serial = String(n).padStart(3, "0");
    // A candidate matching both tier hypotheses cannot distinguish the tier.
    if (tierDigit(serial, "gold") === tierDigit(serial, "bronze")) continue;
    const code = candidateFor(serial, tier);
    if (!excluded.has(code)) result.push(code);
  }
  return result;
}

export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new Error("Invalid random range.");
  const limit = Math.floor(2 ** 32 / max) * max;
  const values = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % max;
}

export function sampleCandidates(pool: readonly string[], count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 25) throw new Error("Choose between 1 and 25 codes.");
  if (pool.length < count) throw new Error(`Only ${pool.length} unrecorded candidates remain for these settings.`);
  const copy = [...pool];
  for (let i = 0; i < count; i++) {
    const j = i + secureRandomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function summarizeCode(code: string, attempts: readonly Attempt[]) {
  const history = attempts.filter(a => a.code === code);
  const accepted = history.filter(a => a.outcome === "accepted");
  const rejected = history.filter(a => a.outcome === "rejected");
  const observedTiers = [...new Set(accepted.map(a => a.observedTier).filter((t): t is Tier => t !== null))];
  return { accepted: accepted.length, rejected: rejected.length, observedTiers, latest: history.at(-1) ?? null, history };
}

// Evaluate only observations, not the examples that were used to fit a rule.
// Count distinct tested codes, since repeat redemptions need not be independent.
export function modelEvidence(state: LabState) {
  const byCode = new Map<string, ReturnType<typeof summarizeCode>>();
  for (const { code } of state.attempts) {
    if (!byCode.has(code)) byCode.set(code, summarizeCode(code, state.attempts));
  }
  const generated = { gold: { accepted: 0, rejected: 0, untested: 0 }, bronze: { accepted: 0, rejected: 0, untested: 0 } };
  for (const candidate of state.candidates) {
    const history = byCode.get(candidate.code);
    const result = !history ? "untested" : history.accepted ? "accepted" : history.rejected ? "rejected" : "untested";
    generated[candidate.predictedTier][result]++;
  }
  const rejectedMatchingBoth = [...byCode].filter(([code, history]) => history.rejected > 0 && history.accepted === 0 && checkCode(code).matches && checkCode(code).alternativeMatches).map(([code]) => code);
  const tierConflicts = [...byCode].filter(([, history]) => history.observedTiers.length > 1).map(([code]) => code);
  return { generated, rejectedMatchingBoth, tierConflicts };
}

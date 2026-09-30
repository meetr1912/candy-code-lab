import { summarizeCode, type LabState } from "./promo";
import { checksumEvidence } from "./experiments";

// Z/10Z is not a field. Solve/rank separately over F2 and F5, then use CRT.
function rank(rows: number[][], prime: 2 | 5) {
  const mod = (n: number) => ((n % prime) + prime) % prime;
  const matrix = rows.map(row => row.map(mod));
  let pivotRow = 0;
  for (let col = 0; col < (matrix[0]?.length ?? 0); col++) {
    const pivot = matrix.findIndex((row, i) => i >= pivotRow && row[col] !== 0);
    if (pivot < 0) continue;
    [matrix[pivotRow], matrix[pivot]] = [matrix[pivot], matrix[pivotRow]];
    const inverse = Array.from({ length: prime - 1 }, (_, i) => i + 1).find(n => mod(n * matrix[pivotRow][col]) === 1)!;
    matrix[pivotRow] = matrix[pivotRow].map(n => mod(n * inverse));
    for (let i = 0; i < matrix.length; i++) {
      if (i === pivotRow) continue;
      const scale = matrix[i][col];
      matrix[i] = matrix[i].map((n, j) => mod(n - scale * matrix[pivotRow][j]));
    }
    pivotRow++;
    if (pivotRow === matrix.length) break;
  }
  return pivotRow;
}

// Count coefficient vectors, not distinct polynomial functions or validated models.
export function quadraticChecksumCount(codes: string[]) {
  const distinct = [...new Set(codes)];
  if (!distinct.length) return null;
  const matrix = distinct.map(code => {
    const d = [...code.slice(0, 4)].map(Number);
    const features = [1, ...d];
    for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) features.push(d[i] * d[j]);
    return features;
  });
  const augmented = matrix.map((row, i) => [...row, Number(distinct[i][4])]);
  const r2 = rank(matrix, 2), r5 = rank(matrix, 5);
  if (rank(augmented, 2) !== r2 || rank(augmented, 5) !== r5) return BigInt(0);
  return BigInt(2) ** BigInt(15 - r2) * BigInt(5) ** BigInt(15 - r5);
}

export function mathAudit(state: LabState) {
  const accepted = [...new Set(state.attempts.filter(a => a.outcome === "accepted").map(a => a.code))];
  const labeled = accepted.map(code => ({ code, tiers: summarizeCode(code, state.attempts).observedTiers }))
    .filter(row => row.tiers.length === 1);
  const gold = labeled.filter(row => row.tiers[0] === "gold").map(row => row.code);
  const parityContradictions: string[][] = [];
  for (let i = 0; i < gold.length; i++) for (let j = i + 1; j < gold.length; j++) {
    if ([0, 1, 2].every(k => Number(gold[i][k]) % 2 === Number(gold[j][k]) % 2)
      && Number(gold[i][3]) % 2 !== Number(gold[j][3]) % 2) parityContradictions.push([gold[i], gold[j]]);
  }
  const observedTiers = [...new Set(labeled.map(row => row.tiers[0]))];
  let sharedLinearTierScores: number | null = null;
  if (observedTiers.length >= 2) {
    sharedLinearTierScores = 0;
    const digits = labeled.map(row => [...row.code.slice(0, 4)].map(Number));
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++)
      for (let c = 0; c < 10; c++) for (let d = 0; d < 10; d++) {
        const residues = new Map<string, number>();
        let valid = true;
        for (let i = 0; i < labeled.length; i++) {
          const value = (a * digits[i][0] + b * digits[i][1] + c * digits[i][2] + d * digits[i][3]) % 10;
          const tier = labeled[i].tiers[0];
          if (residues.has(tier) && residues.get(tier) !== value) { valid = false; break; }
          residues.set(tier, value);
        }
        if (valid && new Set(residues.values()).size === residues.size) sharedLinearTierScores++;
      }
  }
  const knownCalculated = new Set([
    ...state.candidates.map(c => c.code),
    ...state.attempts.filter(a => a.testContext?.origin === "calculated").map(a => a.code),
  ]);
  const notKnownCalculated = accepted.filter(code => !knownCalculated.has(code));
  return {
    parityContradictions, sharedLinearTierScores,
    quadraticChecksumCoefficients: quadraticChecksumCount(accepted)?.toString() ?? null,
    calculatedAccepted: accepted.filter(code => knownCalculated.has(code)),
    notKnownCalculatedCount: notKnownCalculated.length,
    notKnownCalculatedChecksumRules: notKnownCalculated.length ? checksumEvidence(notKnownCalculated, []).fittingRules : null,
  };
}

import { z } from "zod";
import { SEED_ATTEMPTS, candidatePool, sampleCandidates } from "./promo";

const code = z.string().regex(/^\d{5}$/);
const tier = z.enum(["gold", "bronze", "silver", "diamond"]);
const timestamp = z.string().datetime();
const attempt = z.object({
  id: z.string().min(1).max(100), code, outcome: z.enum(["accepted", "rejected"]),
  observedTier: tier.nullable(), note: z.string().max(500),
  recordedAt: timestamp.nullable(), source: z.enum(["transcript", "manual"]),
}).refine(a => a.outcome !== "rejected" || a.observedTier === null);
const candidate = z.object({ code, predictedTier: z.enum(["gold", "bronze"]), generatedAt: timestamp, requestId: z.string().uuid() });
const stateSchema = z.object({ attempts: z.array(attempt), candidates: z.array(candidate) });
const generation = z.object({ requestId: z.string().uuid(), tier: z.enum(["gold", "bronze"]), count: z.number().int().min(1).max(25), leadingZeros: z.boolean() });
const record = z.object({ requestId: z.string().uuid(), code, outcome: z.enum(["accepted", "rejected"]), observedTier: tier.nullable(), note: z.string().max(500).transform(s => s.trim()) })
  .refine(a => a.outcome !== "rejected" || a.observedTier === null, "Rejected attempts cannot establish a tier.");
const schema = stateSchema.extend({
  format: z.literal("candy-code-ledger/v2"),
  migratedAt: timestamp.nullable(),
  requests: z.array(z.object({ id: z.string().uuid(), parameters: z.string(), codes: z.array(code) })),
});
export type Ledger = z.infer<typeof schema>;
export function initialLedger(): Ledger {
  return { format: "candy-code-ledger/v2", migratedAt: null, attempts: structuredClone(SEED_ATTEMPTS), candidates: [], requests: [] };
}
export function parseLedger(value: unknown): Ledger {
  const ledger = schema.parse(value);
  for (const entries of [ledger.attempts.map(a => a.id), ledger.candidates.map(c => c.code), ledger.requests.map(r => r.id)]) {
    if (new Set(entries).size !== entries.length) throw new Error("The ledger contains duplicate identifiers. Repair it before saving.");
  }
  for (const seed of SEED_ATTEMPTS) {
    if (JSON.stringify(ledger.attempts.find(a => a.id === seed.id)) !== JSON.stringify(seed)) throw new Error("The ledger is missing an original reference result.");
  }
  for (const request of ledger.requests) {
    if (request.codes.some(c => !ledger.candidates.some(candidate => candidate.code === c && candidate.requestId === request.id))) throw new Error("The ledger contains an incomplete generation request.");
  }
  return ledger;
}
export function mergeExport(ledger: Ledger, value: unknown): Ledger {
  const imported = stateSchema.parse(value);
  const next = structuredClone(ledger);
  for (const a of imported.attempts) {
    const prior = next.attempts.find(p => p.id === a.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(a)) throw new Error(`Conflicting attempt ${a.id}; import stopped.`);
    if (!prior) next.attempts.push(a);
  }
  for (const c of imported.candidates) {
    const prior = next.candidates.find(p => p.code === c.code);
    if (prior && JSON.stringify(prior) !== JSON.stringify(c)) throw new Error(`Conflicting candidate ${c.code}; import stopped.`);
    if (!prior) next.candidates.push(c);
  }
  // Require the full original export, not an empty file that would lose history.
  for (const seed of SEED_ATTEMPTS) {
    if (!imported.attempts.some(a => JSON.stringify(a) === JSON.stringify(seed))) throw new Error("Import the complete history export from the original app.");
  }
  next.migratedAt = new Date().toISOString();
  return parseLedger(next);
}
export function applyOperation(ledger: Ledger, path: string, input: unknown): { ledger: Ledger; result: unknown; changed: boolean } {
  if (!ledger.migratedAt) throw new Error("Import the original app's latest history before generating or recording codes.");
  const next = structuredClone(ledger);
  if (path === "/api/generate") {
    const { requestId, ...parameters } = generation.parse(input);
    const signature = JSON.stringify(parameters);
    const prior = next.requests.find(r => r.id === requestId);
    if (prior) {
      if (prior.parameters !== signature) throw new Error("That request was already used with different settings.");
      return { ledger, changed: false, result: { candidates: prior.codes.map(code => next.candidates.find(c => c.code === code)!), repeated: true } };
    }
    if (next.candidates.some(c => c.requestId === requestId)) throw new Error("That identifier belongs to an imported generation request.");
    const excluded = new Set([...next.attempts.map(a => a.code), ...next.candidates.map(c => c.code)]);
    const codes = sampleCandidates(candidatePool(parameters.tier, excluded, parameters.leadingZeros), parameters.count);
    const candidates = codes.map(code => ({ code, predictedTier: parameters.tier, generatedAt: new Date().toISOString(), requestId }));
    next.candidates.push(...candidates);
    next.requests.push({ id: requestId, parameters: signature, codes });
    return { ledger: next, changed: true, result: { candidates, repeated: false } };
  }
  if (path === "/api/attempts") {
    const { requestId, ...details } = record.parse(input);
    const prior = next.attempts.find(a => a.id === requestId);
    if (prior) {
      if (prior.code !== details.code || prior.outcome !== details.outcome || prior.observedTier !== details.observedTier || prior.note !== details.note) throw new Error("That request was already saved with different details.");
      return { ledger, changed: false, result: prior };
    }
    const saved = { id: requestId, ...details, recordedAt: new Date().toISOString(), source: "manual" as const };
    next.attempts.push(saved);
    return { ledger: next, changed: true, result: saved };
  }
  throw new Error("Unknown ledger operation.");
}

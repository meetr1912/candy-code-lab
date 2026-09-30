import { env } from "cloudflare:workers";
import {
  SEED_ATTEMPTS, candidatePool, sampleCandidates, normalizeCode,
  type Attempt, type Candidate, type LabState, type TargetTier, type Tier,
} from "./promo";

export class LabError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function db() {
  if (!env.DB) throw new LabError("The saved history is temporarily unavailable. Please try again.", 503);
  return env.DB;
}

export async function loadState(): Promise<LabState> {
  const result = await db().batch([
    db().prepare("SELECT code, predicted_tier AS predictedTier, generated_at AS generatedAt, request_id AS requestId FROM candidates ORDER BY generated_at, code"),
    db().prepare("SELECT id, code, outcome, observed_tier AS observedTier, note, recorded_at AS recordedAt, test_context AS testContextJson FROM attempts ORDER BY recorded_at, rowid"),
  ]);
  return {
    candidates: result[0].results as unknown as Candidate[],
    attempts: [...SEED_ATTEMPTS, ...(result[1].results as unknown as (Attempt & { testContextJson: string | null })[]).map(({ testContextJson, ...a }) => ({ ...a, ...(testContextJson ? { testContext: JSON.parse(testContextJson) as Attempt["testContext"] } : {}), source: "manual" as const }))],
  };
}

function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value)) throw new LabError("A valid request identifier is required.");
  return value;
}

export async function generate(input: Record<string, unknown>) {
  const id = requestId(input.requestId);
  if (input.tier !== "gold" && input.tier !== "bronze") throw new LabError("Only Gold and Bronze have existing candidate rules.");
  const tier = input.tier as TargetTier;
  const count = input.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 25) throw new LabError("Choose between 1 and 25 codes.");
  if (typeof input.leadingZeros !== "boolean") throw new LabError("The leading-zero setting is required.");
  const leadingZeros = input.leadingZeros;
  const parameters = JSON.stringify({ tier, count, leadingZeros });
  const lookup = () => db().prepare("SELECT parameters, response_json AS responseJson FROM generation_requests WHERE id = ?").bind(id).first<{ parameters: string; responseJson: string }>();
  const prior = await lookup();
  if (prior) {
    if (prior.parameters !== parameters) throw new LabError("That request was already used with different settings.", 409);
    return { candidates: JSON.parse(prior.responseJson) as Candidate[], repeated: true };
  }
  // A D1 batch commits the request and its codes together; a uniqueness conflict
  // rolls back the entire batch. Reload the pool before retrying a collision.
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadState();
    const excluded = new Set([...state.attempts.map(a => a.code), ...state.candidates.map(c => c.code)]);
    const pool = candidatePool(tier, excluded, leadingZeros);
    if (pool.length < count) throw new LabError(`Only ${pool.length} unrecorded candidates remain. Choose a smaller batch.`, 409);
    const generatedAt = new Date().toISOString();
    const chosen = sampleCandidates(pool, count).map(code => ({ code, predictedTier: tier, generatedAt, requestId: id }));
    try {
      await db().batch([
        db().prepare("INSERT INTO generation_requests (id, parameters, response_json, created_at) VALUES (?, ?, ?, ?)").bind(id, parameters, JSON.stringify(chosen), generatedAt),
        ...chosen.map(c => db().prepare("INSERT INTO candidates (code, predicted_tier, generated_at, request_id) VALUES (?, ?, ?, ?)").bind(c.code, c.predictedTier, generatedAt, id)),
      ]);
      return { candidates: chosen, repeated: false };
    } catch (error) {
      const completed = await lookup();
      if (completed) {
        if (completed.parameters !== parameters) throw new LabError("That request was already used with different settings.", 409);
        return { candidates: JSON.parse(completed.responseJson) as Candidate[], repeated: true };
      }
      if (!/UNIQUE constraint failed/.test(String(error))) throw error;
    }
  }
  throw new LabError("Another generation used the same candidates. Please try again.", 409);
}

export async function recordAttempt(input: Record<string, unknown>) {
  const id = requestId(input.requestId);
  let code: string;
  try { code = normalizeCode(input.code); } catch (error) { throw new LabError((error as Error).message); }
  if (input.outcome !== "accepted" && input.outcome !== "rejected") throw new LabError("Choose accepted or rejected.");
  const outcome = input.outcome;
  const observedTier = input.observedTier ?? null;
  if (observedTier !== null && (typeof observedTier !== "string" || !["gold", "bronze", "silver", "diamond"].includes(observedTier))) throw new LabError("Choose an observed tier or Unknown.");
  if (outcome === "rejected" && observedTier !== null) throw new LabError("A rejected attempt cannot establish a tier.");
  if (typeof input.note !== "string" || input.note.length > 500) throw new LabError("Keep the note to 500 characters or fewer.");
  const note = input.note.trim();
  const testContext = input.testContext;
  if (testContext !== undefined && (testContext === null || typeof testContext !== "object" || Array.isArray(testContext) ||
    !["backend-issued", "calculated", "unknown"].includes((testContext as Attempt["testContext"])?.origin ?? "") ||
    !["first", "retry", "unknown"].includes((testContext as Attempt["testContext"])?.use ?? "") ||
    typeof (testContext as Attempt["testContext"])?.campaign !== "string" || (testContext as Attempt["testContext"])!.campaign.length > 80)) throw new LabError("Choose valid test conditions.");
  const contextJson = testContext === undefined ? null : JSON.stringify(testContext);
  const recordedAt = new Date().toISOString();
  await db().prepare("INSERT INTO attempts (id, code, outcome, observed_tier, note, recorded_at, test_context) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .bind(id, code, outcome, observedTier, note, recordedAt, contextJson).run();
  const saved = await db().prepare("SELECT id, code, outcome, observed_tier AS observedTier, note, recorded_at AS recordedAt, test_context AS testContextJson FROM attempts WHERE id = ?").bind(id).first<Attempt & { testContextJson: string | null }>();
  if (!saved || saved.code !== code || saved.outcome !== outcome || saved.observedTier !== observedTier || saved.note !== note || saved.testContextJson !== contextJson) {
    throw new LabError("That request was already saved with different details.", 409);
  }
  const { testContextJson, ...details } = saved;
  return { ...details, ...(testContextJson ? { testContext: JSON.parse(testContextJson) as Attempt["testContext"] } : {}), observedTier: saved.observedTier as Tier | null, source: "manual" as const };
}

export async function readInput(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new LabError("This request must come from the generator.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new LabError("Use a JSON request.", 415);
  if (Number(request.headers.get("content-length") || 0) > 8192) throw new LabError("The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LabError("A request body is required.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 8192) { await reader.cancel(); throw new LabError("The request is too large.", 413); }
    chunks.push(chunk.value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new LabError("The request contains invalid JSON."); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new LabError("The request must be an object.");
  return value;
}

export function failure(error: unknown) {
  if (error instanceof LabError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Candy Code Lab storage operation failed.");
  return Response.json({ error: "The saved history is temporarily unavailable. Your input has been kept; please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

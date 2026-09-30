import { sql } from "drizzle-orm";
import { sqliteTable, text, index, check } from "drizzle-orm/sqlite-core";

export const generationRequests = sqliteTable("generation_requests", {
  id: text("id").primaryKey(),
  parameters: text("parameters").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const candidates = sqliteTable("candidates", {
  code: text("code").primaryKey(),
  predictedTier: text("predicted_tier").notNull(),
  generatedAt: text("generated_at").notNull(),
  requestId: text("request_id").notNull().references(() => generationRequests.id),
}, table => [
  index("idx_candidates_request_id").on(table.requestId),
  check("candidate_code_format", sql`length(${table.code}) = 5 AND ${table.code} NOT GLOB '*[^0-9]*'`),
  check("candidate_tier_allowed", sql`${table.predictedTier} IN ('gold', 'bronze')`),
]);

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  outcome: text("outcome").notNull(),
  observedTier: text("observed_tier"),
  note: text("note").notNull().default(""),
  recordedAt: text("recorded_at").notNull(),
  testContext: text("test_context"),
}, table => [
  index("idx_attempts_code_recorded_at").on(table.code, table.recordedAt),
  check("attempt_code_format", sql`length(${table.code}) = 5 AND ${table.code} NOT GLOB '*[^0-9]*'`),
  check("attempt_outcome_allowed", sql`${table.outcome} IN ('accepted', 'rejected')`),
  check("attempt_tier_allowed", sql`${table.observedTier} IS NULL OR ${table.observedTier} IN ('gold', 'bronze', 'silver', 'diamond')`),
  check("rejected_has_no_tier", sql`${table.outcome} = 'accepted' OR ${table.observedTier} IS NULL`),
]);

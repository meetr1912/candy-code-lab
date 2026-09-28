"use client";

import { useMemo, useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { experimentEvidence, historyEvents } from "@/lib/experiments";
import type { LabState } from "@/lib/promo";

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ResearchPanel({ state, onRefresh }: { state: LabState; onRefresh: () => void }) {
  const [limit, setLimit] = useState(30);
  const evidence = useMemo(() => experimentEvidence(state), [state]);
  const events = useMemo(() => historyEvents(state), [state]);
  return <details className="panel research-panel">
    <summary><ChartNoAxesColumn size={20} aria-hidden="true" />Research plan & full event log<span className="small-note">{state.attempts.length} attempts · {state.candidates.length} generated</span></summary>
    <div className="research-content">
      <div className="panel-heading"><h2>Tier evidence</h2><Button variant="outline" onClick={onRefresh}>Refresh</Button></div>
      <p className="section-copy">One accepted code is one independent example, even if it was tried repeatedly. These counts show arithmetic fit, not whether a new code can be redeemed.</p>
      <Table className="history-table"><TableHeader><TableRow><TableHead>Tier awarded</TableHead><TableHead>Distinct codes</TableHead><TableHead>Fourth-digit formulas still fitting</TableHead></TableRow></TableHeader><TableBody>{evidence.tiers.map(row => <TableRow key={row.tier}><TableCell>{title(row.tier)}</TableCell><TableCell>{row.distinctCodes}</TableCell><TableCell>{row.fittingAffineRules === null ? "No data" : row.fittingAffineRules.toLocaleString()}</TableCell></TableRow>)}</TableBody></Table>
      <p className="prediction-note">Generated candidates tested: {evidence.syntheticAccepted} accepted, {evidence.syntheticRejected} rejected. Confirmed Silver code {evidence.silverOnBronzeRule.join(", ") || "—"} fits the old Bronze arithmetic, which cannot classify tiers.</p>
      <p className="section-copy">Tagged, distinct first-use codes: backend-issued {evidence.firstUse["backend-issued"].accepted} accepted / {evidence.firstUse["backend-issued"].rejected} rejected; calculated {evidence.firstUse.calculated.accepted} accepted / {evidence.firstUse.calculated.rejected} rejected. Older attempts without this metadata are preserved but excluded from this comparison.</p>
      <h2>Next useful experiment</h2>
      <p className="section-copy">For each tier, collect 10 unused backend-issued codes from one campaign: use 5 to explore rules and hold 5 back to test predictions. Compare 10 calculated codes from that same campaign on first use. Record the source and first-use fields below the result, the campaign, tier awarded, exact machine response, and time. Keep retries separate. If issued codes work while calculated codes fail, inspect the issuance list before fitting another digit rule. Bronze and Silver each have one distinct accepted code; Diamond has none.</p>
      <h2>Full event log</h2>
      <ol className="attempt-list">{events.slice(0, limit).map(event => <li key={event.id}><span className="attempt-number">{event.kind === "generated" ? "+" : event.attempt.outcome === "accepted" ? "✓" : "×"}</span><div><div className="attempt-title"><strong>{event.kind === "attempt" ? title(event.attempt.outcome) : "Generated"} · <code>{event.kind === "attempt" ? event.attempt.code : event.code}</code></strong><span className="small-note">{event.at ? new Date(event.at).toLocaleString() : "Original conversation · date unknown"}</span></div><p>{event.kind === "attempt" ? `${event.attempt.observedTier ? title(event.attempt.observedTier) + " · " : ""}${event.attempt.note || "No machine response recorded."}${event.attempt.testContext ? ` · ${event.attempt.testContext.origin} · ${event.attempt.testContext.use} use${event.attempt.testContext.campaign ? ` · ${event.attempt.testContext.campaign}` : ""}` : ""}` : `${title(event.predictedTier)} arithmetic · not yet tested`}</p></div></li>)}</ol>
      {events.length > limit && <Button variant="outline" onClick={() => setLimit(n => n + 30)}>Show 30 more events</Button>}
    </div>
  </details>;
}

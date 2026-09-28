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
      <h2>Next useful experiment</h2>
      <p className="section-copy">From the same campaign, compare fresh codes issued by your vending backend with codes computed from the checksum. For each first redemption, note its source, campaign, expected tier, exact response, and time. Log retries as separate attempts. If issued codes work while computed codes fail, investigate the issuance list before fitting another digit formula. Bronze and Silver each have one distinct accepted code; Diamond has none.</p>
      <h2>Full event log</h2>
      <ol className="attempt-list">{events.slice(0, limit).map(event => <li key={event.id}><span className="attempt-number">{event.kind === "generated" ? "+" : event.attempt.outcome === "accepted" ? "✓" : "×"}</span><div><div className="attempt-title"><strong>{event.kind === "attempt" ? title(event.attempt.outcome) : "Generated"} · <code>{event.kind === "attempt" ? event.attempt.code : event.code}</code></strong><span className="small-note">{event.at ? new Date(event.at).toLocaleString() : "Original conversation · date unknown"}</span></div><p>{event.kind === "attempt" ? `${event.attempt.observedTier ? title(event.attempt.observedTier) + " · " : ""}${event.attempt.note || "No machine response recorded."}` : `${title(event.predictedTier)} arithmetic · not yet tested`}</p></div></li>)}</ol>
      {events.length > limit && <Button variant="outline" onClick={() => setLimit(n => n + 30)}>Show 30 more events</Button>}
    </div>
  </details>;
}

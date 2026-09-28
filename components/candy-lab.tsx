"use client";

import { useEffect, useRef, useState } from "react";
import { Candy, Check, CheckCircle2, Copy, Download, FlaskConical, History, Loader2, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEED_ATTEMPTS, checkCode, summarizeCode, modelEvidence, candidatePool, type Attempt, type Candidate, type LabState, type TargetTier } from "@/lib/promo";
import ResearchPanel from "@/components/research-panel";
import { experimentEvidence } from "@/lib/experiments";

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
async function serverApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? { cache: "no-store" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let result;
  try { result = await response.json(); } catch { throw new Error("The saved history could not be reached. Please try again."); }
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
      ? result.error : "The request could not be saved. Please try again.";
    throw new Error(message);
  }
  return result as T;
}
function TierTag({ tier }: { tier: string }) { return <Badge variant="outline" className={`tier-tag tier-${tier}`}>{titleCase(tier)}</Badge>; }

export default function Home({ api = serverApi, writeEnabled = true, storageControls }: {
  api?: <T>(path: string, body?: unknown) => Promise<T>;
  writeEnabled?: boolean;
  storageControls?: React.ReactNode;
}) {
  const [state, setState] = useState<LabState>({ candidates: [], attempts: SEED_ATTEMPTS });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("generate");
  const [tier, setTier] = useState<TargetTier>("gold");
  const [count, setCount] = useState("5");
  const [leadingZeros, setLeadingZeros] = useState(false);
  const [batch, setBatch] = useState<Candidate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [code, setCode] = useState("47788");
  const [outcome, setOutcome] = useState<"accepted" | "rejected">("accepted");
  const [observedTier, setObservedTier] = useState("unknown");
  const [note, setNote] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyLimit, setHistoryLimit] = useState(30);
  const pendingGeneration = useRef<{ signature: string; id: string } | null>(null);
  const pendingRecord = useRef<{ signature: string; id: string } | null>(null);
  const generationLock = useRef(false);
  const recordLock = useRef(false);
  async function refresh() {
    setLoadError("");
    try { setState(await api<LabState>("/api/lab")); setReady(true); }
    catch (err) { setReady(false); setLoadError((err as Error).message); }
  }
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!generationLock.current && !recordLock.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const excluded = new Set([...state.attempts.map(a => a.code), ...state.candidates.map(c => c.code)]);
  const remaining = candidatePool(tier, excluded, leadingZeros).length;
  const acceptedCodes = [...new Set(state.attempts.filter(a => a.outcome === "accepted").map(a => a.code))];
  const evidence = modelEvidence(state);
  const legacyAccepted = [...new Set(SEED_ATTEMPTS.filter(a => a.outcome === "accepted").map(a => a.code))];
  const passingLegacy = legacyAccepted.filter(c => checkCode(c).matches).length;
  const parsed = /^[0-9]{5}$/.test(code) ? checkCode(code) : null;
  const summary = parsed ? summarizeCode(code, state.attempts) : null;
  const allCodes = [...new Set([...state.attempts.slice().reverse().map(a => a.code), ...state.candidates.slice().reverse().map(c => c.code)])];
  const filteredCodes = allCodes.filter(c => {
    const s = summarizeCode(c, state.attempts);
    return historyFilter === "all" || (historyFilter === "accepted" && s.accepted > 0) || (historyFilter === "rejected" && s.rejected > 0) || (historyFilter === "untested" && s.history.length === 0);
  });
  function inspect(value: string) {
    setCode(value); setObservedTier("unknown"); setNote(""); setOutcome("accepted"); setActiveTab("check"); setError(""); setNotice("");
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("Copied."); setError(""); }
    catch { setError("Copy is unavailable in this browser. Select the code text to copy it."); }
  }
  async function generateBatch() {
    if (generationLock.current) return;
    generationLock.current = true; setGenerating(true); setError(""); setNotice("");
    const body = { tier, count: Number(count), leadingZeros };
    const signature = JSON.stringify(body);
    if (pendingGeneration.current?.signature !== signature) pendingGeneration.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await api<{ candidates: Candidate[] }>("/api/generate", { ...body, requestId: pendingGeneration.current.id });
      setBatch(result.candidates);
      setState(current => ({ ...current, candidates: [...new Map([...current.candidates, ...result.candidates].map(c => [c.code, c])).values()] }));
      pendingGeneration.current = null;
      setNotice(`${result.candidates.length} candidate${result.candidates.length === 1 ? "" : "s"} saved. Record the actual result after testing.`);
    } catch (err) { setError((err as Error).message); }
    finally { generationLock.current = false; setGenerating(false); }
  }
  async function saveAttempt(event: React.FormEvent) {
    event.preventDefault(); if (!parsed || recordLock.current) return;
    recordLock.current = true; setRecording(true); setError(""); setNotice("");
    const body = { code, outcome, observedTier: outcome === "accepted" && observedTier !== "unknown" ? observedTier : null, note };
    const signature = JSON.stringify(body);
    if (pendingRecord.current?.signature !== signature) pendingRecord.current = { signature, id: crypto.randomUUID() };
    try {
      const saved = await api<Attempt>("/api/attempts", { ...body, requestId: pendingRecord.current.id });
      setState(current => ({ ...current, attempts: [...current.attempts.filter(a => a.id !== saved.id), saved] }));
      pendingRecord.current = null; setNote(""); setNotice(`Saved ${outcome} for ${code}. Earlier results are preserved.`);
    } catch (err) { setError((err as Error).message); }
    finally { recordLock.current = false; setRecording(false); }
  }
  async function exportHistory() {
    let latest: LabState;
    try { latest = await api<LabState>("/api/lab"); setState(latest); }
    catch (err) { setError((err as Error).message); return; }
    const data = { format: "candy-code-lab/v1", exportedAt: new Date().toISOString(), checksumModel: { weights: [8, 8, 4, 9], constant: 0, modulus: 10, status: "hypothesis" }, tierRules: { gold: "(8*d1 + 7*d3 + 7) mod 10", bronze: "(-d1 - d2 - d3) mod 10", status: "experimental; Bronze formula also matches confirmed Silver" }, evidence: modelEvidence(latest), experiments: experimentEvidence(latest), ...latest };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "candy-code-history.json";
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="lab-shell">
    <header className="lab-header"><a href="./" className="wordmark"><span className="brand-icon"><Candy size={23} aria-hidden="true" /></span><span>Candy<span className="brand-light"> Code Lab</span></span></a><span className="private-label">Vending machine workshop</span></header>
    <section className="intro-row"><div><p className="eyebrow">SAME FIVE DIGITS. BETTER RECORDS.</p><h1>Your promo workbench.</h1></div><div className="compatibility"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>{passingLegacy} / {legacyAccepted.length} legacy checks pass</strong><span>Original accepted codes preserved</span></div></div></section>
    {storageControls}
    <ResearchPanel state={state} onRefresh={() => void refresh()} />
    <Tabs value={activeTab} onValueChange={value => { setActiveTab(value); setError(""); setNotice(""); }}>
      <TabsList className="main-tabs" aria-label="Promo tools"><TabsTrigger value="generate"><Sparkles aria-hidden="true" />Generate</TabsTrigger><TabsTrigger value="check"><ScanLine aria-hidden="true" />Check & record</TabsTrigger><TabsTrigger value="history"><History aria-hidden="true" />History</TabsTrigger></TabsList>
      {loadError && <div className="alert-box" role="alert"><p>{loadError} The original reference results remain visible.</p><Button variant="outline" onClick={() => void refresh()}>Retry loading</Button></div>}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      <TabsContent value="generate">
        <div className="generator-layout">
          <section className="panel generator-controls">
            <div className="panel-heading"><h2>Generate test candidates</h2><Button variant="outline" disabled={generating || recording} onClick={() => void refresh()}>Refresh results</Button><Badge variant="outline" className="model-badge">Unvalidated rules</Badge></div><p className="section-copy">Choose a rule to test. Every previously generated or tested code is skipped. The rules cannot establish a reward tier.</p>
            <RadioGroup value={tier} onValueChange={value => setTier(value as TargetTier)} className="tier-options" aria-label="Predicted tier">
              <label className={`tier-option ${tier === "gold" ? "selected" : ""}`} htmlFor="target-gold"><div className="tier-option-top"><span className="tier-name">Gold</span><RadioGroupItem value="gold" id="target-gold" /></div><span>{evidence.generated.gold.accepted} accepted / {evidence.generated.gold.accepted + evidence.generated.gold.rejected} newly tested. Four historical Gold codes were used to fit this rule.</span></label>
              <label className={`tier-option bronze-option ${tier === "bronze" ? "selected" : ""}`} htmlFor="target-bronze"><div className="tier-option-top"><span className="tier-name">Bronze</span><RadioGroupItem value="bronze" id="target-bronze" /></div><span>{evidence.generated.bronze.accepted} accepted / {evidence.generated.bronze.accepted + evidence.generated.bronze.rejected} newly tested. Only one independent Bronze success is known.</span></label>
            </RadioGroup><p className="small-note">Silver & Diamond: no generator rule. Confirmed Silver code 47724 matches the old Bronze arithmetic, so that rule cannot classify tiers.</p>
            <div className="generation-settings"><div><label className="field-label" htmlFor="batch-count">Batch size</label><Select value={count} onValueChange={setCount}><SelectTrigger id="batch-count" className="select-field"><SelectValue /></SelectTrigger><SelectContent>{[1, 5, 10, 25].map(n => <SelectItem key={n} value={String(n)}>{n} code{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent></Select></div><div className="pool-size"><strong>{remaining}</strong><span>unrecorded candidates</span></div></div>
            <label className="checkbox-label" htmlFor="leading-zero"><Checkbox id="leading-zero" checked={leadingZeros} onCheckedChange={value => setLeadingZeros(value === true)} />Include leading zeros <span className="small-note">(untested format)</span></label>
            <Button className="generate-button" onClick={() => void generateBatch()} disabled={!ready || !writeEnabled || generating || remaining < Number(count)}>{generating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{generating ? "Saving candidates…" : "Generate candidates"}</Button>
            <p className="prediction-note"><FlaskConical size={17} aria-hidden="true" />Four newly tested Gold-rule codes were rejected. Neither of the two fitted checksum formulas excludes them. Treat each new code as an experiment.</p>
          </section>
          <section className="batch-panel"><div className="panel-heading"><h2>{batch.length ? "Your latest batch" : "The compatibility check"}</h2>{batch.length > 0 && <Button variant="outline" className="copy-batch" onClick={() => void copy(batch.map(c => c.code).join("\n"))}><Copy aria-hidden="true" />Copy batch</Button>}</div>
            {batch.length === 0 ? <div className="reference-ticket"><p className="ticket-label">PREVIOUSLY ACCEPTED · GOLD</p><div className="ticket-code">47788</div><div className="ticket-rule"><Check size={17} aria-hidden="true" />Checksum matches</div><p>Accepted once, then rejected on a later attempt. Both observations are kept.</p><Button variant="outline" onClick={() => inspect("47788")}>View code history</Button></div> : <div className="candidate-list">{batch.map(c => { const observed = summarizeCode(c.code, state.attempts); return <article className="candidate-row" key={c.code}><div><code>{c.code}</code><span className="candidate-caption">{observed.history.length ? `${observed.accepted} accepted · ${observed.rejected} rejected` : `${titleCase(c.predictedTier)}-rule test · untested`}</span></div><div className="candidate-actions"><Button variant="ghost" size="icon" aria-label={`Copy ${c.code}`} onClick={() => void copy(c.code)}><Copy /></Button><Button variant="outline" onClick={() => inspect(c.code)}>Record result</Button></div></article>; })}</div>}
          </section>
        </div>
        <section className="reference-section"><div className="panel-heading"><div><h2>Previously accepted codes</h2><p className="section-copy">Machine observations. Repeating a code does not add an independent example.</p></div><span className="small-note">4 Gold · 1 Bronze · 1 Silver</span></div><div className="reference-grid">{legacyAccepted.map(c => { const s = summarizeCode(c, SEED_ATTEMPTS); return <Button key={c} variant="outline" className="reference-card" onClick={() => inspect(c)}><span><code>{c}</code><span className="reference-status"><Check size={14} aria-hidden="true" />Checksum match</span></span><TierTag tier={s.observedTiers[0]} /></Button>; })}</div></section>
        <details className="math-details"><summary>How the existing formulas work</summary><div className="math-content"><p>For a five-digit code <code>d₁d₂d₃d₄d₅</code>, the original checksum hypothesis is:</p><code className="formula">d₅ = (8d₁ + 8d₂ + 4d₃ + 9d₄) mod 10</code><p>The first three digits form a candidate serial. The earlier tier hypotheses choose the fourth digit:</p><code className="formula">Gold: d₄ = (8d₁ + 7d₃ + 7) mod 10</code><code className="formula">Legacy Bronze: d₄ = (−d₁ − d₂ − d₃) mod 10</code><p>“Mod 10” means the nonnegative remainder from 0 to 9. The Gold rule fits four distinct Gold examples. Bronze and Silver have one distinct example each. Silver code <code>47724</code> matches the old Bronze rule, so that rule cannot establish its tier.</p><p><code>81755</code> matches the original checksum but was rejected. Another fitted checksum, <code>(8d₁ + 8d₂ + 9d₃ + 4d₄ + 5) mod 10</code>, matches all six accepted examples and excludes that code. Four newly generated Gold-rule codes matched both checksum formulas and were rejected. Both formulas fail to identify working codes. The generator keeps the old rules for controlled tests.</p></div></details>
      </TabsContent>
      <TabsContent value="check"><div className="check-layout">
        <section className="panel"><h2>Check a code</h2><p className="section-copy">Check the arithmetic and see what actually happened.</p><label className="field-label" htmlFor="check-code">Five-digit promo code</label><Input id="check-code" className="code-input" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5} value={code} onChange={event => { setCode(event.target.value.replace(/[^0-9]/g, "")); setObservedTier("unknown"); setNote(""); setNotice(""); }} /><div aria-live="polite" className="check-output">{parsed ? <><div className={`check-result ${parsed.matches ? "matches" : "mismatch"}`}><strong>{parsed.matches ? "Checksum matches" : "Checksum does not match"}</strong><span>{parsed.weightedSum} mod 10 = {parsed.expected}; supplied digit = {parsed.supplied}</span></div><dl className="code-facts"><div><dt>Reported tier</dt><dd>{summary!.observedTiers.length ? <>{summary!.observedTiers.map(t => <TierTag key={t} tier={t} />)}{summary!.observedTiers.length > 1 && <span>Conflicting tier reports</span>}</> : "Unknown"}</dd></div><div><dt>Attempt history</dt><dd>{summary!.history.length ? `${summary!.accepted} accepted · ${summary!.rejected} rejected` : "No recorded attempts"}</dd></div><div><dt>Rule match</dt><dd>{parsed.predictedTiers.length ? parsed.predictedTiers.map(titleCase).join(" / ") + (parsed.predictedTiers.length > 1 ? " — ambiguous" : " — tier unconfirmed") : "No supported prediction"}</dd></div></dl><p className="small-note">A checksum match does not mean acceptance. Four newly tested Gold-rule codes matched both checksum formulas and were rejected.</p></> : <p className="section-copy">Enter all five digits to check the code.</p>}</div></section>
        <section className="panel"><h2>Record the actual result</h2><p className="section-copy">Save the exact machine response when possible. This records an observation; it does not redeem the code.</p><form onSubmit={event => void saveAttempt(event)}><RadioGroup className="outcome-options" value={outcome} onValueChange={v => setOutcome(v as "accepted" | "rejected")} aria-label="Actual outcome"><label htmlFor="accepted"><RadioGroupItem id="accepted" value="accepted" />Accepted</label><label htmlFor="rejected"><RadioGroupItem id="rejected" value="rejected" />Rejected</label></RadioGroup>{outcome === "accepted" && <div className="form-field"><label htmlFor="observed-tier" className="field-label">Tier the machine gave you</label><Select value={observedTier} onValueChange={setObservedTier}><SelectTrigger id="observed-tier" className="select-field"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown / not shown</SelectItem>{["bronze", "silver", "gold", "diamond"].map(t => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}</SelectContent></Select></div>}<label className="field-label" htmlFor="result-note">Machine response or note <span className="small-note">(optional)</span></label><Textarea id="result-note" maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="For example: Already used, or the reward shown" className="note-input" /><Button type="submit" className="save-button" disabled={!ready || !writeEnabled || !parsed || recording}>{recording ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{recording ? "Saving…" : "Save attempt"}</Button></form></section>
      </div>{summary && summary.history.length > 0 && <section className="code-history-section"><h2>Every recorded attempt for <code>{code}</code></h2><ol className="attempt-list">{summary.history.map((a, index) => <li key={a.id}><span className="attempt-number">{index + 1}</span><div><div className="attempt-title"><strong>{titleCase(a.outcome)}</strong>{a.observedTier && <TierTag tier={a.observedTier} />}<span className="small-note">{a.recordedAt ? new Date(a.recordedAt).toLocaleString() : "Original conversation · date unknown"}</span></div><p>{a.note || "No response details recorded."}</p></div></li>)}</ol></section>}</TabsContent>
      <TabsContent value="history"><section className="history-panel"><div className="panel-heading history-header"><div><h2>Codes & outcomes</h2><p className="section-copy">{acceptedCodes.length} codes reported accepted · {state.attempts.length} attempts · {state.candidates.length} generated candidates</p></div><Button variant="outline" disabled={!ready} onClick={exportHistory}><Download aria-hidden="true" />Export history</Button></div><div className="history-filter"><label htmlFor="history-filter" className="field-label">Show</label><Select value={historyFilter} onValueChange={value => { setHistoryFilter(value); setHistoryLimit(30); }}><SelectTrigger id="history-filter" className="select-field"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All codes</SelectItem><SelectItem value="accepted">Any acceptance</SelectItem><SelectItem value="rejected">Any rejection</SelectItem><SelectItem value="untested">Untested candidates</SelectItem></SelectContent></Select></div><Table className="history-table"><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Observed tier</TableHead><TableHead>Results</TableHead><TableHead>Prediction</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{filteredCodes.slice(0, historyLimit).map(c => { const s = summarizeCode(c, state.attempts); const candidate = state.candidates.find(item => item.code === c); return <TableRow key={c}><TableCell><code>{c}</code></TableCell><TableCell>{s.observedTiers.length ? <span className="tier-tag-group">{s.observedTiers.map(t => <TierTag key={t} tier={t} />)}</span> : <span className="muted-text">Unknown</span>}{s.observedTiers.length > 1 && <span className="small-note">Conflicting reports</span>}</TableCell><TableCell className="results-cell">{s.history.length ? <><span>{s.accepted} accepted</span><span>{s.rejected} rejected</span></> : "Untested"}</TableCell><TableCell>{candidate ? `${titleCase(candidate.predictedTier)} rule (untested model)` : "Reference record"}</TableCell><TableCell><Button variant="ghost" onClick={() => inspect(c)}>Open</Button></TableCell></TableRow>; })}{filteredCodes.length === 0 && <TableRow><TableCell colSpan={5}>No codes in this view.</TableCell></TableRow>}</TableBody></Table>{filteredCodes.length > historyLimit && <Button variant="outline" className="show-more" onClick={() => setHistoryLimit(n => n + 30)}>Show 30 more</Button>}</section></TabsContent>
    </Tabs><footer className="lab-footer"><span>Candy Code Lab · Experimental rules</span><span>Actual outcomes stay separate from predictions.</span></footer>
  </main>;
}

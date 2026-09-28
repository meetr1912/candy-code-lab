import { useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "../components/candy-lab";
import { GithubLedger } from "../lib/github-ledger";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import "../app/globals.css";

const github = new GithubLedger();
const api = <T,>(path: string, body?: unknown) => github.api<T>(path, body);
function PagesApp() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true); setMessage(""); github.connect(token);
    try { await github.load(); setConnected(true); setToken(""); setRevision(n => n + 1); }
    catch (error) { github.disconnect(); setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 950_000) throw new Error("History file is too large.");
      await github.importHistory(JSON.parse(await file.text()));
      setMessage("History merged into GitHub. Use this app for all future records.");
      setRevision(n => n + 1);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  const controls = <section className="panel github-controls">
    <div className="panel-heading"><h2>Shared GitHub history</h2><a href="https://github.com/meetr1912/candy-code-lab/blob/main/data/ledger.json" target="_blank" rel="noreferrer">View JSON ledger</a></div>
    <p className="section-copy">All codes and notes in this public repository are visible to everyone. Saving requires a fine-grained token for this repository with Contents: read and write.</p>
    {connected ? <Button variant="outline" disabled={busy} onClick={() => { github.disconnect(); setConnected(false); setRevision(n => n + 1); }}>Disconnect</Button> : <div className="github-connect"><label htmlFor="github-token" className="field-label">GitHub token · kept only until you reload or disconnect</label><Input id="github-token" type="password" value={token} autoComplete="off" onChange={event => setToken(event.target.value)} /><Button disabled={busy || !token.trim()} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect to save"}</Button></div>}
    <details><summary>Import the original app’s history</summary><p>Stop generating and recording in the old app. Export its latest history, then select that JSON file here. Import merges records and never removes previous attempts. Continue using only this GitHub app after importing.</p><label htmlFor="history-import" className="field-label">Full history export</label><Input id="history-import" type="file" accept=".json,application/json" disabled={!connected || busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></details>
    <p role="status">{message}</p>
  </section>;
  return <Home key={revision} api={api} writeEnabled={connected && !busy} storageControls={controls} />;
}
createRoot(document.getElementById("root")!).render(<PagesApp />);

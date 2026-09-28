import { applyOperation, mergeExport, parseLedger, type Ledger } from "./json-ledger";

const endpoint = "https://api.github.com/repos/meetr1912/candy-code-lab/contents/data/ledger.json";
const branch = "main";
const MAX_BYTES = 950_000;
export class GithubLedger {
  // Session memory only: never localStorage, sessionStorage, URLs, or a bundled secret.
  private token = "";
  constructor(private request: typeof fetch = (input, init) => fetch(input, init)) {}
  connect(token: string) { this.token = token.trim(); }
  disconnect() { this.token = ""; }
  private headers() {
    return { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) };
  }
  async load(): Promise<{ ledger: Ledger; sha: string }> {
    const response = await this.request(`${endpoint}?ref=${branch}&t=${Date.now()}`, { headers: this.headers(), cache: "no-store", redirect: "error" });
    if (!response.ok) throw this.error(response.status);
    const file: unknown = await response.json();
    if (!file || typeof file !== "object" || !("encoding" in file) || file.encoding !== "base64" || !("content" in file) || typeof file.content !== "string" || !("sha" in file) || typeof file.sha !== "string") throw new Error("The JSON ledger cannot be read. Check its format and size.");
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, "")), c => c.charCodeAt(0));
    return { ledger: parseLedger(JSON.parse(new TextDecoder().decode(bytes))), sha: file.sha };
  }
  private error(status: number) {
    if (status === 401 || status === 403) return new Error("GitHub denied access or rate-limited the request. Check your token permissions and try again later.");
    if (status === 404) return new Error("The GitHub ledger is unavailable. Finish repository setup or check your access.");
    return new Error(`GitHub returned ${status}. Your input is kept; retry the same operation.`);
  }
  private async update(operation: (ledger: Ledger) => { ledger: Ledger; changed: boolean; result: unknown }) {
    if (!this.token) throw new Error("Connect a repository-scoped GitHub token to save changes.");
    // A failed compare-and-swap MUST reload and recompute before trying again.
    for (let retry = 0; retry < 5; retry++) {
      const current = await this.load();
      const next = operation(current.ledger);
      if (!next.changed) return next.result;
      const bytes = new TextEncoder().encode(JSON.stringify(next.ledger, null, 2) + "\n");
      if (bytes.length > MAX_BYTES) throw new Error("The ledger is near GitHub's file-content limit. Export and migrate storage before adding more records.");
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const response = await this.request(endpoint, {
        method: "PUT", redirect: "error", headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Update candy code ledger", branch, sha: current.sha, content: btoa(binary) }),
      });
      if (response.status === 409) continue;
      if (!response.ok) throw this.error(response.status);
      return next.result;
    }
    throw new Error("Another device is updating the ledger. Retry; no unsaved candidates have been shown.");
  }
  async api<T>(path: string, body?: unknown): Promise<T> {
    if (path === "/api/lab") return (await this.load()).ledger as T;
    return await this.update(ledger => applyOperation(ledger, path, body)) as T;
  }
  async importHistory(value: unknown) {
    return this.update(ledger => ({ ledger: mergeExport(ledger, value), changed: true, result: true }));
  }
}

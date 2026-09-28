# Candy Code Lab — GitHub Pages

Target: public `meetr1912/candy-code-lab`, branch `main`. Once deployed, the URL is `https://meetr1912.github.io/candy-code-lab/`.

The current hosted app uses Cloudflare D1. The Pages build reads and updates **`data/ledger.json` through the GitHub Contents API**, not the cached Pages copy. Every generated candidate and every attempt is retained. All recorded codes are excluded from subsequent generation, irrespective of outcome. Rejected retries never erase earlier acceptances.

## Publication and history

The public app is live at https://meetr1912.github.io/candy-code-lab/ and deploys from `.github/workflows/pages.yml`. The JSON ledger in `data/ledger.json` contains all nine original transcript attempts, nine later D1 attempts, 30 reserved candidates, and six generation requests carried over at cutover on September 28, 2026. The old Site now blocks writes and links here; its original history remains readable through its `/api/lab` endpoint.

The Pages app reads the latest JSON file from GitHub on every operation. It does not rely on a cached Pages copy. To import another previously exported history, connect a repository-scoped token in the app and use **Import the original app’s history**. The import merges records and refuses conflicting IDs. Do not reset or replace the ledger with a stale copy.

## Local development

Run `npm ci`, then `npm run test:pages` and `npm run build:pages`. `npm run dev` starts a local Vite preview. Never commit a GitHub token.

## Authentication

Public visitors can read the ledger. To generate or save results, enter a fine-grained GitHub token restricted to this one repository, with **Contents: read and write**, in the app's password field. Never put it in a commit, build variable, URL, note, or chat. The app keeps it in JavaScript memory and discards it on reload or disconnect. It does not need Actions or Workflows permission for ledger writes. All codes, results, notes, and commit history are public. This is a personal testing ledger, not a secret issuance list for real rewards.

## Correctness and limitations

- Each mutation fetches the latest ledger and supplies its file SHA when saving. A conflict reloads and recomputes against the winning version. Codes appear only after GitHub confirms the save.
- Request IDs make same-request retries idempotent, including a lost success response. The UI retains pending IDs while the page stays open. A reload may create a new request, but all previously reserved codes still stay excluded.
- No offline writes or local database fallback. Failed reads and writes preserve user input and report errors.
- JSON writes stop before 950 KB because the Contents API's inline base64 response is limited to small files. This design is suitable for low-volume personal use; GitHub rate limits apply.
- Authentication protects writes. It does not make public codes secret or prevent a repository writer from editing the ledger manually. Avoid deleting records or resetting ledger history.
- Current tier formulas remain hypotheses. This app records observations; it does not redeem codes at a machine.

## Development

`npm run build:pages` builds the static frontend under `/candy-code-lab/`. `npm run test:pages` uses mock GitHub responses and requires no cloud database. The Pages workflow tests and deploys frontend changes; ledger-only commits do not trigger builds because the app reads the live GitHub API.

Sources: [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

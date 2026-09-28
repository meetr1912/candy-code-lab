# Candy Code Lab — GitHub Pages

Target: public `meetr1912/candy-code-lab`, branch `main`. Once deployed, the URL is `https://meetr1912.github.io/candy-code-lab/`.

The current hosted app uses Cloudflare D1. The Pages build reads and updates **`data/ledger.json` through the GitHub Contents API**, not the cached Pages copy. Every generated candidate and every attempt is retained. All recorded codes are excluded from subsequent generation, irrespective of outcome. Rejected retries never erase earlier acceptances.

## Migration and initial publication

1. Stop using the old app for generation and recording. Export its latest history from the History tab. Do not resume writes there after exporting; the old deployment is not connected to GitHub.
2. Install Node 22 and GitHub CLI. Run `gh auth login` as `meetr1912` with repository and workflow access.
3. From the project directory, run `npm ci`, then `npm run migrate:github -- /absolute/path/to/candy-code-history.json`.
4. Run `npm run setup:github`. This validates the build, creates a fresh public repository without private source history or runtime files, pushes the code, enables Pages, and requests deployment. It fails if the repository already exists. No force push is used.
5. Check the Pages workflow on GitHub. If repository creation succeeded but Pages setup failed, enable Settings → Pages → Source → GitHub Actions and run the GitHub Pages workflow. Do not rerun repository creation.
6. Use only the Pages app going forward. The old D1 site remains a historical copy; stop using it or retire it after verifying the import. Import is idempotent for identical records and refuses conflicting records.

The checked-in snapshot contains the nine transcript attempts, nine newer D1 attempts, and 30 reserved candidates as of September 28, 2026. It is a point-in-time copy. Writes fail closed until the latest complete D1 export is imported after stopping the old app. Import can also be done in the Pages UI after connecting a token.

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

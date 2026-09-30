import { readFileSync, writeFileSync } from "node:fs";

const incoming = JSON.parse(readFileSync(process.argv[2], "utf8"));
const previous = JSON.parse(readFileSync("data/ledger.json", "utf8"));
if (incoming.format !== "candy-code-ledger/v2" || !Array.isArray(incoming.attempts) || !Array.isArray(incoming.candidates) || !Array.isArray(incoming.requests)) throw Error("Invalid Site export; ledger unchanged.");
for (const [key, identity] of [["attempts", "id"], ["candidates", "code"], ["requests", "id"]]) {
  const old = previous[key];
  const fresh = incoming[key];
  if (!Array.isArray(old) || fresh.length < old.length || new Set(fresh.map(x => x[identity])).size !== fresh.length) throw Error(`Incomplete ${key}; ledger unchanged.`);
  const ids = new Set(fresh.map(x => x[identity]));
  for (const entry of old) if (!ids.has(entry[identity])) throw Error(`Missing prior ${key} entry; ledger unchanged.`);
}
writeFileSync("data/ledger.json", JSON.stringify(incoming, null, 2) + "\n");

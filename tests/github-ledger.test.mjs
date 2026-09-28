import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
async function compile(path) {
  const output = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
}
const { initialLedger, mergeExport, parseLedger, applyOperation } = await compile('lib/json-ledger.ts');
const { GithubLedger } = await compile('lib/github-ledger.ts');
const initial = () => mergeExport(initialLedger(), initialLedger());
const generation = () => ({ requestId: crypto.randomUUID(), tier: 'gold', count: 25, leadingZeros: false });
function fakeGithub() {
  let ledger = initial(), sha = '0', loseResponse = false;
  let puts = 0, conflicts = 0;
  return {
    get ledger() { return ledger; },
    get puts() { return puts; },
    get conflicts() { return conflicts; },
    loseNextResponse() { loseResponse = true; },
    fetch: async (url, options) => {
      if (options.method !== 'PUT') {
        const snapshot = { encoding: 'base64', sha, content: Buffer.from(JSON.stringify(ledger)).toString('base64') };
        await Promise.resolve();
        return Response.json(snapshot);
      }
      puts++;
      const body = JSON.parse(options.body);
      if (body.sha !== sha) { conflicts++; return Response.json({}, { status: 409 }); }
      ledger = parseLedger(JSON.parse(Buffer.from(body.content, 'base64').toString()));
      sha = String(Number(sha) + 1);
      if (loseResponse) { loseResponse = false; throw new Error('Connection lost after commit'); }
      return Response.json({ content: { sha } });
    },
  };
}
function client(server) { const result = new GithubLedger(server.fetch); result.connect('mock-token'); return result; }
test('migration is mandatory and preserves earlier attempts and generated candidates', () => {
  assert.throws(() => applyOperation(initialLedger(), '/api/generate', generation()), /Import/);
  const old = initial();
  old.candidates.push({ code: '11178', predictedTier: 'gold', requestId: crypto.randomUUID(), generatedAt: new Date().toISOString() });
  const migrated = mergeExport(initialLedger(), old);
  assert.equal(migrated.attempts.length, 9);
  assert.equal(migrated.candidates[0].code, '11178');
  assert.deepEqual(mergeExport(migrated, old).attempts, migrated.attempts);
  assert.throws(() => mergeExport(migrated, { attempts: [], candidates: [] }), /complete history/);
});
test('two devices concurrently reserve different batches without lost updates', async () => {
  const server = fakeGithub();
  const [a, b] = await Promise.all([client(server).api('/api/generate', generation()), client(server).api('/api/generate', generation())]);
  assert.equal(new Set([...a.candidates, ...b.candidates].map(c => c.code)).size, 50);
  assert.equal(server.ledger.candidates.length, 50);
  assert.ok(server.conflicts > 0);
});
test('a committed write with a lost response is recovered by the same request ID', async () => {
  const server = fakeGithub(), app = client(server), input = generation();
  server.loseNextResponse();
  await assert.rejects(app.api('/api/generate', input), /Connection lost/);
  const result = await app.api('/api/generate', input);
  assert.equal(result.repeated, true);
  assert.equal(server.ledger.candidates.length, 25);
  assert.equal(server.puts, 1);
  await assert.rejects(app.api('/api/generate', { ...input, count: 1 }), /different settings/);
});
test('attempts append, support Unicode, and retry idempotently without overwriting acceptance', async () => {
  const server = fakeGithub(), app = client(server);
  const input = { requestId: crypto.randomUUID(), code: '47788', outcome: 'rejected', observedTier: null, note: 'Déjà utilisé 🍬' };
  await Promise.all([app.api('/api/attempts', input), client(server).api('/api/attempts', input)]);
  assert.equal(server.ledger.attempts.length, 10);
  assert.equal(server.ledger.attempts.at(-1).note, input.note);
  assert.ok(server.ledger.attempts.some(a => a.code === '47788' && a.outcome === 'accepted'));
  await assert.rejects(app.api('/api/attempts', { ...input, note: 'changed' }), /different details/);
});
test('structured first-use metadata persists while historical attempts stay compatible', async () => {
  const server = fakeGithub(), app = client(server);
  const input = { requestId: crypto.randomUUID(), code: '55528', outcome: 'rejected', observedTier: null, note: 'Not recognized', testContext: { origin: 'calculated', use: 'first', campaign: 'fall-26' } };
  await app.api('/api/attempts', input);
  assert.deepEqual(server.ledger.attempts.at(-1).testContext, input.testContext);
  assert.equal(server.ledger.attempts[0].testContext, undefined);
  await app.api('/api/attempts', input);
  assert.equal(server.ledger.attempts.length, 10);
  await assert.rejects(app.api('/api/attempts', { ...input, testContext: { ...input.testContext, use: 'retry' } }), /different details/);
});
test('all recorded and generated codes remain excluded through pool exhaustion', () => {
  let ledger = initial();
  const excluded = new Set(ledger.attempts.map(a => a.code));
  for (let n = 0; n < 800; n++) {
    try {
      const next = applyOperation(ledger, '/api/generate', { ...generation(), count: 1 });
      const code = next.result.candidates[0].code;
      assert.ok(!excluded.has(code)); excluded.add(code); ledger = next.ledger;
    } catch (error) { assert.match(error.message, /remain/); break; }
  }
  assert.ok(ledger.candidates.length > 700);
});
test('read-only clients, failed writes, and malformed history cannot create local successes', async () => {
  const server = fakeGithub();
  await assert.rejects(new GithubLedger(server.fetch).api('/api/generate', generation()), /Connect/);
  const app = new GithubLedger(async (url, options) => options.method === 'PUT' ? Response.json({}, { status: 403 }) : server.fetch(url, options));
  app.connect('mock-token');
  await assert.rejects(app.api('/api/generate', generation()), /denied/);
  assert.equal(server.ledger.candidates.length, 0);
  assert.throws(() => parseLedger({ ...initial(), attempts: [] }), /reference/);
  const broken = initial(); broken.attempts.push(broken.attempts[0]);
  assert.throws(() => parseLedger(broken), /duplicate/);
});

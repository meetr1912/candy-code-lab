import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

// Node does not provide the Workers binding module. The root page renders only
// embedded reference data; effects and database routes are not run in this test.
register(new URL("./cloudflare-loader.mjs", import.meta.url));

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders the candy workbench with all legacy references and no starter metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /Candy Code Lab/);
  for (const code of ["93619", "22340", "50384", "47788", "10459", "47724"]) assert.ok(html.includes(code));
  assert.match(html, /Generate candidates/);
  assert.match(html, /predictions/);
});

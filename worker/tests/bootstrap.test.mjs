import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.mjs";

test("health confirms deployment without claiming OAuth is enabled", async () => {
  const response = await worker.fetch(new Request("https://midihudaut.midihudapp.workers.dev/health"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    service: "midi-hud-auth",
    status: "ok",
    stage: "deployment-bootstrap",
    oauthEnabled: false,
  });
});

test("unimplemented OAuth endpoints do not accept credentials", async () => {
  for (const path of ["/auth", "/callback", "/token", "/refresh", "/admin"]) {
    const response = await worker.fetch(new Request("https://midihudaut.midihudapp.workers.dev" + path));
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }
});

test("write requests cannot change server state", async () => {
  const response = await worker.fetch(new Request("https://midihudaut.midihudapp.workers.dev/health", { method: "POST", body: "anything" }));
  assert.equal(response.status, 404);
});

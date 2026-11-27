import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { mobileUpdates } from "../core/native-updates.mjs";

const policy = JSON.parse(await readFile(new URL("../config/native-updates.json", import.meta.url)));
const cases = [
  ["android", "stable", "googlePlay", "https://play.google.com/store/apps/details?id=io.midihud.app"],
  ["android", "qa", "googlePlayInternal", "https://play.google.com/apps/testing/io.midihud.app.androidqa"],
  ["ios", "stable", "appStore", "https://apps.apple.com/app/id123"],
  ["ios", "qa", "testFlight", "https://testflight.apple.com/join/test"],
];

test("mobile defaults never access an adapter", () => {
  const adapters = new Proxy({}, { get() { assert.fail("Unexpected adapter access"); } });
  for (const [platform, channel] of cases) {
    assert.equal(mobileUpdates({ platform, channel, policy, adapters }), null);
  }
});

for (const [platform, channel, provider, url] of cases) {
  test(`${platform} ${channel} only offers a newer build in its configured store`, async () => {
    const enabled = { ...policy, [platform]: { ...policy[platform], enabled: true } };
    const opened = [];
    let response = { build: 3, url };
    const update = mobileUpdates({
      platform, channel, installed: 3, policy: enabled,
      adapters: { [provider]: {
        check: async request => {
          assert.deepEqual(request, { installed: 3, channel });
          if (response instanceof Error) throw response;
          return response;
        },
        openStore: url => opened.push(url),
      } },
    });
    assert.equal(await update.check(), null);
    response = { build: 4, url: "https://example.com/app.apk" };
    await assert.rejects(update.check(), /Invalid store/);
    response = new Error("offline");
    await assert.rejects(update.check(), /offline/);
    response = { build: 4, url };
    const offer = await update.check();
    assert.deepEqual(opened, []);
    offer.open();
    assert.deepEqual(opened, [url]);
  });
}

test("a mobile build cannot select the other channel's provider", () => {
  const swapped = { ...policy, ios: { ...policy.ios, enabled: true, qa: "appStore" } };
  assert.throws(() => mobileUpdates({ platform: "ios", channel: "qa", installed: 3,
    policy: swapped, adapters: { appStore: { check() {}, openStore() {} } } }), /Invalid mobile/);
});

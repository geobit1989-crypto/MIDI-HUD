const storeHosts = Object.freeze({
  googlePlay: "play.google.com",
  googlePlayInternal: "play.google.com",
  appStore: "apps.apple.com",
  testFlight: "testflight.apple.com",
});
const platformProviders = {
  android: { stable: "googlePlay", qa: "googlePlayInternal" },
  ios: { stable: "appStore", qa: "testFlight" },
};

// Mobile shells can supply native SDK adapters once their store targets are validated.
// A positive result is handed to the OS store, which owns all installation.
export function mobileUpdates({ platform, channel, installed, policy, adapters }) {
  const config = policy[platform];
  if (!["android", "ios"].includes(platform) || config?.enabled !== true) return null;
  if (!["qa", "stable"].includes(channel)) throw new Error("Invalid update channel");
  const provider = config[channel];
  const host = storeHosts[provider];
  const adapter = adapters[provider];
  if (provider !== platformProviders[platform][channel] || !host ||
      typeof adapter?.check !== "function" || typeof adapter?.openStore !== "function" ||
      !Number.isSafeInteger(installed) || installed < 1) {
    throw new Error("Invalid mobile update configuration");
  }

  return {
    async check() {
      const result = await adapter.check({ installed, channel });
      if (!Number.isSafeInteger(result?.build) || result.build <= installed) return null;
      const url = new URL(result.url);
      if (url.origin !== `https://${host}` || url.username || url.password) {
        throw new Error("Invalid store destination");
      }
      return { build: result.build, open: () => adapter.openStore(url.href) };
    },
  };
}

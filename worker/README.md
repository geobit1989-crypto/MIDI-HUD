# MIDI HUD OAuth Worker

Cloudflare Worker: `midihudaut` — `https://midihudaut.midihudapp.workers.dev`.

## Deployment

On changes to `worker/**` in the active `gh-pages` branch, the `Deploy MIDI HUD Auth Worker` GitHub Actions workflow tests and deploys this Worker.

Repository Actions configuration:
- **Secret** `CLOUDFLARE_API_TOKEN`, scoped to the MIDI HUD Cloudflare account with Workers Scripts / Edit and Account Settings / Read.
- **Variable** `CLOUDFLARE_ACCOUNT_ID`.

The Worker currently only responds to public health checks at `/health` and `/`. It **does not authenticate Google users or sync Drive** yet. Existing GitHub Pages MIDI HUD functionality is unchanged.

Future work: OAuth Authorization Code flow with PKCE/state, cookie-based per-device sessions, encrypted refresh token storage and revocation, D1 binding, strict CORS and CSRF protections. Do not put secrets or tokens in this public repository or commit them to wrangler config.

`cd worker && npm install && npm test && npm run deploy` can also be used by an administrator with Cloudflare credentials outside source control.

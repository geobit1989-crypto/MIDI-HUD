# MIDI HUD — Persistent Google OAuth service

Service: https://midihudaut.midihudapp.workers.dev

Deploys automatically from `gh-pages` on changes under `worker/**` via
`.github/workflows/deploy-cloudflare-worker.yml`.

## Current status

The Worker has a complete preliminary backend for the OAuth 2.0 Authorization
Code + PKCE flow, encrypted Google offline access, D1 trusted devices, Drive
proxy and revocable individual sessions. The frontend keeps the existing
Google Identity token flow until `/health` confirms the new service is ready.
No existing Google Drive repertoire records are migrated or deleted.

## One-time activation (no sensitive values in GitHub source)

1. **D1 database**: create `midi-hud-auth-db` in Cloudflare's **D1 SQL Database**
   section. Copy its database UUID (public identifier). Add the binding to
   `worker/wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "midi-hud-auth-db"
   database_id = "ACTUAL_DATABASE_UUID"
   ```

   The Worker initializes its SQL tables automatically on its first health
   request, using only the D1 binding. A manual copy is in `worker/schema.sql`.
   Do not rotate an existing database ID after authorization has begun.

2. **Google Cloud OAuth**: use the existing MIDI HUD **Web application**
   OAuth Client ID (public, already in `wrangler.toml`). Add the **Authorized
   redirect URI** exactly:

   `https://midihudaut.midihudapp.workers.dev/auth/callback`

   Keep the existing GitHub Pages Authorized JavaScript origin for the legacy
   flow. Production OAuth mode is already enabled. Obtain the **client secret**
   from Google Cloud; never add it to GitHub code.

3. **Worker runtime secrets**: in Cloudflare's `midihudaut` Worker
   **Settings → Variables and Secrets**, add two secrets (encrypted, not plain vars):

   - `GOOGLE_CLIENT_SECRET`: the secret belonging to the Web OAuth Client ID.
   - `TOKEN_ENCRYPTION_KEY`: 32 bytes of cryptographically random data encoded
     as 43-character unpadded base64url. Do not use a password or a Client ID
     as this key. Keep a secure backup; losing/rotating it prevents decryption
     of existing Google refresh credentials.

   You can generate the 32 random bytes locally using
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   or `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`. Generate it on your
   own machine, never in the public project or ChatGPT conversation.

4. **Deploy again**: GitHub Actions deploys on any commit under `worker/**`.
   Inspect `/health`: it must report `"oauthEnabled":true`.

5. **Authorize each device once**: open MIDI HUD Editor, click
   **Sincronización → Conectar con Google** and complete the Google consent
   redirect in that same browser. The Worker stores the Google refresh token
   with AES-GCM encryption in D1; the browser only retains a revocable
   opaque device session token. Each browser has its own authorization; existing
   Drive `appDataFolder` history is preserved.

## Security

- OAuth state and one-time return tickets are random and single use.
- OAuth Code + PKCE is enforced on the server.
- One-time ticket exchange requires an additional locally held proof to
  defend against login CSRF.
- Google refresh and access tokens are AES-GCM encrypted at rest in Cloudflare D1.
- Device bearer tokens are random, stored only as SHA-256 hashes on the server,
  and revocable individually. The browser retains its own bearer token in
  localStorage; protect the browser profile against untrusted scripts/extensions.
- API CORS allows only the official GitHub Pages origin. The backend cannot
  browse arbitrary Google Drive files, delete them, or request broad scopes:
  it proxies only whitelisted `appDataFolder` operations already supported by
  MIDI HUD.
- No Worker security tokens or Google secrets appear in the repository,
  GitHub Actions variables, URLs or browser logs.
- Tokens may still be revoked by Google; browser sessions expire after
  approximately 180 days of inactivity or revocation, and are extended
  on ongoing use.
- No reliable background synchronization can run while Safari suspends the
  entire page; synchronization resumes on launch, focus or connection recovery.

## Endpoints

- `GET /health` — readiness flag; no private data.
- `POST /auth/start` — creates short-lived OAuth state and Google URL.
- `GET /auth/callback` — Google redirect and one-time handoff.
- `POST /session/exchange` — proof-bound, one-time device authorization.
- `GET /session` — check and refresh current trusted device.
- `POST /session/revoke` — revoke the current device.
- `GET /session/devices` — list active devices on the Google account.
- `POST /session/devices/revoke` — revoke any listed device.
- `POST /drive/request` — authenticated proxy to limited Google Drive API.

All API calls from the site require its exact trusted `Origin`; no cookies
are used across GitHub Pages and workers.dev.

## Running tests

`node --test worker/tests/*.test.mjs`

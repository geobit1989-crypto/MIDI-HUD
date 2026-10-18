/** MIDI HUD Auth Worker — bootstrap release.
 * No user authentication or Google credentials are accepted in this version.
 * This health endpoint proves automatic Cloudflare deployment is operational.
 */
const COMMON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: COMMON_HEADERS });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({
        service: "midi-hud-auth",
        status: "ok",
        stage: "deployment-bootstrap",
        oauthEnabled: false,
      });
    }
    return json({ error: "not_found" }, 404);
  },
};

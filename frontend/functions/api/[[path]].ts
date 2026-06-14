// Cloudflare Pages Function: same-origin reverse proxy for /api/*.
//
// The frontend (Cloudflare Pages, *.pages.dev) and backend (Cloud Run,
// *.run.app) live on different registrable domains. Calling the API
// cross-origin makes the session cookie (Secure; SameSite=None) a third-party
// cookie, which iOS Safari / iOS Chrome (WebKit, ITP) block by default. The
// symptom: after login the app looks authenticated (the user object comes from
// the in-memory login response), but the cookie is never stored, so the next
// API call — e.g. the Add-Holding "Test" price lookup — arrives with no cookie
// and the AuthGate answers 401 "not logged in". Desktop Chrome still allows the
// third-party cookie, which is why it only reproduces on iPad/iPhone.
//
// Proxying /api through the Pages origin makes the cookie first-party, matching
// how nginx (Docker stack) and the Vite dev server already serve the API
// same-origin. With the proxy in place VITE_API_URL must be left unset so the
// client targets the relative /api path (see lib/api/client.ts).
//
// Configure API_ORIGIN in the Pages project env to the Cloud Run service URL,
// e.g. https://portfolio-dashboard-api-xxxx.europe-west1.run.app
// (no trailing slash, no /api suffix).

interface Env {
  API_ORIGIN: string
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origin = env.API_ORIGIN?.replace(/\/$/, '')
  if (!origin) {
    return new Response(JSON.stringify({ error: 'API_ORIGIN is not configured' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const incoming = new URL(request.url)
  const target = origin + incoming.pathname + incoming.search

  // Reuse the incoming request verbatim — method, headers (Cookie and
  // X-Requested-With), and body all carry through. fetch() sets the Host
  // header to the Cloud Run host, which its routing requires. The upstream
  // Set-Cookie is returned unchanged; because the browser sees the Pages
  // origin, the cookie is stored first-party.
  return fetch(new Request(target, request))
}

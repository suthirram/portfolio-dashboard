// Cloudflare Pages Function: same-origin proxy for /api/* → Cloud Run.
//
// Why: pages.dev (frontend) and run.app (backend) are different eTLD+1, so
// pd_session is a 3rd-party cookie. Safari ITP and other modern browsers
// drop it on cross-site requests despite SameSite=None;Secure. Routing /api
// through this Function makes the browser see only same-origin traffic; the
// cookie is 1st-party for pages.dev and always sent.
//
// The Function does NOT touch the body, just forwards method + headers and
// pipes the response back. Set-Cookie from the upstream lands on the
// page-host response, becoming a 1st-party cookie on the user's browser.

interface Env {
  API_BASE: string
}

interface PagesContext {
  request: Request
  env: Env
}

export const onRequest = async (ctx: PagesContext): Promise<Response> => {
  if (!ctx.env.API_BASE) {
    return new Response('API_BASE env var not configured', { status: 500 })
  }

  const incoming = new URL(ctx.request.url)
  const target = `${ctx.env.API_BASE.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`

  const headers = new Headers(ctx.request.headers)
  // Strip hop-by-hop and CF-injected headers that would confuse the upstream
  // host check or CORS logic. The upstream sees the real Origin so its
  // CORS_ALLOWED_ORIGINS check still passes for pages.dev.
  headers.delete('host')
  headers.delete('cf-connecting-ip')
  headers.delete('cf-ray')
  headers.delete('cf-visitor')
  headers.delete('cf-ipcountry')
  headers.delete('x-forwarded-host')

  const method = ctx.request.method
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? ctx.request.body : undefined,
    redirect: 'manual',
  })

  // Pass-through response. Set-Cookie lives in upstream headers; cloning into
  // a new Response preserves it.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}

// Route handlers get no CSRF protection from Next.js, and the dashboard has no
// login. Any page open in the browser could otherwise POST to localhost (a
// simple request needs no preflight), so state-changing routes reject requests
// the browser marks as coming from another origin. Clients that send neither
// header (curl, scripts on this machine) stay allowed.
export function isCrossOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    // Compare with the Host the browser connected to: Next builds request.url
    // from its own bind address, which may differ (127.0.0.1 vs localhost).
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

export function forbidden(): Response {
  return Response.json({ error: "cross-origin request rejected" }, { status: 403 });
}

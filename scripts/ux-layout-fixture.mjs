// Isolated UI QA. Fictional identity and availability; never forwards a request.
// Every booking/queue mutation is rejected. Do not use these settings in deployment.
import { createServer } from "node:http";

let scenario = "collection";
const user = { id: "00000000-0000-0000-0000-000000000099", aud: "authenticated", role: "authenticated", email: "student@chopewash.rc4", app_metadata: {}, user_metadata: {}, created_at: "2026-11-02T00:00:00Z" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = () => {
  const issued = Math.floor(Date.now() / 1000);
  return { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: issued + 3600, iat: issued })}.fictional-local-signature`, refresh_token: "fictional-local-refresh", token_type: "bearer", expires_in: 3600, expires_at: issued + 3600, user };
};
function snapshot() {
  const serverTime = "2026-11-02T12:00:00+08:00";
  const machines = ["washer", "dryer"].flatMap(kind => [1, 2].map(index => ({ id: `${kind}-${index}`, name: `${kind === "washer" ? "Washer" : "Dryer"} 0${index}`, kind, mode: "pool", status: scenario === "collection" ? "finished" : scenario === "running" ? "running" : "available", minutesLeft: scenario === "running" ? 30 : 0, queueLength: scenario === "free" ? 0 : 2 })));
  const intervals = scenario === "free" ? [] : ["washer", "dryer"].map(kind => ({ kind, quantity: 2, startsAt: "2026-11-02T11:30:00+08:00", endsAt: "2026-11-02T12:45:00+08:00" }));
  return { schemaVersion: 3, role: "resident", serverTime, machines, intervals, bookings: [], queueEntries: [] };
}
createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", request.headers["access-control-request-headers"] || "apikey,authorization,content-type,x-client-info,x-supabase-api-version");
  response.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, "http://127.0.0.1:4012");
  if (request.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/qa/"))) {
    const next = url.pathname.slice(4);
    if (["collection", "running", "free"].includes(next)) scenario = next;
    response.setHeader("Content-Type", "text/html");
    response.end(`<h1>Fictional local ChopeWash QA</h1><p>Current scenario: ${scenario}. Live database writes are disabled.</p><p>Local app login: student / layout-only</p><nav><a href="/qa/collection">Awaiting collection</a> | <a href="/qa/running">Running (45-min capacity estimate)</a> | <a href="/qa/free">Free capacity</a></nav><p><a href="http://localhost:3000">Open local app</a></p>`);
    return;
  }
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/rest/v1/rpc/rc4_snapshot" && request.method === "POST") { response.end(JSON.stringify(snapshot())); return; }
  if (url.pathname === "/auth/v1/token" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const credentials = JSON.parse(body || "{}");
    if (credentials.refresh_token === "fictional-local-refresh" || (credentials.email === user.email && credentials.password === "layout-only")) { response.end(JSON.stringify(session())); return; }
  }
  if (url.pathname === "/auth/v1/user" && request.method === "GET") { response.end(JSON.stringify(user)); return; }
  if (url.pathname === "/rest/v1/rpc/rc4_notifications") { response.end("[]"); return; }
  response.writeHead(403);
  response.end(JSON.stringify({ message: "Fictional local QA: account creation, notifications and all laundry mutations are disabled." }));
}).listen(4012, "127.0.0.1", () => console.log("Fictional UX fixture: http://127.0.0.1:4012. Local app: student / layout-only. No production access."));

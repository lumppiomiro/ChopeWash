// Local browser QA only: anonymous availability, no authentication or writes.
import { createServer } from "node:http";
const snapshot = {
 serverTime: "2026-10-30T08:00:00+08:00", role: "resident", bookings: [], queueEntries: [],
 machines: [
  { id: "washer-book", name: "Washer 01", kind: "washer", mode: "booking", status: "available", minutesLeft: 0, queueLength: 0 },
  { id: "dryer-book", name: "Dryer 01", kind: "dryer", mode: "booking", status: "available", minutesLeft: 0, queueLength: 0 },
 ],
 intervals: [
  { machineId: "washer-book", startsAt: "2026-10-30T09:00:00+08:00", endsAt: "2026-10-30T09:45:00+08:00" },
  { machineId: "dryer-book", startsAt: "2026-10-30T10:30:00+08:00", endsAt: "2026-10-30T11:30:00+08:00" },
 ],
};
createServer((request, response) => {
 response.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
 response.setHeader("Access-Control-Allow-Headers", request.headers["access-control-request-headers"] || "apikey,authorization,content-type,x-client-info");
 response.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
 response.setHeader("Content-Type", "application/json");
 if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
 if (request.url === "/rest/v1/rpc/rc4_snapshot" && request.method === "POST") response.end(JSON.stringify(snapshot));
 else { response.writeHead(401); response.end(JSON.stringify({ message: "Read-only layout fixture: sign-in and reservations are disabled." })); }
}).listen(4011, "127.0.0.1", () => console.log("Read-only layout fixture on 127.0.0.1:4011. No production connections or writes."));

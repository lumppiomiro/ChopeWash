// Runs ONLY against a disposable container, never a production Supabase URL.
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const container = "chopewash-db-test-20261004";
const database = `rc4_test_${Date.now()}`;
function run(args, input) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
run(["exec", container, "createdb", "-U", "postgres", database]);
const psql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
for (const file of ["supabase/tests/bootstrap.sql", "supabase/migrations/202610040001_rc4_shared.sql", "supabase/tests/booking-system.sql"]) {
  console.log(file, run(psql, readFileSync(file, "utf8")));
}
const query = (sql) => new Promise(resolve => {
  const process = spawn("docker", [...psql, "-c", sql]);
  let output = ""; process.stdout.on("data", chunk => output += chunk); process.stderr.on("data", chunk => output += chunk);
  process.on("exit", code => resolve({ code, output }));
});
run([...psql, "-c", "insert into auth.users values ('00000000-0000-0000-0000-000000000041','race-a@chopewash.rc4'),('00000000-0000-0000-0000-000000000042','race-b@chopewash.rc4');"]);
const booking = "jsonb_build_object('kind','wash','dateIso',to_char(now()+interval '1 day','YYYY-MM-DD'),'startTime','16:00','duration',45)";
const results = await Promise.all([41,42].map(id => query(`begin; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000${id}',true); select rc4_action('book',${booking}); select pg_sleep(1); commit;`)));
if (results.filter(result => result.code === 0).length !== 1 || !results.some(result => result.output.includes("Someone already reserved"))) throw new Error(JSON.stringify(results));
console.log("PASS: simultaneous residents competing for the same slot yield exactly one successful reservation.");

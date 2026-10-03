import type { NextConfig } from "next";

// This file runs on the build server, before Next.js can bundle public values.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
  let privilegedJwt = false;
  try {
    const payload = value.split(".")[1];
    privilegedJwt = Boolean(payload && JSON.parse(Buffer.from(payload, "base64url").toString()).role === "service_role");
  } catch { /* Not a legacy Supabase JWT. */ }
  if (value.startsWith("sb_secret_") || privilegedJwt || /-----BEGIN .*PRIVATE KEY-----/.test(value) || /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\//i.test(value) || /(?:SERVICE_ROLE|JWT_SECRET|DATABASE_URL|POSTGRES_PASSWORD|PRIVATE_KEY)/i.test(name)) {
    throw new Error(`${name} contains a server credential or uses a server-only variable name. Remove it from NEXT_PUBLIC_ variables before building. Credential values are intentionally omitted.`);
  }
}

for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  const value = process.env[name];
  if (!value || value.startsWith("sb_publishable_")) continue;
  let anon = false;
  try { anon = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString()).role === "anon"; }
  catch { /* Invalid public key. */ }
  if (!anon) throw new Error(`${name} must contain a Supabase publishable key or legacy anon key, never a secret or service-role key.`);
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

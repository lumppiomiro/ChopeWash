import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

export async function signInWithUsername(username: string, password: string) {
  const client = getSupabaseClient();
  if (!client) return { mode: "demo" as const, username };

  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const result = await client.auth.signInWithPassword({
    email: `${normalized}@chopewash.rc4`,
    password,
  });
  if (result.error) throw result.error;
  return { mode: "supabase" as const, username: normalized, session: result.data.session };
}

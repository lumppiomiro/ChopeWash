import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let browserClient: SupabaseClient | null = null;
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return browserClient ??= createClient(url, key);
}
export function requireSupabase() {
  const client = getSupabaseClient();
  if (!client) throw new Error("RC4 backend is not configured. Add the Supabase environment variables.");
  return client;
}
function usernameValue(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(normalized)) throw new Error("Use 2–30 letters, numbers, dots, underscores or hyphens for your username.");
  return normalized;
}
export async function signInWithUsername(username: string, password: string) {
  const normalized = usernameValue(username);
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email: `${normalized}@chopewash.rc4`, password });
  if (error) throw error;
  return { username: normalized, session: data.session };
}
export async function createResidentAccount(username: string, password: string) {
  const normalized = usernameValue(username);
  if (password.length < 8) throw new Error("Choose a password with at least eight characters.");
  const { data, error } = await requireSupabase().auth.signUp({ email: `${normalized}@chopewash.rc4`, password });
  if (error) throw error;
  if (!data.session) throw new Error("Email confirmation is enabled. Ask the project owner to disable it for RC4 username accounts before signing up.");
  return { username: normalized, session: data.session };
}

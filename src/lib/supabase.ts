import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const LOCAL_ACCOUNTS_KEY = "chopewash-prototype-accounts";

type LocalAccount = {
  username: string;
  passwordHash: string;
};

const BUILT_IN_ACCOUNTS: Record<string, string> = {
  tessa: "prototype",
  miro: "1234",
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getLocalAccounts(): LocalAccount[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_ACCOUNTS_KEY) ?? "[]") as LocalAccount[];
  } catch {
    return [];
  }
}

async function matchesPrototypeAccount(username: string, password: string) {
  if (BUILT_IN_ACCOUNTS[username] === password) return true;
  const passwordHash = await hashPassword(password);
  return getLocalAccounts().some((account) => account.username === username && account.passwordHash === passwordHash);
}

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

export async function signInWithUsername(username: string, password: string) {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) throw new Error("Username and password are required.");

  const client = getSupabaseClient();
  if (!client || await matchesPrototypeAccount(normalized, password)) {
    return { mode: "demo" as const, username: normalized };
  }

  const result = await client.auth.signInWithPassword({
    email: `${normalized}@chopewash.rc4`,
    password,
  });
  if (result.error) throw result.error;
  return { mode: "supabase" as const, username: normalized, session: result.data.session };
}

export async function createPrototypeAccount(username: string, password: string) {
  const normalized = normalizeUsername(username);
  if (normalized.length < 2) throw new Error("Choose a username with at least 2 characters.");
  if (password.length < 4) throw new Error("Choose a password with at least 4 characters.");
  if (BUILT_IN_ACCOUNTS[normalized] || getLocalAccounts().some((account) => account.username === normalized)) {
    throw new Error("That username already exists on this device.");
  }

  const accounts = getLocalAccounts();
  accounts.push({ username: normalized, passwordHash: await hashPassword(password) });
  window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  return { mode: "demo" as const, username: normalized };
}

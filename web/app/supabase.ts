import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const OWNER_USERNAME = "OREZ";
const OWNER_AUTH_EMAIL = "orez@rest.invalid";
const LOCAL_PASSWORD_HASH = "168167b979b5fbf412591964c809645cd7d13b52627f208fc1508dd7e6046886";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(url && publishableKey);
}

function getSupabaseClient() {
  if (!url || !publishableKey) return null;
  client ??= createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

async function localPasswordMatches(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hashed = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hashed === LOCAL_PASSWORD_HASH;
}

export async function authenticateOwner(username: string, password: string): Promise<{ ok: boolean; message: string }> {
  if (username.trim().toUpperCase() !== OWNER_USERNAME) return { ok: false, message: "بيانات الدخول غير صحيحة." };
  const supabase = getSupabaseClient();
  if (!supabase) {
    return (await localPasswordMatches(password))
      ? { ok: true, message: "" }
      : { ok: false, message: "بيانات الدخول غير صحيحة." };
  }
  const { error } = await supabase.auth.signInWithPassword({ email: OWNER_AUTH_EMAIL, password });
  return error ? { ok: false, message: "بيانات الدخول غير صحيحة." } : { ok: true, message: "" };
}

async function currentOwnerId(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * The client keeps the full working state in IndexedDB for offline use. This
 * snapshot is the cloud mirror for the single owner and is protected by RLS.
 */
export async function loadOwnerSnapshot<T>(): Promise<T | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const ownerId = await currentOwnerId(supabase);
  if (!ownerId) return null;
  const { data, error } = await supabase
    .from("owner_snapshots")
    .select("payload")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data?.payload as T | undefined) ?? null;
}

export async function saveOwnerSnapshot(snapshot: unknown): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const ownerId = await currentOwnerId(supabase);
  if (!ownerId) return false;
  const { error } = await supabase
    .from("owner_snapshots")
    .upsert({ owner_id: ownerId, payload: snapshot }, { onConflict: "owner_id" });
  if (error) throw error;
  return true;
}

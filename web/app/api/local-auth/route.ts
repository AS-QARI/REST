import { NextResponse } from "next/server";

/**
 * Server-only fallback check for local (no-Supabase) sign-in. Kept here
 * instead of a "use client" module so the hash never ships in the browser
 * bundle.
 */
const LOCAL_PASSWORD_HASH =
  "168167b979b5fbf412591964c809645cd7d13b52627f208fc1508dd7e6046886";

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const hashed = await hashPassword(password);
  return NextResponse.json({ ok: hashed === LOCAL_PASSWORD_HASH });
}

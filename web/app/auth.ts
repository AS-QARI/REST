import { sha256Hex } from "./sha256";

const OWNER_USERNAME = "OREZ";
const LOCAL_PASSWORD_HASH = "168167b979b5fbf412591964c809645cd7d13b52627f208fc1508dd7e6046886";

async function localPasswordMatches(password: string) {
  if (crypto.subtle) {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hashed = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return hashed === LOCAL_PASSWORD_HASH;
  }
  return sha256Hex(password) === LOCAL_PASSWORD_HASH;
}

export async function authenticateOwner(username: string, password: string): Promise<{ ok: boolean; message: string }> {
  if (username.trim().toUpperCase() !== OWNER_USERNAME) return { ok: false, message: "بيانات الدخول غير صحيحة." };
  return (await localPasswordMatches(password))
    ? { ok: true, message: "" }
    : { ok: false, message: "بيانات الدخول غير صحيحة." };
}

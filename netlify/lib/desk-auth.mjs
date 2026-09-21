import { createHash } from "node:crypto";

export const ALLOWED_EMAILS = ["desk@innerturn.com.au", "kwan.ajak87@gmail.com"];
export const IDENTITY_API = "https://innerturn.com.au/.netlify/identity";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function allowedEmail(email) {
  return ALLOWED_EMAILS.includes(normalizeEmail(email));
}

export function hashUnlockPhrase(email, phrase) {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}\n${String(phrase ?? "")}`, "utf8")
    .digest("hex");
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

export function bearerToken(req) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function identityBase(siteUrl) {
  const raw = String(siteUrl || IDENTITY_API).replace(/\/$/, "");
  return raw.includes("/.netlify/identity") ? raw : `${raw}/.netlify/identity`;
}

export async function requireIdentity(req, options = {}) {
  const token = bearerToken(req);
  if (!token) return { ok: false, error: "identity", status: 401 };

  const fetchImpl = options.fetchImpl || fetch;
  const url = `${identityBase(options.siteUrl)}/user`;
  let user;
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return { ok: false, error: "identity", status: 401 };
    user = await res.json();
  } catch {
    return { ok: false, error: "identity", status: 401 };
  }

  const email = normalizeEmail(user?.email);
  if (!allowedEmail(email)) return { ok: false, error: "identity", status: 401 };
  return { ok: true, email };
}

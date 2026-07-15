import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type BootstrapRequest = {
  email?: string;
  intranet_user_id?: string | null;
  permission?: string;
  issued_at?: number;
  expires_at?: number;
  nonce?: string;
  session_id?: string;
};

type AccessRecord = {
  id?: string;
  intranet_user_id?: string | null;
  corporate_email?: string;
  finance_user_id?: string;
  full_name?: string | null;
  role?: string;
  status?: string;
  biometric_status?: string;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
};

const REQUIRED_PERMISSION = "financeiro:controle-bancario";
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_ASSERTION_LIFETIME_MS = 90_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left.toLowerCase());
  const rightBytes = new TextEncoder().encode(right.toLowerCase());
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= leftBytes[index] ^ rightBytes[index];
  return mismatch === 0;
}

async function privateSetting(admin: ReturnType<typeof createClient>, key: string) {
  const { data, error } = await admin.from("edge_private_settings").select("value").eq("key", key).maybeSingle<{ value: string }>();
  if (error) throw error;
  return data?.value ?? "";
}

async function securityEvent(
  admin: ReturnType<typeof createClient>,
  eventType: string,
  level: "info" | "warning" | "critical",
  userId: string | null,
  metadata: Record<string, unknown>
) {
  await admin.from("security_events").insert({ user_id: userId, event_type: eventType, level, metadata });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ code: "FINANCE_BOOTSTRAP_FAILED", message: "Serviço financeiro indisponível." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rawBody = await request.text();
  const signature = request.headers.get("x-step-finance-signature")?.trim() ?? "";
  if (!signature || !rawBody) return json({ code: "INVALID_ASSERTION", message: "Assinatura corporativa ausente." }, 401);

  let body: BootstrapRequest;
  try { body = JSON.parse(rawBody) as BootstrapRequest; }
  catch { return json({ code: "INVALID_ASSERTION", message: "Solicitação inválida." }, 400); }

  const corporateEmail = normalizeEmail(body.email);
  const intranetUserId = validUuid(body.intranet_user_id) ? String(body.intranet_user_id) : null;
  const permission = String(body.permission ?? "");
  const issuedAt = Number(body.issued_at ?? 0);
  const expiresAt = Number(body.expires_at ?? 0);
  const nonce = String(body.nonce ?? "").trim();
  const sessionId = String(body.session_id ?? "").trim();
  const now = Date.now();

  if (!corporateEmail.includes("@") || permission !== REQUIRED_PERMISSION || nonce.length < 24) {
    return json({ code: "INVALID_ASSERTION", message: "Solicitação corporativa inválida." }, 400);
  }
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || Math.abs(now - issuedAt) > MAX_CLOCK_SKEW_MS || expiresAt <= now || expiresAt - issuedAt > MAX_ASSERTION_LIFETIME_MS) {
    return json({ code: "ASSERTION_EXPIRED", message: "Solicitação corporativa expirada." }, 401);
  }

  try {
    const secret = Deno.env.get("FINANCE_SSO_SHARED_SECRET") || await privateSetting(admin, "FINANCE_SSO_SHARED_SECRET");
    if (!secret) throw new Error("SSO secret missing");

    const expectedSignature = await hmacSha256(secret, `v1.${rawBody}`);
    if (!constantTimeEqual(signature, expectedSignature)) {
      await securityEvent(admin, "auth.intranet_sso_invalid_signature", "warning", null, { permission, issued_at: issuedAt });
      return json({ code: "INVALID_SIGNATURE", message: "Assinatura corporativa inválida." }, 401);
    }

    const nonceHash = await sha256(nonce);
    const corporateEmailHash = await sha256(corporateEmail);
    const sessionHash = sessionId ? await sha256(sessionId) : "";
    const { data: nonceAccepted, error: nonceError } = await admin.rpc("consume_intranet_sso_nonce", {
      p_nonce_hash: nonceHash,
      p_session_hash: sessionHash,
      p_email_hash: corporateEmailHash,
      p_issued_at: new Date(issuedAt).toISOString(),
      p_expires_at: new Date(expiresAt).toISOString()
    });
    if (nonceError) throw nonceError;
    if (nonceAccepted !== true) {
      await securityEvent(admin, "auth.intranet_sso_replay_blocked", "warning", null, { corporate_email_hash: corporateEmailHash, session_hash: sessionHash });
      return json({ code: "ASSERTION_REPLAYED", message: "Solicitação já utilizada." }, 409);
    }

    const { data: accessData, error: accessError } = await admin.rpc("finance_access_get_by_identity", {
      p_intranet_user_id: intranetUserId,
      p_corporate_email: corporateEmail
    });
    if (accessError) throw accessError;
    const access = (accessData ?? null) as AccessRecord | null;

    if (!access?.finance_user_id) {
      await securityEvent(admin, "auth.finance_access_not_granted", "warning", null, { corporate_email_hash: corporateEmailHash, intranet_user_id: intranetUserId });
      return json({ code: "FINANCE_ACCESS_NOT_GRANTED", message: "Seu usuário não possui concessão financeira." }, 403);
    }
    if (access.status === "blocked" || access.status === "revoked") {
      await securityEvent(admin, "auth.finance_access_blocked", "warning", access.finance_user_id, { status: access.status, corporate_email_hash: corporateEmailHash });
      return json({ code: "FINANCE_USER_BLOCKED", message: "Acesso financeiro bloqueado." }, 403);
    }
    if (!access.role || !["owner", "master_admin", "editor", "viewer", "auditor"].includes(access.role)) {
      return json({ code: "FINANCE_ACCESS_NOT_GRANTED", message: "Perfil financeiro inválido." }, 403);
    }

    if (intranetUserId) {
      const { error: bindError } = await admin.rpc("finance_bind_intranet_identity", {
        p_finance_user_id: access.finance_user_id,
        p_intranet_user_id: intranetUserId,
        p_corporate_email: corporateEmail
      });
      if (bindError) throw bindError;
    }

    const { data: profile, error: profileError } = await admin.from("profiles").select("id,email,full_name,status").eq("id", access.finance_user_id).maybeSingle<ProfileRow>();
    if (profileError) throw profileError;
    if (!profile || profile.status !== "active") return json({ code: "FINANCE_USER_NOT_PROVISIONED", message: "Identidade financeira interna incompleta." }, 404);

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(access.finance_user_id);
    if (authUserError || !authUser.user) return json({ code: "FINANCE_USER_NOT_PROVISIONED", message: "Identidade financeira interna incompleta." }, 404);

    const redirectTo = Deno.env.get("FINANCE_SSO_REDIRECT_URL") || await privateSetting(admin, "FINANCE_SSO_REDIRECT_URL") || "https://intranet-step.netlify.app/financeiro/access";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: profile.email, options: { redirectTo } });
    if (linkError) throw linkError;
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("Supabase did not return hashed token");

    await admin.rpc("finance_touch_access", { p_finance_user_id: access.finance_user_id });
    await securityEvent(admin, "auth.intranet_sso_bootstrap_issued", "info", access.finance_user_id, {
      role: access.role,
      access_status: access.status,
      biometric_status: access.biometric_status,
      permission,
      corporate_email_hash: corporateEmailHash,
      session_hash: sessionHash,
      assertion_expires_at: new Date(expiresAt).toISOString()
    });

    return json({
      token_hash: tokenHash,
      expires_in: 60,
      access: {
        role: access.role,
        status: access.status,
        biometric_status: access.biometric_status
      }
    });
  } catch (error) {
    console.error("intranet-session-bootstrap", error);
    return json({ code: "FINANCE_BOOTSTRAP_FAILED", message: "Não foi possível iniciar a sessão financeira." }, 500);
  }
});

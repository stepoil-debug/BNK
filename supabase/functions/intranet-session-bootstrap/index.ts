import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type BootstrapRequest = {
  email?: string;
  permission?: string;
  issued_at?: number;
  expires_at?: number;
  nonce?: string;
  session_id?: string;
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

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left.toLowerCase());
  const rightBytes = new TextEncoder().encode(right.toLowerCase());
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

async function privateSetting(admin: ReturnType<typeof createClient>, key: string) {
  const { data, error } = await admin
    .from("edge_private_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle<{ value: string }>();
  if (error) throw error;
  return data?.value ?? "";
}

async function securityEvent(
  admin: ReturnType<typeof createClient>,
  eventType: string,
  level: "info" | "success" | "warning" | "danger" | "critical",
  userId: string | null,
  metadata: Record<string, unknown>
) {
  await admin.from("security_events").insert({
    user_id: userId,
    event_type: eventType,
    level,
    metadata
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ code: "FINANCE_BOOTSTRAP_FAILED", message: "Serviço financeiro indisponível." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const rawBody = await request.text();
  const signature = request.headers.get("x-step-finance-signature")?.trim() ?? "";
  if (!signature || !rawBody) {
    return json({ code: "INVALID_ASSERTION", message: "Assinatura corporativa ausente." }, 401);
  }

  let body: BootstrapRequest;
  try {
    body = JSON.parse(rawBody) as BootstrapRequest;
  } catch {
    return json({ code: "INVALID_ASSERTION", message: "Solicitação inválida." }, 400);
  }

  const email = normalizeEmail(body.email);
  const permission = String(body.permission ?? "");
  const issuedAt = Number(body.issued_at ?? 0);
  const expiresAt = Number(body.expires_at ?? 0);
  const nonce = String(body.nonce ?? "").trim();
  const sessionId = String(body.session_id ?? "").trim();
  const now = Date.now();

  if (!email || !email.includes("@") || permission !== REQUIRED_PERMISSION || nonce.length < 24) {
    return json({ code: "INVALID_ASSERTION", message: "Solicitação corporativa inválida." }, 400);
  }

  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    Math.abs(now - issuedAt) > MAX_CLOCK_SKEW_MS ||
    expiresAt <= now ||
    expiresAt - issuedAt > MAX_ASSERTION_LIFETIME_MS
  ) {
    return json({ code: "ASSERTION_EXPIRED", message: "Solicitação corporativa expirada." }, 401);
  }

  try {
    const secret =
      Deno.env.get("FINANCE_SSO_SHARED_SECRET") ||
      await privateSetting(admin, "FINANCE_SSO_SHARED_SECRET");
    if (!secret) throw new Error("SSO secret missing");

    const expectedSignature = await hmacSha256(secret, `v1.${rawBody}`);
    if (!constantTimeEqual(signature, expectedSignature)) {
      await securityEvent(admin, "auth.intranet_sso_invalid_signature", "warning", null, {
        permission,
        issued_at: issuedAt
      });
      return json({ code: "INVALID_SIGNATURE", message: "Assinatura corporativa inválida." }, 401);
    }

    const nonceHash = await sha256(nonce);
    const emailHash = await sha256(email);
    const sessionHash = sessionId ? await sha256(sessionId) : "";
    const { data: nonceAccepted, error: nonceError } = await admin.rpc(
      "consume_intranet_sso_nonce",
      {
        p_nonce_hash: nonceHash,
        p_session_hash: sessionHash,
        p_email_hash: emailHash,
        p_issued_at: new Date(issuedAt).toISOString(),
        p_expires_at: new Date(expiresAt).toISOString()
      }
    );
    if (nonceError) throw nonceError;
    if (nonceAccepted !== true) {
      await securityEvent(admin, "auth.intranet_sso_replay_blocked", "warning", null, {
        email_hash: emailHash,
        session_hash: sessionHash
      });
      return json({ code: "ASSERTION_REPLAYED", message: "Solicitação já utilizada." }, 409);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,status")
      .ilike("email", email)
      .maybeSingle<ProfileRow>();
    if (profileError) throw profileError;
    if (!profile) {
      return json({ code: "FINANCE_USER_NOT_PROVISIONED", message: "Usuário ainda não cadastrado no financeiro." }, 404);
    }
    if (profile.status !== "active") {
      await securityEvent(admin, "auth.intranet_sso_profile_blocked", "warning", profile.id, {
        status: profile.status,
        email_hash: emailHash
      });
      return json({ code: "FINANCE_USER_BLOCKED", message: "Acesso financeiro bloqueado." }, 403);
    }

    const { data: roleRow, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .maybeSingle<{ role: string }>();
    if (roleError) throw roleError;
    if (!roleRow?.role || roleRow.role === "blocked") {
      return json({ code: "FINANCE_USER_BLOCKED", message: "Perfil financeiro sem autorização." }, 403);
    }

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
    if (authUserError || !authUser.user) {
      return json({ code: "FINANCE_USER_NOT_PROVISIONED", message: "Usuário financeiro incompleto." }, 404);
    }

    const redirectTo =
      Deno.env.get("FINANCE_SSO_REDIRECT_URL") ||
      await privateSetting(admin, "FINANCE_SSO_REDIRECT_URL") ||
      "https://intranet-step.netlify.app/financeiro/access";

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: { redirectTo }
    });
    if (linkError) throw linkError;

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("Supabase did not return hashed token");

    await securityEvent(admin, "auth.intranet_sso_bootstrap_issued", "success", profile.id, {
      role: roleRow.role,
      permission,
      email_hash: emailHash,
      session_hash: sessionHash,
      assertion_expires_at: new Date(expiresAt).toISOString()
    });

    return json({ token_hash: tokenHash, expires_in: 60 });
  } catch (error) {
    console.error("intranet-session-bootstrap", error);
    return json({ code: "FINANCE_BOOTSTRAP_FAILED", message: "Não foi possível iniciar a sessão financeira." }, 500);
  }
});

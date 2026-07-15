import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type AccessRole = "owner" | "master_admin" | "editor" | "viewer" | "auditor";
type AccessStatus = "pending_face" | "active" | "blocked" | "revoked";

type AccessRecord = {
  id?: string;
  intranet_user_id?: string | null;
  corporate_email?: string;
  finance_user_id?: string;
  full_name?: string | null;
  role?: AccessRole;
  status?: AccessStatus;
  biometric_status?: string;
  can_manage_master?: boolean;
  can_manage_users?: boolean;
  can_edit_finance?: boolean;
};

type RequestBody = {
  action?: string;
  corporate_email?: string;
  full_name?: string;
  intranet_user_id?: string | null;
  role?: string;
  status?: string;
  reason?: string;
  target_finance_user_id?: string;
};

const allowedOrigins = new Set([
  "https://intranet-step.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://intranet-step.netlify.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
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

function legacyRole(record: AccessRecord) {
  if (record.status === "blocked" || record.status === "revoked") return "blocked";
  switch (record.role) {
    case "owner": return "super_admin";
    case "master_admin": return "admin";
    case "editor": return "finance_editor";
    case "viewer": return "finance_viewer";
    case "auditor": return "auditor";
    default: return "blocked";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json(request, { code: "FINANCE_ACCESS_UNAVAILABLE", message: "Serviço de acesso indisponível." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(request, { code: "FINANCE_SESSION_REQUIRED", message: "Sessão financeira ausente." }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return json(request, { code: "FINANCE_SESSION_INVALID", message: "Sessão financeira inválida ou expirada." }, 401);
  }

  const actorId = authData.user.id;
  const { data: actorAccess, error: actorError } = await admin.rpc("finance_access_get_by_finance_user", {
    p_finance_user_id: actorId
  });
  if (actorError) {
    console.error("finance actor access", actorError);
    return json(request, { code: "FINANCE_ACCESS_FAILED", message: "Não foi possível validar o perfil financeiro." }, 500);
  }

  const actor = (actorAccess ?? null) as AccessRecord | null;
  if (!actor || actor.status === "blocked" || actor.status === "revoked") {
    return json(request, { code: "FINANCE_ACCESS_DENIED", message: "Acesso financeiro não autorizado." }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const action = String(body.action ?? "me");

  async function syncLegacyAccess(record: AccessRecord) {
    if (!record.finance_user_id) return;
    const role = legacyRole(record);
    const { error } = await admin.from("user_roles").upsert(
      { user_id: record.finance_user_id, role, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) throw error;
  }

  async function listAllAccess() {
    const { data, error } = await admin.rpc("finance_list_access", {
      p_actor_finance_user_id: actorId
    });
    if (error) throw error;
    return (data ?? []) as AccessRecord[];
  }

  async function findOrCreateShadowUser(email: string, fullName: string, intranetUserId: string | null) {
    const { data: linked } = await admin.rpc("finance_access_get_by_identity", {
      p_intranet_user_id: intranetUserId,
      p_corporate_email: email
    });
    const existingAccess = linked as AccessRecord | null;
    if (existingAccess?.finance_user_id) return existingAccess.finance_user_id;

    let page = 1;
    let existingUserId = "";
    while (page <= 10 && !existingUserId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      const user = data.users.find((item) => item.email?.toLowerCase() === email);
      if (user) existingUserId = user.id;
      if (data.users.length < 100) break;
      page += 1;
    }

    if (!existingUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email,
          identity_source: "intranet_step",
          intranet_user_id: intranetUserId
        },
        app_metadata: {
          finance_shadow_identity: true
        }
      });
      if (error || !data.user) throw error ?? new Error("Não foi possível criar a identidade financeira interna.");
      existingUserId = data.user.id;
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: existingUserId,
      email,
      full_name: fullName || email,
      status: "active",
      is_admin: false,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    return existingUserId;
  }

  try {
    if (action === "me") {
      return json(request, { access: actor });
    }

    if (action === "list") {
      if (!actor.can_manage_users) {
        return json(request, { code: "FINANCE_USER_ADMIN_DENIED", message: "Você não pode visualizar a gestão de acessos." }, 403);
      }
      return json(request, { users: await listAllAccess() });
    }

    if (action === "assign_master") {
      if (!actor.can_manage_master || actor.role !== "owner") {
        return json(request, { code: "FINANCE_OWNER_REQUIRED", message: "Somente o Proprietário do Financeiro pode definir o Administrador Master." }, 403);
      }

      const email = normalizeEmail(body.corporate_email);
      const fullName = String(body.full_name ?? "").trim();
      const intranetUserId = validUuid(body.intranet_user_id) ? String(body.intranet_user_id) : null;
      if (!email.includes("@")) return json(request, { code: "INVALID_EMAIL", message: "Informe um e-mail corporativo válido." }, 400);

      const targetUserId = await findOrCreateShadowUser(email, fullName, intranetUserId);
      const { data, error } = await admin.rpc("finance_assign_master", {
        p_actor_finance_user_id: actorId,
        p_target_finance_user_id: targetUserId,
        p_target_intranet_user_id: intranetUserId,
        p_target_corporate_email: email,
        p_target_full_name: fullName
      });
      if (error) throw error;

      const records = await listAllAccess();
      await Promise.all(records.map(syncLegacyAccess));
      return json(request, { access: data });
    }

    if (action === "grant_access") {
      if (!actor.can_manage_users || !["owner", "master_admin"].includes(String(actor.role))) {
        return json(request, { code: "FINANCE_MASTER_REQUIRED", message: "Somente o Proprietário ou Administrador Master pode conceder acesso financeiro." }, 403);
      }

      const role = String(body.role ?? "");
      if (!["editor", "viewer", "auditor"].includes(role)) {
        return json(request, { code: "INVALID_FINANCE_ROLE", message: "Perfil financeiro inválido." }, 400);
      }

      const email = normalizeEmail(body.corporate_email);
      const fullName = String(body.full_name ?? "").trim();
      const intranetUserId = validUuid(body.intranet_user_id) ? String(body.intranet_user_id) : null;
      const reason = String(body.reason ?? "").trim();
      if (!email.includes("@")) return json(request, { code: "INVALID_EMAIL", message: "Informe um e-mail corporativo válido." }, 400);

      const targetUserId = await findOrCreateShadowUser(email, fullName, intranetUserId);
      const { data, error } = await admin.rpc("finance_grant_access", {
        p_actor_finance_user_id: actorId,
        p_target_finance_user_id: targetUserId,
        p_target_intranet_user_id: intranetUserId,
        p_target_corporate_email: email,
        p_target_full_name: fullName,
        p_role: role,
        p_reason: reason
      });
      if (error) throw error;
      await syncLegacyAccess(data as AccessRecord);
      return json(request, { access: data });
    }

    if (action === "change_status") {
      if (!actor.can_manage_users || !validUuid(body.target_finance_user_id)) {
        return json(request, { code: "FINANCE_USER_ADMIN_DENIED", message: "Operação de acesso não autorizada." }, 403);
      }
      const status = String(body.status ?? "");
      if (!["active", "blocked", "revoked", "pending_face"].includes(status)) {
        return json(request, { code: "INVALID_ACCESS_STATUS", message: "Status de acesso inválido." }, 400);
      }

      const { data, error } = await admin.rpc("finance_change_access_status", {
        p_actor_finance_user_id: actorId,
        p_target_finance_user_id: body.target_finance_user_id,
        p_new_status: status,
        p_reason: String(body.reason ?? "").trim()
      });
      if (error) throw error;
      await syncLegacyAccess(data as AccessRecord);
      return json(request, { access: data });
    }

    return json(request, { code: "UNKNOWN_ACTION", message: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("finance-access-control", action, error);
    const message = error instanceof Error ? error.message : "Falha na administração financeira.";
    const denied = /denied|owner|master|permission|42501/i.test(message);
    return json(request, {
      code: denied ? "FINANCE_ACCESS_OPERATION_DENIED" : "FINANCE_ACCESS_OPERATION_FAILED",
      message: denied ? "Operação não autorizada pela governança financeira." : "Não foi possível concluir a operação."
    }, denied ? 403 : 500);
  }
});

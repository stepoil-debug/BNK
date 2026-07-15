import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type AccessRecord = {
  id?: string;
  role?: string;
  status?: string;
  finance_user_id?: string;
  intranet_user_id?: string | null;
  corporate_email?: string;
  biometric_status?: string;
};

type SampleInput = {
  pose?: string;
  data_base64?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  quality_score?: number;
  captured_at?: string;
};

type RequestBody = {
  action?: string;
  session_id?: string;
  consent?: boolean;
  consent_version?: string;
  samples?: SampleInput[];
  descriptor?: number[] | null;
  model_provider?: string;
  model_version?: string;
  quality_score?: number;
  liveness_method?: string;
  provider_payload?: Record<string, unknown>;
};

const BUCKET = "biometric-reference-images";
const MAX_SAMPLE_BYTES = 5 * 1024 * 1024;
const REQUIRED_POSES = ["center", "left", "right"];
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

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(clean.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function privateSetting(admin: ReturnType<typeof createClient>, key: string) {
  const { data, error } = await admin.from("edge_private_settings").select("value").eq("key", key).maybeSingle<{ value: string }>();
  if (error) throw error;
  return data?.value ?? "";
}

async function encryptDescriptor(admin: ReturnType<typeof createClient>, descriptor: number[] | null | undefined) {
  if (!descriptor?.length) return { ciphertext: null, iv: null, algorithm: null, dimensions: null };
  if (![128, 512].includes(descriptor.length) || descriptor.some((value) => !Number.isFinite(value))) {
    throw new Error("Descritor facial inválido.");
  }

  const secret = Deno.env.get("BIOMETRIC_ENCRYPTION_KEY") || await privateSetting(admin, "BIOMETRIC_ENCRYPTION_KEY");
  if (!secret) throw new Error("Chave biométrica não configurada.");

  const secretBytes = base64ToBytes(secret);
  if (secretBytes.length !== 32) throw new Error("Chave biométrica inválida.");

  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(descriptor));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
    algorithm: "AES-256-GCM",
    dimensions: descriptor.length
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(request, { code: "BIOMETRIC_UNAVAILABLE", message: "Serviço biométrico indisponível." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(request, { code: "FINANCE_SESSION_REQUIRED", message: "Sessão financeira ausente." }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(request, { code: "FINANCE_SESSION_INVALID", message: "Sessão financeira inválida." }, 401);

  const financeUserId = authData.user.id;
  const { data: accessData, error: accessError } = await admin.rpc("finance_access_get_by_finance_user", { p_finance_user_id: financeUserId });
  if (accessError) return json(request, { code: "FINANCE_ACCESS_FAILED", message: "Não foi possível validar o acesso financeiro." }, 500);
  const access = (accessData ?? null) as AccessRecord | null;
  if (!access || access.status === "blocked" || access.status === "revoked") return json(request, { code: "FINANCE_ACCESS_DENIED", message: "Acesso financeiro não autorizado." }, 403);

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const action = String(body.action ?? "status");

  try {
    if (action === "status") {
      const { data, error } = await admin.rpc("finance_biometric_get_status", { p_finance_user_id: financeUserId });
      if (error) throw error;
      return json(request, { biometric: data, access });
    }

    if (action === "begin_enrollment") {
      const poses = [...REQUIRED_POSES].sort(() => crypto.getRandomValues(new Uint32Array(1))[0] % 3 - 1);
      const challenge = {
        poses,
        instructions: {
          center: "Olhe diretamente para a câmera",
          left: "Vire lentamente o rosto para a esquerda",
          right: "Vire lentamente o rosto para a direita"
        },
        nonce: crypto.randomUUID()
      };
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const { data, error } = await admin.rpc("finance_biometric_begin", {
        p_finance_user_id: financeUserId,
        p_purpose: access.biometric_status === "recapture_required" ? "recapture" : "enrollment",
        p_challenge: challenge,
        p_expires_at: expiresAt
      });
      if (error) throw error;
      return json(request, { session_id: data, challenge, expires_at: expiresAt });
    }

    if (action === "complete_enrollment") {
      if (!body.consent || body.consent_version !== "finance-biometric-v1") {
        return json(request, { code: "BIOMETRIC_CONSENT_REQUIRED", message: "O consentimento biométrico é obrigatório." }, 400);
      }
      if (!body.session_id || !Array.isArray(body.samples) || body.samples.length < 3 || body.samples.length > 4) {
        return json(request, { code: "BIOMETRIC_SAMPLES_REQUIRED", message: "São necessárias três capturas faciais." }, 400);
      }

      const uniquePoses = new Set(body.samples.map((sample) => String(sample.pose ?? "")));
      if (!REQUIRED_POSES.every((pose) => uniquePoses.has(pose))) {
        return json(request, { code: "BIOMETRIC_POSES_REQUIRED", message: "Capture as posições frontal, esquerda e direita." }, 400);
      }

      const uploadedPaths: string[] = [];
      const sampleRecords: Record<string, unknown>[] = [];
      const hashes = new Set<string>();

      try {
        for (const sample of body.samples) {
          const pose = String(sample.pose ?? "");
          const mimeType = String(sample.mime_type ?? "image/jpeg");
          if (!REQUIRED_POSES.includes(pose) || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Amostra facial inválida.");

          const bytes = base64ToBytes(String(sample.data_base64 ?? ""));
          if (bytes.length < 10_000 || bytes.length > MAX_SAMPLE_BYTES) throw new Error("Tamanho da captura facial inválido.");
          if ((sample.width ?? 0) < 320 || (sample.height ?? 0) < 240) throw new Error("A resolução mínima é 320x240.");

          const hash = await sha256(bytes);
          if (hashes.has(hash)) throw new Error("As capturas faciais precisam ser diferentes.");
          hashes.add(hash);

          const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
          const path = `intranet/${access.id}/${body.session_id}/${pose}.${extension}`;
          const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
            contentType: mimeType,
            cacheControl: "0",
            upsert: false
          });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);

          sampleRecords.push({
            pose,
            storage_path: path,
            content_hash: hash,
            mime_type: mimeType,
            size_bytes: bytes.length,
            width: sample.width,
            height: sample.height,
            quality_score: Math.max(0, Math.min(1, Number(sample.quality_score ?? 0.75))),
            captured_at: sample.captured_at || new Date().toISOString()
          });
        }

        const encrypted = await encryptDescriptor(admin, body.descriptor);
        const qualityScore = Math.max(0, Math.min(1, Number(body.quality_score ?? 0.75)));
        const { data, error } = await admin.rpc("finance_biometric_complete_enrollment", {
          p_finance_user_id: financeUserId,
          p_session_id: body.session_id,
          p_consent_version: body.consent_version,
          p_model_provider: String(body.model_provider ?? "step-guided-face-capture"),
          p_model_version: String(body.model_version ?? "capture-v1"),
          p_descriptor_ciphertext: encrypted.ciphertext,
          p_descriptor_iv: encrypted.iv,
          p_descriptor_algorithm: encrypted.algorithm,
          p_descriptor_dimensions: encrypted.dimensions,
          p_quality_score: qualityScore,
          p_liveness_method: String(body.liveness_method ?? "guided-random-pose-sequence"),
          p_samples: sampleRecords,
          p_provider_payload: {
            ...(body.provider_payload ?? {}),
            server_validations: {
              required_poses: REQUIRED_POSES,
              unique_images: true,
              private_bucket: true,
              descriptor_encrypted: Boolean(encrypted.ciphertext)
            }
          }
        });
        if (error) throw error;
        return json(request, { access: data, enrolled: true });
      } catch (error) {
        if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
        throw error;
      }
    }

    return json(request, { code: "UNKNOWN_ACTION", message: "Ação biométrica não reconhecida." }, 400);
  } catch (error) {
    console.error("finance-biometric", action, error);
    return json(request, { code: "BIOMETRIC_OPERATION_FAILED", message: error instanceof Error ? error.message : "Não foi possível concluir o cadastro facial." }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "https://intranet-step.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    code: "AUTH_PATH_DISABLED",
    message: "A validação por token de e-mail foi desativada. Use a sessão autenticada da Intranet STEP."
  }), { status: 410, headers });
});

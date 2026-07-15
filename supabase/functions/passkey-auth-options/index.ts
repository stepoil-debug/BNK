import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const responseHeaders = {
  "Access-Control-Allow-Origin": "https://intranet-step.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  return new Response(JSON.stringify({
    code: "ROUTE_RETIRED",
    message: "Esta rota não faz parte do fluxo integrado. Abra o módulo pela Intranet STEP."
  }), { status: 410, headers: responseHeaders });
});

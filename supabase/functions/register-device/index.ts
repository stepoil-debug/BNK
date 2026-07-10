// Edge Function opcional para registrar dispositivo capturando IP real por header.
// Deploy: supabase functions deploy register-device
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const body = await req.json();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null;

  const payload = {
    user_id: userData.user.id,
    fingerprint_hash: body.fingerprint_hash,
    label: body.label ?? `${body.platform ?? 'device'} / ${body.browser_language ?? ''}`,
    user_agent: body.user_agent ?? null,
    platform: body.platform ?? null,
    browser_language: body.browser_language ?? null,
    timezone: body.timezone ?? null,
    screen_resolution: body.screen_resolution ?? null,
    ip_address: ip,
    status: 'pending'
  };

  const { data, error } = await adminClient
    .from('approved_devices')
    .upsert(payload, { onConflict: 'user_id,fingerprint_hash', ignoreDuplicates: false })
    .select('*')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });

  await adminClient.from('security_events').insert({
    user_id: userData.user.id,
    event_type: 'device.registered_edge',
    level: 'warning',
    ip_address: ip,
    fingerprint_hash: body.fingerprint_hash,
    user_agent: body.user_agent,
    metadata: body
  });

  return new Response(JSON.stringify({ device: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

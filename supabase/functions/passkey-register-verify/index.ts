// Passkey/WebAuthn - valida cadastro e salva credencial pública.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@10';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const body = await req.json();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const { data: challengeRow, error: challengeError } = await adminClient
    .from('webauthn_challenges')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('flow', 'registration')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (challengeError || !challengeRow) return new Response(JSON.stringify({ error: 'Challenge inválido ou expirado' }), { status: 400, headers: corsHeaders });

  const verification = await verifyRegistrationResponse({
    response: body.credential,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: Deno.env.get('WEBAUTHN_ORIGIN')!,
    expectedRPID: Deno.env.get('WEBAUTHN_RP_ID')!,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) return new Response(JSON.stringify({ error: 'Passkey não verificada' }), { status: 400, headers: corsHeaders });
  const info = verification.registrationInfo;
  await adminClient.from('webauthn_credentials').insert({
    user_id: userData.user.id,
    credential_id: info.credentialID,
    public_key: base64url(info.credentialPublicKey),
    counter: info.counter,
    transports: body.credential?.response?.transports ?? null,
    device_name: body.device_name ?? 'Passkey'
  });
  await adminClient.from('webauthn_challenges').delete().eq('id', challengeRow.id);
  return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

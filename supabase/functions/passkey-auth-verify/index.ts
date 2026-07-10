// Passkey/WebAuthn - verifica autenticação biométrica.
// Observação: em produção, revise a serialização da public_key conforme versão do simplewebauthn.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@10';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function b64urlToBytes(value: string) { const base64 = value.replace(/-/g, '+').replace(/_/g, '/'); const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '='); return Uint8Array.from(atob(padded), c => c.charCodeAt(0)); }

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

  const credentialId = body.credential?.id;
  const { data: credential, error: credError } = await adminClient
    .from('webauthn_credentials')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('credential_id', credentialId)
    .single();
  if (credError || !credential) return new Response(JSON.stringify({ error: 'Credencial não encontrada' }), { status: 400, headers: corsHeaders });

  const { data: challengeRow } = await adminClient
    .from('webauthn_challenges')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('flow', 'authentication')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!challengeRow) return new Response(JSON.stringify({ error: 'Challenge inválido ou expirado' }), { status: 400, headers: corsHeaders });

  const verification = await verifyAuthenticationResponse({
    response: body.credential,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: Deno.env.get('WEBAUTHN_ORIGIN')!,
    expectedRPID: Deno.env.get('WEBAUTHN_RP_ID')!,
    requireUserVerification: true,
    authenticator: {
      credentialID: credential.credential_id,
      credentialPublicKey: b64urlToBytes(credential.public_key),
      counter: credential.counter,
      transports: credential.transports ?? undefined
    }
  });

  if (!verification.verified) return new Response(JSON.stringify({ error: 'Passkey inválida' }), { status: 400, headers: corsHeaders });
  await adminClient.from('webauthn_credentials').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', credential.id);
  await adminClient.from('webauthn_challenges').delete().eq('id', challengeRow.id);
  await adminClient.from('security_events').insert({ user_id: userData.user.id, event_type: 'passkey.verified', level: 'info' });
  return new Response(JSON.stringify({ verified: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// Passkey/WebAuthn - geração das opções de cadastro biométrico.
// Deploy depois de configurar WEBAUTHN_RP_ID e WEBAUTHN_ORIGIN.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@10';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const encoder = new TextEncoder();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const rpName = Deno.env.get('WEBAUTHN_RP_NAME') ?? 'STEP Finance Control';
  const rpID = Deno.env.get('WEBAUTHN_RP_ID')!;
  const { data: existing } = await adminClient.from('webauthn_credentials').select('credential_id, transports').eq('user_id', userData.user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: encoder.encode(userData.user.id),
    userName: userData.user.email ?? userData.user.id,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: (existing ?? []).map((cred: any) => ({ id: cred.credential_id, type: 'public-key', transports: cred.transports ?? undefined }))
  });

  await adminClient.from('webauthn_challenges').insert({ user_id: userData.user.id, challenge: options.challenge, flow: 'registration' });
  return new Response(JSON.stringify(options), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

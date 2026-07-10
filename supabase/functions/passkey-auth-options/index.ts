// Passkey/WebAuthn - opções para validação biométrica pós-login.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@10';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const { data: creds } = await adminClient.from('webauthn_credentials').select('credential_id, transports').eq('user_id', userData.user.id);
  const options = await generateAuthenticationOptions({
    rpID: Deno.env.get('WEBAUTHN_RP_ID')!,
    userVerification: 'required',
    allowCredentials: (creds ?? []).map((cred: any) => ({ id: cred.credential_id, type: 'public-key', transports: cred.transports ?? undefined }))
  });

  await adminClient.from('webauthn_challenges').insert({ user_id: userData.user.id, challenge: options.challenge, flow: 'authentication' });
  return new Response(JSON.stringify(options), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

-- O BNK passa a aceitar autenticação exclusivamente pela ponte da Intranet STEP.

revoke all on table public.email_access_tokens
  from public, anon, authenticated, service_role;
revoke all on table public.webauthn_credentials
  from public, anon, authenticated, service_role;
revoke all on table public.webauthn_challenges
  from public, anon, authenticated, service_role;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.local_admin_create_user(text, citext, text, text, text)
  from public, anon, authenticated;
revoke all on function public.local_current_user(text)
  from public, anon, authenticated;
revoke all on function public.local_get_my_device_status(text, text)
  from public, anon, authenticated;
revoke all on function public.local_list_devices(text)
  from public, anon, authenticated;
revoke all on function public.local_list_security_events(text)
  from public, anon, authenticated;
revoke all on function public.local_list_users(text)
  from public, anon, authenticated;
revoke all on function public.local_login(citext, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.local_logout(text)
  from public, anon, authenticated;
revoke all on function public.local_update_device_status(text, uuid, text)
  from public, anon, authenticated;

comment on table public.email_access_tokens is
  'LEGACY RETIRED: autenticação financeira ocorre exclusivamente pela Intranet STEP.';
comment on table public.webauthn_credentials is
  'LEGACY RETIRED: passkey não é uma rota de autenticação independente do BNK.';
comment on table public.webauthn_challenges is
  'LEGACY RETIRED: passkey não é uma rota de autenticação independente do BNK.';

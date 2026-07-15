-- Helpers usados por RLS consultam somente auth.uid(), mas não precisam ser executáveis por anon.

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.has_any_role(public.user_role[]) from public, anon;
revoke all on function public.is_admin() from public, anon;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.has_any_role(public.user_role[]) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

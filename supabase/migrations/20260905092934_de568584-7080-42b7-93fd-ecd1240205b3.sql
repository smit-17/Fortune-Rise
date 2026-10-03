revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.has_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.is_active_user(uuid) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;
grant execute on function public.has_permission(uuid, text) to service_role;
grant execute on function public.is_active_user(uuid) to service_role;
revoke all on function public.reset_accounting_data() from public, anon;
grant execute on function public.reset_accounting_data() to authenticated, service_role;

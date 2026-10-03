-- own-profile updates (last login, session preference, password-change flag)
create policy "Update own profile" on public.profiles
for update to authenticated
using (id = auth.uid() and status = 'active')
with check (id = auth.uid());

-- nobody may flip their own active status; only a Super Admin may flip anyone's
create or replace function public.guard_profile_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() = old.id then
      raise exception 'You cannot change your own active status';
    end if;
    if not public.has_role(auth.uid(), 'super_admin')
       and not public.has_permission(auth.uid(), 'users.edit') then
      raise exception 'Not authorised to change account status';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_status() from public, anon, authenticated;
create trigger profiles_guard_status before update on public.profiles
for each row execute function public.guard_profile_status();

-- role assignment
create policy "User managers assign roles" on public.user_roles
for insert to authenticated
with check (
  public.has_permission(auth.uid(), 'users.add')
  and user_id <> auth.uid()
  and (role <> 'super_admin' or public.has_role(auth.uid(), 'super_admin'))
);
create policy "User managers remove roles" on public.user_roles
for delete to authenticated
using (
  public.has_permission(auth.uid(), 'users.edit')
  and user_id <> auth.uid()
  and (role <> 'super_admin' or public.has_role(auth.uid(), 'super_admin'))
);

-- per-user permission overrides: Super Admin only
create policy "Super admin sets permission overrides" on public.user_permissions
for insert to authenticated
with check (public.has_role(auth.uid(), 'super_admin') and user_id <> auth.uid());
create policy "Super admin updates permission overrides" on public.user_permissions
for update to authenticated
using (public.has_role(auth.uid(), 'super_admin') and user_id <> auth.uid())
with check (public.has_role(auth.uid(), 'super_admin') and user_id <> auth.uid());
create policy "Super admin clears permission overrides" on public.user_permissions
for delete to authenticated
using (public.has_role(auth.uid(), 'super_admin') and user_id <> auth.uid());

grant insert, delete on public.user_roles to authenticated;
grant insert, update, delete on public.user_permissions to authenticated;

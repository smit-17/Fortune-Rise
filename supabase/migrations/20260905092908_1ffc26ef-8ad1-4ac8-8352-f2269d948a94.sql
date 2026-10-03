-- ========== roles enum ==========
create type public.app_role as enum ('super_admin','owner','admin','manager','staff','viewer');

-- ========== profiles ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  session_timeout_minutes integer not null default 60,
  must_change_password boolean not null default false,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ========== user_roles ==========
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ========== role_permissions ==========
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission text not null,
  unique (role, permission)
);
grant select on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;
alter table public.role_permissions enable row level security;

-- ========== user_permissions (per-user overrides) ==========
create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  allowed boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (user_id, permission)
);
grant select on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;
alter table public.user_permissions enable row level security;

-- ========== audit log ==========
create table public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target text,
  result text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);
grant select, insert on public.security_audit_log to authenticated;
grant insert on public.security_audit_log to anon;
grant all on public.security_audit_log to service_role;
alter table public.security_audit_log enable row level security;

-- ========== helper functions (security definer) ==========
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_active_user(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and status = 'active')
$$;

create or replace function public.has_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _user_id is null then false
    when not exists (select 1 from public.profiles p where p.id = _user_id and p.status = 'active') then false
    when exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'super_admin') then true
    when exists (select 1 from public.user_permissions up where up.user_id = _user_id and up.permission = _permission)
      then (select up.allowed from public.user_permissions up where up.user_id = _user_id and up.permission = _permission)
    else exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = _user_id and rp.permission = _permission
    )
  end
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- ========== policies ==========
create policy "Read own profile" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "User managers read all profiles" on public.profiles
for select to authenticated using (public.has_permission(auth.uid(), 'users.view'));
create policy "User managers create profiles" on public.profiles
for insert to authenticated with check (public.has_permission(auth.uid(), 'users.add'));
create policy "User managers update profiles" on public.profiles
for update to authenticated using (public.has_permission(auth.uid(), 'users.edit'))
with check (public.has_permission(auth.uid(), 'users.edit'));

create policy "Read own roles" on public.user_roles
for select to authenticated using (user_id = auth.uid());
create policy "User managers read roles" on public.user_roles
for select to authenticated using (public.has_permission(auth.uid(), 'users.view'));

create policy "Signed-in users read role permissions" on public.role_permissions
for select to authenticated using (true);

create policy "Read own permission overrides" on public.user_permissions
for select to authenticated using (user_id = auth.uid());
create policy "User managers read permission overrides" on public.user_permissions
for select to authenticated using (public.has_permission(auth.uid(), 'users.view'));

create policy "Signed-in users write audit entries" on public.security_audit_log
for insert to authenticated with check (true);
create policy "Anonymous login attempts are logged" on public.security_audit_log
for insert to anon with check (actor_id is null and action in ('login.failure','login.success'));
create policy "Settings viewers read audit log" on public.security_audit_log
for select to authenticated using (public.has_permission(auth.uid(), 'settings.view'));

-- ========== workspace: authenticated + permission gated ==========
drop policy if exists "Anyone can read the shared workspace" on public.workspace;
drop policy if exists "Anyone can update the shared workspace" on public.workspace;
drop policy if exists "Anyone can create the shared workspace" on public.workspace;

create policy "Accounting viewers read the workspace" on public.workspace
for select to authenticated using (public.has_permission(auth.uid(), 'accounting.view'));
create policy "Accounting editors create the workspace" on public.workspace
for insert to authenticated
with check (id = 'lepdo-main' and public.has_permission(auth.uid(), 'accounting.edit'));
create policy "Accounting editors update the workspace" on public.workspace
for update to authenticated
using (id = 'lepdo-main' and public.has_permission(auth.uid(), 'accounting.edit'))
with check (id = 'lepdo-main' and public.has_permission(auth.uid(), 'accounting.edit'));

-- ========== seed role permissions ==========
insert into public.role_permissions (role, permission) values
  ('owner','dashboard.view'),('owner','accounting.view'),('owner','accounting.add'),
  ('owner','accounting.edit'),('owner','accounting.delete'),('owner','reports.view'),
  ('owner','settings.view'),('owner','settings.edit'),('owner','users.view'),
  ('admin','dashboard.view'),('admin','accounting.view'),('admin','accounting.add'),
  ('admin','accounting.edit'),('admin','accounting.delete'),('admin','reports.view'),
  ('admin','settings.view'),('admin','settings.edit'),('admin','users.view'),
  ('admin','users.add'),('admin','users.edit'),
  ('manager','dashboard.view'),('manager','accounting.view'),('manager','accounting.add'),
  ('manager','accounting.edit'),('manager','reports.view'),
  ('staff','dashboard.view'),('staff','accounting.view'),('staff','accounting.add'),
  ('viewer','dashboard.view'),('viewer','accounting.view'),('viewer','reports.view');

-- ========== safe accounting-data reset ==========
create or replace function public.reset_accounting_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current jsonb;
  cleaned jsonb;
begin
  if not public.has_permission(auth.uid(), 'dataset.reset') then
    raise exception 'Not authorised to reset accounting data';
  end if;

  select data into current from public.workspace where id = 'lepdo-main' for update;
  if current is null then
    current := '{}'::jsonb;
  end if;

  cleaned := current;
  cleaned := cleaned
    || jsonb_build_object(
      'parties', '[]'::jsonb,
      'brokers', '[]'::jsonb,
      'sellers', '[]'::jsonb,
      'salesInvoices', '[]'::jsonb,
      'purchaseBills', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'auditLogs', '[]'::jsonb,
      'liabilities', '[]'::jsonb,
      'liabilityEntries', '[]'::jsonb,
      'stockEntries', '[]'::jsonb,
      'teamMembers', '[]'::jsonb,
      'teamPayments', '[]'::jsonb,
      'goals', '[]'::jsonb,
      'emiPlans', '[]'::jsonb,
      'emiPayments', '[]'::jsonb
    );

  if exists (select 1 from public.workspace where id = 'lepdo-main') then
    update public.workspace set data = cleaned, updated_at = now() where id = 'lepdo-main';
  else
    insert into public.workspace (id, data, updated_at) values ('lepdo-main', cleaned, now());
  end if;

  insert into public.security_audit_log (actor_id, action, target, result)
  values (auth.uid(), 'dataset.reset', 'workspace:lepdo-main', 'success');

  return (select jsonb_build_object('data', data, 'updated_at', updated_at)
          from public.workspace where id = 'lepdo-main');
end;
$$;

revoke all on function public.reset_accounting_data() from public;
grant execute on function public.reset_accounting_data() to authenticated;

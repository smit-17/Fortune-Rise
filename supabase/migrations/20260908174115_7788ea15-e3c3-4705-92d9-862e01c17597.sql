create or replace function public.reset_accounting_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current jsonb;
  cleaned jsonb;
  reset_at text := clock_timestamp()::text;
begin
  if not public.has_permission(auth.uid(), 'dataset.reset') then
    raise exception 'Not authorised to reset accounting data';
  end if;

  select data into current
  from public.workspace
  where id = 'lepdo-main'
  for update;

  if current is null then
    current := '{}'::jsonb;
  end if;

  cleaned := current || jsonb_build_object(
    'bankAccounts', coalesce((
      select jsonb_agg(account || jsonb_build_object('openingBalance', 0))
      from jsonb_array_elements(coalesce(current->'bankAccounts', '[]'::jsonb)) account
    ), '[]'::jsonb),
    'cashLocations', coalesce((
      select jsonb_agg(location || jsonb_build_object('openingBalance', 0))
      from jsonb_array_elements(coalesce(current->'cashLocations', '[]'::jsonb)) location
    ), '[]'::jsonb),
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
    'emiPayments', '[]'::jsonb,
    'accountingResetAt', to_jsonb(reset_at)
  );

  if exists (select 1 from public.workspace where id = 'lepdo-main') then
    update public.workspace
    set data = cleaned, updated_at = clock_timestamp()
    where id = 'lepdo-main';
  else
    insert into public.workspace (id, data, updated_at)
    values ('lepdo-main', cleaned, clock_timestamp());
  end if;

  insert into public.security_audit_log (actor_id, action, target, result, metadata)
  values (
    auth.uid(),
    'dataset.reset',
    'workspace:lepdo-main',
    'success',
    jsonb_build_object('reset_at', reset_at)
  );

  return (
    select jsonb_build_object('data', data, 'updated_at', updated_at)
    from public.workspace
    where id = 'lepdo-main'
  );
end;
$$;

revoke all on function public.reset_accounting_data() from public, anon;
grant execute on function public.reset_accounting_data() to authenticated, service_role;
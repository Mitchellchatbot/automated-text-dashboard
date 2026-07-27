-- Rename villa_alumni -> alumni (table) and upsert_villa_alumni -> upsert_alumni.
--
-- Design notes:
--   * ALTER TABLE ... RENAME preserves all data, indexes, constraints, RLS
--     policies, grants, and the sms_opt_out column — nothing is dropped.
--   * Dependent object names (indexes, trigger, policy, constraint) are renamed
--     for consistency so no "villa_alumni" identifier remains in the schema.
--   * The upsert function's body is SECURITY DEFINER with search_path = '' and
--     references the table by its fully-qualified name, so it MUST be recreated
--     to point at public.alumni. The edge function now calls rpc('upsert_alumni').
--   * One-time migration: run once. The table rename is guarded so a double-run
--     is a clear no-op rather than a hard error.

-- ---------------------------------------------------------------------------
-- Table + dependent objects
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.villa_alumni') is not null then
    alter table public.villa_alumni rename to alumni;
  end if;
end
$$;

alter index if exists public.villa_alumni_discharge_date_idx rename to alumni_discharge_date_idx;
alter index if exists public.villa_alumni_status_idx        rename to alumni_status_idx;
alter index if exists public.villa_alumni_search_trgm_idx   rename to alumni_search_trgm_idx;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_villa_alumni_touch') then
    alter trigger trg_villa_alumni_touch on public.alumni rename to trg_alumni_touch;
  end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'alumni'
               and policyname = 'villa_alumni_staff_read') then
    alter policy villa_alumni_staff_read on public.alumni rename to alumni_staff_read;
  end if;
  if exists (select 1 from pg_constraint where conname = 'villa_alumni_discharge_date_range') then
    alter table public.alumni rename constraint villa_alumni_discharge_date_range to alumni_discharge_date_range;
  end if;
end
$$;

comment on table public.alumni is
  'Discharged clients synced daily from Salesforce via Zapier. discharge_date is the single source of truth; follow-up groups are computed in the dashboard and never stored.';

-- ---------------------------------------------------------------------------
-- Bulk upsert RPC: recreate as upsert_alumni against public.alumni, drop the
-- old name. Body is identical to 0003 (in-body role guard, COALESCE preserve).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_alumni(p_records jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
begin
  -- Defense-in-depth: never writable by the two roles that could be granted
  -- EXECUTE by mistake. NULL/unknown roles pass (the EXECUTE grant is the gate).
  if coalesce(auth.role(), 'service_role') in ('anon', 'authenticated') then
    raise exception 'upsert_alumni: forbidden for role %', coalesce(auth.role(), '(none)');
  end if;

  with incoming as (
    select distinct on (salesforce_id)
      salesforce_id, full_name, email, phone_number, discharge_date, status
    from jsonb_to_recordset(p_records) as x(
      salesforce_id text, full_name text, email text,
      phone_number text, discharge_date date, status text
    )
    where coalesce(salesforce_id, '') <> ''
  )
  update public.alumni t set
    full_name      = coalesce(i.full_name, t.full_name),
    email          = coalesce(i.email, t.email),
    phone_number   = coalesce(i.phone_number, t.phone_number),
    discharge_date = coalesce(i.discharge_date, t.discharge_date),
    status         = coalesce(i.status, t.status),
    updated_at     = now()
  from incoming i
  where t.salesforce_id = i.salesforce_id;
  get diagnostics v_updated = row_count;

  with incoming as (
    select distinct on (salesforce_id)
      salesforce_id, full_name, email, phone_number, discharge_date, status
    from jsonb_to_recordset(p_records) as x(
      salesforce_id text, full_name text, email text,
      phone_number text, discharge_date date, status text
    )
    where coalesce(salesforce_id, '') <> ''
  )
  insert into public.alumni
    (salesforce_id, full_name, email, phone_number, discharge_date, status)
  select
    i.salesforce_id, i.full_name, i.email, i.phone_number, i.discharge_date, i.status
  from incoming i
  where not exists (
    select 1 from public.alumni t where t.salesforce_id = i.salesforce_id
  )
  on conflict (salesforce_id) do nothing;  -- race guard for concurrent inserts
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

revoke all on function public.upsert_alumni(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_alumni(jsonb) to service_role;

drop function if exists public.upsert_villa_alumni(jsonb);

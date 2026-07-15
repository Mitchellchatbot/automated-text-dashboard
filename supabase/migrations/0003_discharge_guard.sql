-- Hardening: bound discharge_date, and add a defense-in-depth role guard to the
-- bulk-upsert RPC.
--
--   * discharge_date CHECK: an implausible value (ancient/typo, e.g. 1900-01-01)
--     inflates the dashboard's enumerated `discharge_date IN (...)` due-date list
--     and can 414 the request. The webhook already rejects such years at ingest
--     (parseDischargeDate); this is the DB-level backstop for any other write
--     path. Bounds are immutable literals (CHECK cannot use now()/current_date).
--   * upsert_villa_alumni role guard: EXECUTE is already granted only to
--     service_role, but assert it in-body so a future accidental grant to
--     anon/authenticated still cannot write. Fail-safe: only the escalation
--     targets are denied, so an unexpected/NULL role never breaks the webhook.

-- ---------------------------------------------------------------------------
-- discharge_date range backstop
-- ---------------------------------------------------------------------------
alter table public.villa_alumni
  drop constraint if exists villa_alumni_discharge_date_range;
alter table public.villa_alumni
  add constraint villa_alumni_discharge_date_range
  check (
    discharge_date is null
    or (discharge_date >= date '2000-01-01' and discharge_date < date '2101-01-01')
  );

-- ---------------------------------------------------------------------------
-- upsert RPC with an in-body role guard (body otherwise identical to 0002)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_villa_alumni(p_records jsonb)
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
    raise exception 'upsert_villa_alumni: forbidden for role %', coalesce(auth.role(), '(none)');
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
  update public.villa_alumni t set
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
  insert into public.villa_alumni
    (salesforce_id, full_name, email, phone_number, discharge_date, status)
  select
    i.salesforce_id, i.full_name, i.email, i.phone_number, i.discharge_date, i.status
  from incoming i
  where not exists (
    select 1 from public.villa_alumni t where t.salesforce_id = i.salesforce_id
  )
  on conflict (salesforce_id) do nothing;  -- race guard for concurrent inserts
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

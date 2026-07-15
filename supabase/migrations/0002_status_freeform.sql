-- Status becomes free-form + display-only.
--
-- Salesforce now sends the Lead's own Status (Open/Working/Closed-style), which
-- does not map to a fixed vocabulary, and EVERY discharged record is eligible for
-- follow-ups regardless of Status. So we store Status verbatim and no longer gate
-- eligibility on it. Follow-up timing is still computed in the dashboard from
-- discharge_date alone.

alter table public.villa_alumni
  drop constraint if exists villa_alumni_status_check;

alter table public.villa_alumni
  alter column status drop default,
  alter column status drop not null;

-- Rebuild the bulk upsert without the 'active' fallback. COALESCE still preserves
-- a stored status when a daily sync omits it; created_at is never touched.
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

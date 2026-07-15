-- Villa Alumni Follow-up Dashboard — schema, RLS, and staff allowlist.
--
-- Design notes:
--   * discharge_date is DATE (no time): PostgREST returns 'YYYY-MM-DD', so all
--     day-count math in the dashboard stays timezone-safe.
--   * NO follow-up columns exist — follow-up timing is computed dynamically in
--     the dashboard from discharge_date, never stored.
--   * Only the service_role (the webhook) may write; authenticated staff may
--     only read, gated by a SECURITY DEFINER allowlist check.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.villa_alumni (
  id             uuid primary key default gen_random_uuid(),
  salesforce_id  text not null unique,
  full_name      text,
  email          text,
  phone_number   text,
  discharge_date date,
  status         text not null default 'active'
                   check (status in ('active','inactive','completed','opted_out','deceased','unknown')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.villa_alumni is
  'Discharged clients synced daily from Salesforce via Zapier. discharge_date is the single source of truth; follow-up groups are computed in the dashboard and never stored.';

-- Indexes for the due-today IN-query, status filter, and All-Alumni search/sort.
create index if not exists villa_alumni_discharge_date_idx on public.villa_alumni (discharge_date);
create index if not exists villa_alumni_status_idx on public.villa_alumni (status);
create index if not exists villa_alumni_search_trgm_idx on public.villa_alumni
  using gin (full_name gin_trgm_ops, email gin_trgm_ops, salesforce_id gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_villa_alumni_touch on public.villa_alumni;
create trigger trg_villa_alumni_touch
  before update on public.villa_alumni
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Staff allowlist + is_staff() gate
-- ---------------------------------------------------------------------------
create table if not exists public.staff_allowlist (
  email      text primary key,          -- store lower-cased
  created_at timestamptz not null default now()
);

comment on table public.staff_allowlist is
  'Lower-cased emails permitted to read the dashboard. Editable without a redeploy.';

-- SECURITY DEFINER so the allowlist lookup is NOT subject to the caller''s RLS
-- (an inline subquery against an RLS-locked table would deny every staff member).
create or replace function public.is_staff()
  returns boolean
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select exists (
    select 1
    from public.staff_allowlist
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.villa_alumni enable row level security;
alter table public.staff_allowlist enable row level security;

-- Authenticated allowlisted staff may read alumni. No INSERT/UPDATE/DELETE
-- policy exists, so only the service_role (webhook, which bypasses RLS) writes.
drop policy if exists villa_alumni_staff_read on public.villa_alumni;
create policy villa_alumni_staff_read
  on public.villa_alumni
  for select
  to authenticated
  using (public.is_staff());

-- staff_allowlist has RLS enabled and NO policies -> unreadable via the Data API
-- by anon/authenticated; only is_staff() (definer) and service_role can see it.

-- Since 2026-04, new public tables are not auto-exposed to the Data API.
grant select on public.villa_alumni to authenticated;

-- ---------------------------------------------------------------------------
-- Bulk upsert RPC (called by the webhook with the service_role key)
--
-- Done as UPDATE-then-INSERT rather than a single ON CONFLICT so that the
-- incoming status stays NULLABLE in the COALESCE. This is what prevents
-- "status resurrection": a missing/unrecognized incoming status (normalized to
-- NULL by the webhook) can never overwrite a stored terminal status
-- (completed/opted_out/deceased) back to 'active'. Likewise COALESCE keeps any
-- field the daily sync omits. created_at is never touched; updated_at bumps.
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
    status         = coalesce(i.status, t.status, 'active'),
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
    i.salesforce_id, i.full_name, i.email, i.phone_number, i.discharge_date,
    coalesce(i.status, 'active')
  from incoming i
  where not exists (
    select 1 from public.villa_alumni t where t.salesforce_id = i.salesforce_id
  )
  on conflict (salesforce_id) do nothing;  -- race guard for concurrent inserts
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

revoke all on function public.upsert_villa_alumni(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_villa_alumni(jsonb) to service_role;

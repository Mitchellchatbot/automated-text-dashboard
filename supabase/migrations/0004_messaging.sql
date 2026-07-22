-- Blooio texting: editable templates, a per-send audit log, and an opt-out flag.
--
-- Design notes:
--   * Sending is an ACTION with side effects, so unlike follow-up timing (which is
--     computed and never stored) we MUST persist what was sent, to whom, and when
--     — otherwise a person could be texted twice.
--   * All writes here are done by authenticated staff via RLS (is_staff()), not the
--     service_role. The webhook/service_role model for villa_alumni is untouched.
--   * A partial unique index prevents a duplicate SUCCESSFUL send while still
--     allowing a retry after a failure.

-- ---------------------------------------------------------------------------
-- Editable message templates (one row per template key)
-- ---------------------------------------------------------------------------
create table if not exists public.message_templates (
  key        text primary key,
  body       text not null,
  updated_at timestamptz not null default now()
);

comment on table public.message_templates is
  'Editable SMS/iMessage templates. Body may contain {{first_name}} / {{full_name}} placeholders, filled per-recipient at send time.';

-- Seed the one-time "see off" template. Edit the wording in the dashboard.
insert into public.message_templates (key, body) values
  ('see_off',
   'Hi {{first_name}}, congratulations on completing treatment — we''re proud of you and here whenever you need support. Reply STOP to opt out.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Per-send audit log
-- ---------------------------------------------------------------------------
create table if not exists public.message_log (
  id                  uuid primary key default gen_random_uuid(),
  salesforce_id       text not null,
  template_key        text not null references public.message_templates(key),
  phone_number        text not null,          -- the E.164 number actually texted
  body_sent           text not null,          -- the rendered text we sent
  provider_message_id text,                    -- Blooio's message id (for status webhooks)
  status              text not null default 'queued'
                        check (status in ('queued','sent','delivered','read','failed','opted_out')),
  error               text,
  sent_by             text,                    -- staff email that triggered the send
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.message_log is
  'Every attempted send. One successful send per (salesforce_id, template_key) is enforced; failures may be retried.';

create index if not exists message_log_salesforce_id_idx on public.message_log (salesforce_id);
create index if not exists message_log_provider_id_idx on public.message_log (provider_message_id);

-- At most one non-failed send per person per template (dedupe; retry-after-failure allowed).
create unique index if not exists message_log_dedup_idx
  on public.message_log (salesforce_id, template_key)
  where status <> 'failed';

-- ---------------------------------------------------------------------------
-- Opt-out flag on the alum (set by the STOP webhook later; checked before every send)
-- ---------------------------------------------------------------------------
alter table public.villa_alumni
  add column if not exists sms_opt_out boolean not null default false;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (reuse the existing touch_updated_at() from 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_message_templates_touch on public.message_templates;
create trigger trg_message_templates_touch
  before update on public.message_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_message_log_touch on public.message_log;
create trigger trg_message_log_touch
  before update on public.message_log
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — authenticated allowlisted staff only
-- ---------------------------------------------------------------------------
alter table public.message_templates enable row level security;
alter table public.message_log enable row level security;

drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read
  on public.message_templates for select to authenticated using (public.is_staff());

drop policy if exists message_templates_staff_update on public.message_templates;
create policy message_templates_staff_update
  on public.message_templates for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists message_log_staff_read on public.message_log;
create policy message_log_staff_read
  on public.message_log for select to authenticated using (public.is_staff());

drop policy if exists message_log_staff_insert on public.message_log;
create policy message_log_staff_insert
  on public.message_log for insert to authenticated with check (public.is_staff());

drop policy if exists message_log_staff_update on public.message_log;
create policy message_log_staff_update
  on public.message_log for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Data API grants (new tables are not auto-exposed since 2026-04).
grant select, update on public.message_templates to authenticated;
grant select, insert, update on public.message_log to authenticated;

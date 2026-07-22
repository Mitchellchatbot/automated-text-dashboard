-- TCPA opt-out, done properly.
--
--   * Suppression is keyed on the PHONE NUMBER (E.164), not the lead — the law
--     suppresses a number, and one number may map to 0..N leads.
--   * Inbound messages (STOP/START and any reply) are captured for audit + the
--     conversation thread.
--   * A BEFORE INSERT trigger on message_log is a hard backstop: an outbound send
--     can never be logged to a suppressed number, even if app code forgets to check.
--   * The webhook (service_role) writes suppressions/inbound; staff may read, and
--     may set a manual suppression.

-- ---------------------------------------------------------------------------
-- Phone-keyed suppression list
-- ---------------------------------------------------------------------------
create table if not exists public.message_suppressions (
  phone_number text primary key,               -- E.164, e.g. +15551234567
  opted_out    boolean not null default true,  -- false = reactivated (kept for audit)
  reason       text,                            -- 'STOP', 'manual', ...
  source       text,                            -- 'inbound' | 'manual' | 'api'
  last_inbound text,                            -- the message text that triggered it
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.message_suppressions is
  'TCPA opt-out list keyed by E.164 phone. opted_out=true means do not text. Source of truth for send-time suppression.';

-- ---------------------------------------------------------------------------
-- Inbound messages (the reply half of a conversation; also where STOP arrives)
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_messages (
  id                  uuid primary key default gen_random_uuid(),
  phone_number        text not null,            -- E.164 sender
  provider_message_id text,
  body                text,
  received_at         timestamptz not null default now(),
  raw                 jsonb
);

create index if not exists inbound_messages_phone_idx on public.inbound_messages (phone_number);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists trg_message_suppressions_touch on public.message_suppressions;
create trigger trg_message_suppressions_touch
  before update on public.message_suppressions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Hard backstop: never record (hence never intend) a send to a suppressed number
-- ---------------------------------------------------------------------------
create or replace function public.block_suppressed_send()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if exists (
    select 1 from public.message_suppressions s
    where s.phone_number = new.phone_number and s.opted_out
  ) then
    raise exception 'send blocked: % has opted out of messages', new.phone_number
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_message_log_block_suppressed on public.message_log;
create trigger trg_message_log_block_suppressed
  before insert on public.message_log
  for each row
  when (new.status <> 'failed')   -- allow logging a failed attempt; block real sends
  execute function public.block_suppressed_send();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.message_suppressions enable row level security;
alter table public.inbound_messages enable row level security;

-- Staff may read suppressions and set them manually (verbal opt-outs). The webhook
-- writes via service_role (bypasses RLS).
drop policy if exists suppressions_staff_read on public.message_suppressions;
create policy suppressions_staff_read
  on public.message_suppressions for select to authenticated using (public.is_staff());

drop policy if exists suppressions_staff_insert on public.message_suppressions;
create policy suppressions_staff_insert
  on public.message_suppressions for insert to authenticated with check (public.is_staff());

drop policy if exists suppressions_staff_update on public.message_suppressions;
create policy suppressions_staff_update
  on public.message_suppressions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Inbound messages are read-only for staff; only the webhook (service_role) writes.
drop policy if exists inbound_staff_read on public.inbound_messages;
create policy inbound_staff_read
  on public.inbound_messages for select to authenticated using (public.is_staff());

grant select, insert, update on public.message_suppressions to authenticated;
grant select on public.inbound_messages to authenticated;

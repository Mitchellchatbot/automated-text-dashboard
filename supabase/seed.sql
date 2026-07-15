-- Local dev seed (runs on `supabase db reset`). Safe to edit.
--
-- Intentionally contains NO alumni rows — the app is driven entirely by real data
-- from the Salesforce → webhook pipeline. Only the staff allowlist is seeded so a
-- developer can sign in locally.

insert into public.staff_allowlist (email) values
  ('hasanrezarizvi@gmail.com')
on conflict (email) do nothing;

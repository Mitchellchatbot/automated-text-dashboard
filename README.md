# Villa Alumni Follow-up Dashboard

Follow-up scheduling for discharged clients ("alumni") at Villa. Discharged-client
records sync daily from **Salesforce → Zapier → a Supabase Edge Function**, and the
dashboard computes — **dynamically, never stored** — who is due for a follow-up.

- **`discharge_date` is the single source of truth.** Follow-up dates/groups are
  computed on every page load; nothing about the schedule is stored or hardcoded.
- **Timezone-safe:** all day-count math is done in **America/New_York**.
- **No manual updates:** the dashboard determines due status automatically.

## Architecture

```
Salesforce ──daily──▶ Zapier (Custom Request, POST + X-Webhook-Secret)
      │
      ▼
Supabase Edge Function  salesforce-webhook   (Deno, verify_jwt=false, service_role)
      │   validate → normalize → dedupe → bulk UPSERT on salesforce_id
      ▼
Supabase Postgres   table villa_alumni   (RLS: staff read only)
      ▲
      │ reads (authenticated, is_staff())
Next.js dashboard (Railway)  — computes days-since + due groups in TypeScript
```

- **Frontend:** Next.js 16 (App Router, TypeScript, Tailwind v4) → deployed on **Railway**.
- **Backend:** Supabase (Postgres + Auth + the webhook Edge Function).

## Follow-up schedule

A client appears in **Follow Ups Due Today** only on the exact day their
days-since-discharge equals a milestone:

`Day 3, 7, 14, 21, 30, 45, 60, 75, 90`, then **every 30 days forever** (Day 120, 150, …).

Because a follow-up is shown only on its exact day, the dashboard also shows a
stateless **"Reached in the last 7 days"** catch-up list — milestones that came due
recently — so nothing is silently missed if no one checked that day. **Every synced
record is a discharged alum, so all are eligible for follow-ups** — eligibility does
not depend on `Status`. The Salesforce Lead `Status` is stored verbatim and shown /
filterable in All Alumni.

## Local development

```bash
cp .env.local.example .env.local     # fill in your Supabase URL + anon key
npm install
npm run dev                          # needs a reachable Supabase backend (below)
```

### Tests / build

```bash
npm test          # 58 unit tests: date engine, webhook logic, data-layer assembly
npm run lint
npm run build
```

## Supabase setup (backend)

The Supabase CLI is already authenticated.

```bash
# 1. Create (or reuse) a project, then link it
supabase link --project-ref <your-project-ref>

# 2. Apply the schema (table, RLS, is_staff(), allowlist, upsert RPC)
supabase db push

# 3. Seed the staff allowlist (lower-cased emails) — via SQL editor or psql:
#    insert into public.staff_allowlist (email) values ('you@villa.org');
#    Then invite each staff user in Auth (public signup is disabled).

# 4. Deploy the webhook and set its secret
supabase functions deploy salesforce-webhook --no-verify-jwt
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

Auth is configured (in `supabase/config.toml`) to **disable public signup** and
**require email confirmation** — the allowlist gate trusts the verified `email`
claim. Ensure the project uses **JWT signing keys** (asymmetric) so the proxy can
verify sessions locally.

The webhook URL is:
`https://<project-ref>.supabase.co/functions/v1/salesforce-webhook`

## Zapier configuration

The finalized Salesforce step queries the **Lead** object for discharged alumni:

```sql
SELECT Id, Name, Phone, Email, Status, Discharged_Treatment__c, Discharged_Date__c
FROM Lead
WHERE Discharged_Treatment__c = true
```

In the third Zap step (**Webhooks by Zapier → Custom Request**):

- **Method:** `POST`
- **URL:** the webhook URL above
- **Headers:** `X-Webhook-Secret: <the WEBHOOK_SECRET value>`, `Content-Type: application/json`
- **Body (JSON):** the Salesforce records. The webhook accepts a bare array,
  `{ "records": [...] }`, or the raw SOQL response. It maps these fields (case-insensitive):

  | Our field       | Salesforce (any of)                                   |
  | --------------- | ----------------------------------------------------- |
  | `salesforce_id` | `Id`, `salesforce_id`, `sfid`                         |
  | `full_name`     | `Name`, `full_name`, `client_name`                    |
  | `email`         | `Email`, `email`                                      |
  | `phone_number`  | `Phone`, `phone`, `MobilePhone`                       |
  | `discharge_date`| **`Discharged_Date__c`**, `discharge_date`            |
  | `status`        | `Status`, `client_status`, `stage` (stored verbatim)  |
  | _(discharge flag)_ | `Discharged_Treatment__c` — a record explicitly `false` is skipped |

Recommend the SOQL be a **full snapshot** of discharged clients (not a delta) so a
failed chunk self-heals on the next daily run. The response is a per-record summary
(`{ received, inserted, updated, skipped, errors[] }`) with **no PII**; it returns
`200` on partial issues so Zapier does not retry-storm, and `4xx` only for bad
auth / malformed body.

## Deploying the frontend to Railway

```bash
railway link                 # link this repo to your Railway project
railway variables \
  --set NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
  --set NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
railway up                   # build + deploy
```

Only the **publishable/anon** key goes on the frontend. The `service_role` key lives
**only** in the Supabase Edge Function (via `supabase secrets`), never here. After
deploy, set the Supabase Auth **Site URL / redirect URLs** to your Railway domain so
magic-link sign-in redirects correctly.

## Security model

- Row Level Security on `villa_alumni`; only allowlisted, authenticated staff can
  read (via a `SECURITY DEFINER` `is_staff()` function). Only the service_role
  (webhook) writes.
- Webhook protected by a constant-time shared-secret check; body size capped.
- The daily upsert COALESCE-preserves any field a sync omits (a stored value is
  never clobbered with null); `created_at` is never touched, `updated_at` bumps.
- Discharge dates are parsed as calendar dates and **never timezone-shifted**
  (prevents a −1-day bug on midnight-UTC datetimes from Salesforce).

## Project structure

```
app/                       # login, (dashboard)/ Due-Today + /alumni, auth callback
app/globals.css            # design system (lavender/indigo tokens, motion, glare/star/dotfield)
components/followups/      # DueTodayView (hero, milestone timeline, section + client cards)
components/alumni/         # AllAlumniTable (record list), AlumniToolbar (search/filters)
components/motion/         # MotionInit, RevealScope (scroll reveal), Counter
components/background/     # DotField (subtle canvas background)
components/system/         # NavTabs, ThemeToggle (cookie-based), SignOut, Refreshers
lib/followup/              # THE date/follow-up engine (single source of truth)
lib/data/alumni.ts         # server-only queries (due-today, catch-up, all-alumni, count)
lib/supabase/              # @supabase/ssr clients + proxy session refresh
proxy.ts                   # Next 16 middleware (session refresh + auth redirect)
supabase/migrations/       # schema, RLS, is_staff(), upsert RPC
supabase/functions/salesforce-webhook/   # Deno webhook (lib.ts is unit-tested)
tests/                     # engine, webhook, data-layer, DueTodayView render
```

The UI is entirely data-driven from Supabase — no sample data ships in the app. When the table is
empty (no discharged leads yet) both pages show calm empty states; records appear automatically after
the daily Salesforce → webhook sync.

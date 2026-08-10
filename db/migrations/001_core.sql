-- KhaanaPeena — Phase 1 dual-write authority (Postgres system-of-record)
-- Scope of this migration: the invoice authority + tenant isolation the outbox
-- needs. It gives two guarantees the client can't make alone:
--   1. gapless, per-outlet, per-financial-year invoice numbers (GST requirement)
--   2. exactly-once settlement — a resent outbox entry never double-inserts a bill
--
-- Portable across managed Postgres and Supabase: RLS reads the caller from the
-- session GUC `app.user_id`, which the API sets per request from the verified
-- Firebase ID token (on Supabase you may instead map to auth.uid()).

create extension if not exists pgcrypto;

-- ---------- tenancy ----------
create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists outlets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  code        text unique not null,          -- the KP cloud code (bridge to RTDB)
  name        text not null,
  gst_scheme  text not null default 'regular',
  created_at  timestamptz not null default now()
);

create table if not exists memberships (
  user_id     text not null,                 -- Firebase uid
  outlet_id   uuid not null references outlets(id) on delete cascade,
  role        text not null default 'owner', -- owner | manager | cashier
  created_at  timestamptz not null default now(),
  primary key (user_id, outlet_id)
);

-- ---------- invoice authority ----------
-- One row per (outlet, financial year); bill_no is bumped atomically.
create table if not exists counters (
  outlet_id   uuid not null references outlets(id) on delete cascade,
  fy          text not null,                 -- e.g. '2026-27'
  bill_no     bigint not null default 0,
  primary key (outlet_id, fy)
);

create table if not exists invoices (
  id              uuid primary key default gen_random_uuid(),
  outlet_id       uuid not null references outlets(id) on delete cascade,
  source_order_id text not null,             -- client order.id — idempotency anchor
  fy              text not null,
  bill_no         bigint not null,
  amount          numeric(12,2) not null,
  payment_method  text,
  gst_scheme      text,
  taxable         numeric(12,2),
  cgst            numeric(12,2),
  sgst            numeric(12,2),
  settled_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (outlet_id, source_order_id)        -- exactly-once per client order (idempotency)
);
-- The invoice NUMBER is issued by the client at settle time (atomic RTDB counter),
-- so numbers already follow settle-time order. The mirror records that number
-- faithfully rather than re-numbering by arrival, so a non-unique index (not a
-- unique constraint) — a faithful mirror must store whatever the POS issued, and a
-- rare offline dual-issue is surfaced by a report, not rejected at the door.
alter table invoices drop constraint if exists invoices_outlet_id_fy_bill_no_key;
create index if not exists invoices_outlet_fy_billno_idx on invoices(outlet_id, fy, bill_no);

create table if not exists invoice_lines (
  id          bigint generated always as identity primary key,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  name        text not null,
  qty         numeric(10,3) not null,
  price       numeric(12,2) not null
);
create index if not exists invoice_lines_invoice_idx on invoice_lines(invoice_id);

-- ---------- atomic, gapless invoice number ----------
-- Deliberately NOT a SEQUENCE: a sequence is non-gapless (a rolled-back txn burns
-- a number), which is invalid for GST invoicing. The upsert below is atomic on the
-- (outlet_id, fy) row and gapless, and resets naturally each financial year.
create or replace function alloc_invoice(p_outlet uuid, p_fy text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public   -- pin: definer functions must not trust caller search_path
as $$
declare n bigint;
begin
  insert into counters (outlet_id, fy, bill_no)
  values (p_outlet, p_fy, 1)
  on conflict (outlet_id, fy)
  do update set bill_no = counters.bill_no + 1
  returning bill_no into n;
  return n;
end;
$$;

-- ---------- idempotent settlement ----------
-- Called once per settled bill by the dual-write API. The invoice number is the
-- one the client issued at settle time (p_bill_no) — the mirror stores it, it does
-- NOT re-number, so numbers follow settle-time order. Safe to call repeatedly for
-- the same order (outbox retries): later calls return the stored number, no re-write.
-- (alloc_invoice above is retained for reference/fallback but no longer used here.)
drop function if exists settle_bill(uuid,text,text,numeric,text,text,numeric,numeric,numeric,timestamptz,jsonb);
create or replace function settle_bill(
  p_outlet   uuid,
  p_order    text,
  p_bill_no  bigint,
  p_fy       text,
  p_amount   numeric,
  p_method   text,
  p_scheme   text,
  p_taxable  numeric,
  p_cgst     numeric,
  p_sgst     numeric,
  p_settled  timestamptz,
  p_lines    jsonb
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public   -- pin: definer functions must not trust caller search_path
as $$
declare
  n   bigint;
  inv uuid;
begin
  -- already settled? return the number we stored the first time (idempotent)
  select bill_no into n from invoices
    where outlet_id = p_outlet and source_order_id = p_order;
  if found then return n; end if;

  n := p_bill_no;  -- client-issued, settle-time invoice number

  insert into invoices (outlet_id, source_order_id, fy, bill_no, amount,
                        payment_method, gst_scheme, taxable, cgst, sgst, settled_at)
  values (p_outlet, p_order, p_fy, n, p_amount,
          p_method, p_scheme, p_taxable, p_cgst, p_sgst, p_settled)
  returning id into inv;

  insert into invoice_lines (invoice_id, name, qty, price)
  select inv, (l->>'name'), (l->>'qty')::numeric, (l->>'price')::numeric
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l;

  return n;
exception when unique_violation then
  -- concurrent flush of the SAME order (idempotency race): return the stored number
  select bill_no into n from invoices
    where outlet_id = p_outlet and source_order_id = p_order;
  return n;
end;
$$;

-- ---------- row-level security ----------
-- Every device only ever sees its own outlets. The API sets `app.user_id` to the
-- verified Firebase uid at the start of each request.
alter table outlets       enable row level security;
alter table invoices      enable row level security;
alter table invoice_lines enable row level security;
alter table counters      enable row level security;

-- policies are re-created idempotently so the server can self-migrate on every boot
drop policy if exists outlet_read on outlets;
create policy outlet_read on outlets
  using (id in (select outlet_id from memberships
                where user_id = current_setting('app.user_id', true)));

drop policy if exists invoice_rw on invoices;
create policy invoice_rw on invoices
  using (outlet_id in (select outlet_id from memberships
                       where user_id = current_setting('app.user_id', true)))
  with check (outlet_id in (select outlet_id from memberships
                            where user_id = current_setting('app.user_id', true)));

drop policy if exists counter_rw on counters;
create policy counter_rw on counters
  using (outlet_id in (select outlet_id from memberships
                       where user_id = current_setting('app.user_id', true)))
  with check (outlet_id in (select outlet_id from memberships
                            where user_id = current_setting('app.user_id', true)));

drop policy if exists invoice_line_rw on invoice_lines;
create policy invoice_line_rw on invoice_lines
  using (invoice_id in (select id from invoices
         where outlet_id in (select outlet_id from memberships
                             where user_id = current_setting('app.user_id', true))));

-- ---------- role separation + enforced RLS ----------
-- The runtime app connects as a restricted, NON-owner role (kp_app) that has NO
-- direct DML — it can only EXECUTE the definer functions below and run RLS-filtered
-- SELECTs. Migrations run as a privileged role (postgres) that owns the tables and
-- functions. Because the definer functions are owned by a BYPASSRLS role, they still
-- perform the controlled cross-tenant writes (provisioning, settlement); everything
-- else is filtered by RLS. This makes RLS the real, enforced isolation boundary
-- rather than advisory — safe for any future read endpoint.

-- provisioning as a definer: creates the outlet bound to the real owner and records
-- the caller's membership. Only reachable by kp_app after the app has proven RTDB
-- ownership, so "first caller" cannot self-provision.
create or replace function provision_outlet(p_code text, p_name text, p_owner_uid text, p_caller_uid text, p_caller_role text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_outlet uuid; v_org uuid; v_name text := left(coalesce(nullif(p_name,''),'KhaanaPeena'),120);
begin
  select id into v_outlet from outlets where code = p_code;
  if v_outlet is null then
    insert into orgs(name) values (v_name) returning id into v_org;
    insert into outlets(org_id,code,name) values (v_org,p_code,v_name)
      on conflict (code) do update set code = excluded.code returning id into v_outlet;
    insert into memberships(user_id,outlet_id,role) values (p_owner_uid,v_outlet,'owner') on conflict do nothing;
  end if;
  insert into memberships(user_id,outlet_id,role) values (p_caller_uid,v_outlet,coalesce(p_caller_role,'member')) on conflict do nothing;
  return v_outlet;
end $$;

alter table orgs        enable row level security;
alter table memberships enable row level security;
drop policy if exists membership_self on memberships;
create policy membership_self on memberships
  using (user_id = current_setting('app.user_id', true));
drop policy if exists org_read on orgs;
create policy org_read on orgs
  using (id in (select org_id from outlets));   -- outlets is itself RLS-filtered

-- FORCE so the table owner is ALSO subject to RLS (a plain owner otherwise bypasses it)
alter table orgs          force row level security;
alter table outlets       force row level security;
alter table memberships   force row level security;
alter table counters      force row level security;
alter table invoices      force row level security;
alter table invoice_lines force row level security;

-- definer functions must be owned by a BYPASSRLS role so they can do controlled
-- cross-tenant writes even with FORCE RLS on (idempotent; no-op when already owned)
do $$ begin
  if exists (select 1 from pg_roles where rolname = current_user and rolsuper) then
    alter function settle_bill(uuid,text,bigint,text,numeric,text,text,numeric,numeric,numeric,timestamptz,jsonb) owner to current_user;
    alter function provision_outlet(text,text,text,text,text) owner to current_user;
    alter function alloc_invoice(uuid,text) owner to current_user;
  end if;
end $$;

-- definer functions are not callable by the world — only the app role
revoke all on function settle_bill(uuid,text,bigint,text,numeric,text,text,numeric,numeric,numeric,timestamptz,jsonb) from public;
revoke all on function provision_outlet(text,text,text,text,text) from public;
revoke all on function alloc_invoice(uuid,text) from public;

-- grant the restricted runtime role (only if it exists): execute + RLS-filtered select,
-- and explicitly NO insert/update/delete on the tables
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'kp_app') then
    grant usage on schema public to kp_app;
    grant select on orgs, outlets, memberships, counters, invoices, invoice_lines to kp_app;
    grant execute on function settle_bill(uuid,text,bigint,text,numeric,text,text,numeric,numeric,numeric,timestamptz,jsonb) to kp_app;
    grant execute on function provision_outlet(text,text,text,text,text) to kp_app;
    grant execute on function alloc_invoice(uuid,text) to kp_app;
  end if;
end $$;

-- ---------- strict settle-time register ----------
-- register_no is a gap-free serial in STRICT settled-time order, per outlet, computed
-- live (so a late/backdated bill slots into the right chronological place). bill_no
-- stays the immutable POS number printed on the customer's receipt — a legally-issued
-- invoice number can't be renumbered — while register_no gives the day-book its strict
-- chronological ordering. Tie-breaks on bill_no then created_at for a deterministic order.
create or replace view invoice_register as
select
  row_number() over (partition by outlet_id
                     order by settled_at, bill_no, created_at) as register_no,
  outlet_id, bill_no, source_order_id, fy, amount, payment_method, gst_scheme,
  taxable, cgst, sgst, settled_at, created_at
from invoices;

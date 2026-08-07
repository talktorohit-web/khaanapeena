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
  unique (outlet_id, source_order_id),       -- exactly-once per client order
  unique (outlet_id, fy, bill_no)            -- no duplicate invoice numbers, ever
);

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
-- Called once per settled bill by the dual-write API. Safe to call repeatedly for
-- the same order (outbox retries): the first call allocates a number and writes the
-- invoice; every later call — including a concurrent race — returns the same number
-- and writes nothing new.
create or replace function settle_bill(
  p_outlet   uuid,
  p_order    text,
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
as $$
declare
  n   bigint;
  inv uuid;
begin
  -- already settled? return the number we issued the first time
  select bill_no into n from invoices
    where outlet_id = p_outlet and source_order_id = p_order;
  if found then return n; end if;

  n := alloc_invoice(p_outlet, p_fy);

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
  -- a concurrent settle of the SAME order won the race: return its number,
  -- and the number this call burned via alloc_invoice is simply skipped for that
  -- order (the winning row keeps its own gapless number).
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

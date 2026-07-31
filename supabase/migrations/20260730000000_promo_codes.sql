-- Standalone promotional codes (admin-managed, no referrer required)
create table if not exists promo_codes (
  code        text primary key,
  reward_days int  not null default 30,
  max_uses    int,                        -- null = unlimited
  use_count   int  not null default 0,
  expires_at  timestamptz,                -- null = no expiry
  created_at  timestamptz default now()
);

-- Seed initial promo codes
insert into promo_codes (code, reward_days) values
  ('BREASTIVAL', 60),
  ('14DAY',      14)
on conflict (code) do update
  set reward_days = excluded.reward_days;

-- These codes were previously seeded into referral_codes (with a fake
-- "owner" user) before promo_codes existed. promo_codes is now the correct
-- home for admin-managed codes and is checked first, so remove the old
-- rows to avoid two sources of truth drifting apart.
delete from referral_codes where code in ('BREASTIVAL', '14DAY');

-- Track who redeemed which promo code (reuse referral_uses table isn't ideal — separate table)
create table if not exists promo_uses (
  id           uuid primary key default gen_random_uuid(),
  code         text not null references promo_codes(code),
  used_by      uuid not null references auth.users(id),
  redeemed_at  timestamptz default now(),
  unique(used_by, code)   -- one redemption per user per code
);

-- RLS: users cannot read/write promo tables directly; only the edge function (service role) touches them
alter table promo_codes enable row level security;
alter table promo_uses  enable row level security;
-- No SELECT policies → only service role can read

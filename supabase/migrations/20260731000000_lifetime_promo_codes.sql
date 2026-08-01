-- Support permanent (lifetime) promo codes alongside the existing
-- day-limited ones (BREASTIVAL, 14DAY).
alter table promo_codes add column if not exists is_lifetime boolean not null default false;

insert into promo_codes (code, reward_days, is_lifetime) values
  ('TBMVIP26', 0, true)
on conflict (code) do update
  set is_lifetime = excluded.is_lifetime;

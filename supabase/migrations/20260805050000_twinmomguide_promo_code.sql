-- TWINMOMGUIDE: 14-day promo code for Katie's friend's audience. Same
-- in-app promo_codes/redeem-referral flow as TBMCLIENT, so one code works
-- on both iOS and Android. No payment method required and no auto-charge
-- -- access genuinely ends after 14 days, at which point the normal
-- paywall/upgrade prompts apply like any lapsed subscriber.
insert into promo_codes (code, reward_days) values
  ('TWINMOMGUIDE', 14)
on conflict (code) do update
  set reward_days = excluded.reward_days;

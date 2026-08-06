-- TBMCLIENT: 60-day promo code for Katie's TBM clients. Redeemed in-app
-- (works identically on iOS and Android since it goes through Pump Coach's
-- own promo_codes/redeem-referral flow, not a native App Store/Play
-- Console offer code), so a single code covers both platforms.
insert into promo_codes (code, reward_days) values
  ('TBMCLIENT', 60)
on conflict (code) do update
  set reward_days = excluded.reward_days;

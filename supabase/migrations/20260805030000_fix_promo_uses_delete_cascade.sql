-- delete-account deletes app-data tables and the profiles row BEFORE
-- calling auth.admin.deleteUser(). promo_uses.used_by referenced
-- auth.users(id) with the default NO ACTION delete rule -- so any user
-- who had ever redeemed a promo code would hit a foreign-key violation on
-- that final call, by which point their profile and health data were
-- already gone but the login itself survived: a "zombie" account, wiped
-- of data but stuck reporting deletion failed. Every other table
-- referencing auth.users already cascades correctly (verified directly
-- against the live schema); this was the one exception.
alter table promo_uses drop constraint promo_uses_used_by_fkey;
alter table promo_uses add constraint promo_uses_used_by_fkey
  foreign key (used_by) references auth.users(id) on delete cascade;

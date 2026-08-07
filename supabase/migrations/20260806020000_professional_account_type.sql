-- Adds an account-type distinction so a lactation consultant can register
-- as a provider account and never be routed through mom onboarding. This
-- is a different axis from viewer_accounts.viewer_role (which governs what
-- a specific viewer sees of one mom's data) -- this describes what kind of
-- account someone has at all, independent of any specific relationship.
--
-- 'parent' default preserves every existing account's behavior unchanged.
alter table profiles add column if not exists account_type text not null default 'parent'
  check (account_type in ('parent', 'professional'));

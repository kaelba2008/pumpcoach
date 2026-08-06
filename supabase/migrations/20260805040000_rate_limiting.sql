-- Generic per-user rate limiting for edge functions that call paid
-- third-party APIs (Anthropic). No client access at all -- only callable
-- via the service-role client each edge function already uses, so a
-- caller can never reset or inspect their own counter.
create table if not exists rate_limits (
  user_id      uuid not null,
  action       text not null,
  count        int not null default 1,
  window_start timestamptz not null default now(),
  primary key (user_id, action)
);

alter table rate_limits enable row level security;
-- Intentionally no policies -- service_role bypasses RLS entirely, and
-- that's the only caller this table should ever have.

-- Fixed-window limiter: returns true if the action is allowed, false if
-- the caller has exceeded p_limit requests within the last
-- p_window_seconds. Resets the window once it's expired.
create or replace function check_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limits (user_id, action, count, window_start)
  values (p_user_id, p_action, 1, now())
  on conflict (user_id, action) do update set
    count = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

grant execute on function check_rate_limit(uuid, text, int, int) to service_role;

-- Family Chores, part 2: recurring chores, points, and reward payouts.
--
-- Same security model as the first migration:
--  * Row level security on every table; clients never write tables directly.
--  * Every write goes through a SECURITY DEFINER function that looks up the caller's role in
--    `members` (require_parent / the assigned child), never trusting the request.
--
-- What's new
--  * chores.repeat / repeat_days: 'none', 'daily', or 'weekly' on chosen ISO weekdays
--    (1 = Monday … 7 = Sunday). When a parent approves a repeating chore, review_chore creates
--    the next instance with the next due date, in the same transaction.
--  * chores.points: points the child earns when the chore is approved (0–1000, default 10).
--    Streaks are computed from approved chores when the pages are read.
--  * payouts: a record each time a parent marks rewards as paid out (money, minutes or a custom
--    reward). Chores covered by a payout point at it through chores.payout_id.

create type public.chore_repeat as enum ('none', 'daily', 'weekly');

alter table public.chores
  add column repeat public.chore_repeat not null default 'none',
  add column repeat_days integer[] not null default '{}',
  add column points integer not null default 10 check (points between 0 and 1000),
  -- All instances of a repeating chore share the id of the first one.
  add column series_id uuid,
  add column paid_at timestamptz,
  add constraint repeat_is_valid check (
    (repeat = 'weekly' and cardinality(repeat_days) between 1 and 7 and repeat_days <@ array[1, 2, 3, 4, 5, 6, 7])
    or (repeat <> 'weekly' and repeat_days = '{}')
  ),
  -- A repeating chore always has a due date, so the next one can be worked out.
  add constraint repeat_needs_due_date check (repeat = 'none' or due_date is not null);

create index chores_series_idx on public.chores (series_id);
create index chores_due_idx on public.chores (household_id, due_date);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  child_id uuid not null,
  reward_type public.reward_type not null,
  -- Money: cents. Screen time: minutes. Custom: 0 (see chore_count and the chores themselves).
  amount integer not null check (amount >= 0),
  chore_count integer not null check (chore_count > 0),
  paid_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (child_id, household_id) references public.members (id, household_id) on delete cascade
);
create index payouts_household_idx on public.payouts (household_id, child_id);

alter table public.chores add column payout_id uuid references public.payouts (id) on delete set null;
create index chores_payout_idx on public.chores (payout_id);

alter table public.payouts enable row level security;
create policy "parents read household payouts; children read their own" on public.payouts
  for select to authenticated using (
    household_id = public.my_household_id()
    and (public.my_role() = 'parent' or child_id = auth.uid())
  );
revoke insert, update, delete, truncate on public.payouts from anon, authenticated;
revoke all on public.payouts from anon;

-- ---------------------------------------------------------------- recurrence helpers

-- The first date after p_after that matches the rule (null for 'none').
create function public.next_due_date(p_after date, p_repeat public.chore_repeat, p_days integer[])
returns date
language plpgsql immutable set search_path = '' as $$
declare d date;
begin
  if p_repeat = 'daily' then return p_after + 1; end if;
  if p_repeat = 'weekly' then
    for i in 1..7 loop
      d := p_after + i;
      if extract(isodow from d)::integer = any (p_days) then return d; end if;
    end loop;
  end if;
  return null;
end;
$$;

-- Normalises a weekday list: sorted, unique, 1..7 only. Raises if a weekly chore has no days.
create function public.clean_repeat_days(p_repeat public.chore_repeat, p_days integer[])
returns integer[]
language plpgsql immutable set search_path = '' as $$
declare r integer[];
begin
  if p_repeat <> 'weekly' then return '{}'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into r from unnest(coalesce(p_days, '{}')) x where x between 1 and 7;
  if cardinality(r) = 0 then
    raise exception 'Choose at least one day for a weekly chore.' using errcode = '22023';
  end if;
  return r;
end;
$$;

create function public.household_today(p_household uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone h.time_zone)::date from public.households h where h.id = p_household
$$;

-- ---------------------------------------------------------------- chores (new signatures)
-- The old create_chore/update_chore are replaced. New arguments have defaults, so callers that
-- don't know about repeating chores or points keep working.

drop function public.create_chore(text, text, uuid, public.reward_type, integer, text, date);
drop function public.update_chore(uuid, text, text, uuid, public.reward_type, integer, text, date);

create function public.create_chore(
  p_title text, p_description text, p_assigned_to uuid,
  p_reward_type public.reward_type, p_reward_amount integer, p_reward_note text, p_due_date date,
  p_repeat public.chore_repeat default 'none', p_repeat_days integer[] default '{}', p_points integer default 10
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  h uuid := public.require_parent();
  c uuid;
  r public.chore_repeat := coalesce(p_repeat, 'none');
  days integer[] := public.clean_repeat_days(r, p_repeat_days);
begin
  perform public.check_assignee(h, p_assigned_to);
  insert into public.chores (household_id, title, description, assigned_to, reward_type, reward_amount, reward_note,
                             due_date, created_by, repeat, repeat_days, points)
  values (h, btrim(p_title), coalesce(btrim(p_description), ''), p_assigned_to, p_reward_type,
          case when p_reward_type = 'custom' then null else p_reward_amount end,
          case when p_reward_type = 'custom' then btrim(p_reward_note) else null end,
          -- Repeating chores start today if no date was chosen.
          coalesce(p_due_date, case when r <> 'none' then public.household_today(h) end),
          auth.uid(), r, days, coalesce(p_points, 10))
  returning id into c;
  return c;
end;
$$;

create function public.update_chore(
  p_chore_id uuid, p_title text, p_description text, p_assigned_to uuid,
  p_reward_type public.reward_type, p_reward_amount integer, p_reward_note text, p_due_date date,
  p_repeat public.chore_repeat default 'none', p_repeat_days integer[] default '{}', p_points integer default 10
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  h uuid := public.require_parent();
  cur public.chores;
  r public.chore_repeat := coalesce(p_repeat, 'none');
  days integer[] := public.clean_repeat_days(r, p_repeat_days);
begin
  select * into cur from public.chores where id = p_chore_id and household_id = h for update;
  if cur.id is null then raise exception 'Chore not found.' using errcode = 'P0002'; end if;
  if cur.status = 'approved' then raise exception 'Approved chores can''t be edited.' using errcode = '22023'; end if;
  perform public.check_assignee(h, p_assigned_to);
  update public.chores set
    title = btrim(p_title),
    description = coalesce(btrim(p_description), ''),
    reward_type = p_reward_type,
    reward_amount = case when p_reward_type = 'custom' then null else p_reward_amount end,
    reward_note = case when p_reward_type = 'custom' then btrim(p_reward_note) else null end,
    due_date = coalesce(p_due_date, case when r <> 'none' then public.household_today(h) end),
    repeat = r,
    repeat_days = days,
    points = coalesce(p_points, 10),
    assigned_to = p_assigned_to,
    -- Reassigning starts the chore over for the new child.
    status = case when p_assigned_to <> cur.assigned_to then 'assigned' else cur.status end,
    photo_path = case when p_assigned_to <> cur.assigned_to then null else cur.photo_path end,
    child_note = case when p_assigned_to <> cur.assigned_to then null else cur.child_note end,
    submitted_at = case when p_assigned_to <> cur.assigned_to then null else cur.submitted_at end
  where id = p_chore_id;
end;
$$;

-- Same as before, plus: approving a repeating chore creates its next instance. The status
-- check (only 'submitted' can be approved) means each instance creates at most one successor.
create or replace function public.review_chore(p_chore_id uuid, p_approve boolean, p_feedback text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); cur public.chores; next_due date;
begin
  select * into cur from public.chores where id = p_chore_id and household_id = h for update;
  if cur.id is null then raise exception 'Chore not found.' using errcode = 'P0002'; end if;
  if cur.status <> 'submitted' then raise exception 'This chore isn''t waiting for approval.' using errcode = '22023'; end if;
  if p_approve then
    update public.chores set status = 'approved', approved_at = now(), reviewed_by = auth.uid(),
      feedback = nullif(btrim(coalesce(p_feedback, '')), '')
    where id = p_chore_id;
    if cur.repeat <> 'none' then
      -- Never schedule the next one in the past: count from today if the chore was late.
      next_due := public.next_due_date(greatest(cur.due_date, public.household_today(h)), cur.repeat, cur.repeat_days);
      insert into public.chores (household_id, title, description, assigned_to, reward_type, reward_amount, reward_note,
                                 due_date, created_by, repeat, repeat_days, points, series_id)
      values (cur.household_id, cur.title, cur.description, cur.assigned_to, cur.reward_type, cur.reward_amount, cur.reward_note,
              next_due, cur.created_by, cur.repeat, cur.repeat_days, cur.points, coalesce(cur.series_id, cur.id));
    end if;
  else
    if nullif(btrim(coalesce(p_feedback, '')), '') is null then
      raise exception 'Say what needs changing.' using errcode = '22023';
    end if;
    update public.chores set status = 'needs_changes', reviewed_by = auth.uid(), feedback = btrim(p_feedback)
    where id = p_chore_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------- payouts

-- A parent records that a child's approved, not-yet-paid rewards of one type have been handed
-- over. With p_chore_id, only that one chore is marked (useful for custom rewards). Returns the
-- payout id. This is a record only: no money moves.
create function public.mark_rewards_paid(p_child_id uuid, p_reward_type public.reward_type, p_chore_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); n integer; total integer; p uuid;
begin
  perform public.check_assignee(h, p_child_id);
  -- Lock the rows so two parents tapping at once can't pay the same chore twice.
  perform 1 from public.chores c
   where c.household_id = h and c.assigned_to = p_child_id and c.status = 'approved'
     and c.payout_id is null and c.reward_type = p_reward_type
     and (p_chore_id is null or c.id = p_chore_id)
   for update;
  select count(*), coalesce(sum(c.reward_amount), 0) into n, total from public.chores c
   where c.household_id = h and c.assigned_to = p_child_id and c.status = 'approved'
     and c.payout_id is null and c.reward_type = p_reward_type
     and (p_chore_id is null or c.id = p_chore_id);
  if n = 0 then raise exception 'Nothing to pay out.' using errcode = '22023'; end if;
  insert into public.payouts (household_id, child_id, reward_type, amount, chore_count, paid_by)
  values (h, p_child_id, p_reward_type, total, n, auth.uid())
  returning id into p;
  update public.chores c set payout_id = p, paid_at = now()
   where c.household_id = h and c.assigned_to = p_child_id and c.status = 'approved'
     and c.payout_id is null and c.reward_type = p_reward_type
     and (p_chore_id is null or c.id = p_chore_id);
  return p;
end;
$$;

-- ---------------------------------------------------------------- function permissions

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_chore(text, text, uuid, public.reward_type, integer, text, date, public.chore_repeat, integer[], integer),
  public.update_chore(uuid, text, text, uuid, public.reward_type, integer, text, date, public.chore_repeat, integer[], integer),
  public.review_chore(uuid, boolean, text),
  public.mark_rewards_paid(uuid, public.reward_type, uuid)
to authenticated;
-- Internal helpers.
revoke execute on function
  public.next_due_date(date, public.chore_repeat, integer[]),
  public.clean_repeat_days(public.chore_repeat, integer[]),
  public.household_today(uuid)
from authenticated;

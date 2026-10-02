-- Family Chores: households, members (parents and children), chores and private photo proof.
--
-- Security model
--  * Every table has row level security. Members can read only their own household's rows;
--    children can read only chores assigned to them.
--  * Nobody writes tables directly. All changes go through the security-definer functions
--    below, which look up the caller's role in `members` (never trusting anything the client
--    sends) and enforce the chore workflow:
--        assigned -> submitted -> approved
--                    submitted -> needs_changes -> submitted ...
--  * Photo proof lives in the private `proofs` bucket at <household_id>/<chore_id>/<file>.
--    Only the assigned child can upload, and only members of that household can read.

create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('parent', 'child');
create type public.chore_status as enum ('assigned', 'submitted', 'approved', 'needs_changes');
create type public.reward_type as enum ('money', 'screen_time', 'custom');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- Short code children type when signing in. Not a secret on its own (a PIN is also needed).
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  role public.member_role not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  avatar_color text not null default 'slate'
    check (avatar_color in ('slate', 'teal', 'blue', 'violet', 'rose', 'amber', 'green')),
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
-- Children sign in by first name, so names must be unique within a household.
create unique index members_child_name_unique on public.members (household_id, lower(name)) where role = 'child';
create index members_household_idx on public.members (household_id);

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  assigned_to uuid not null,
  reward_type public.reward_type not null,
  -- Money: amount in cents. Screen time: minutes. Custom: unused.
  reward_amount integer,
  -- Custom reward text, e.g. "Pick Friday's film".
  reward_note text,
  due_date date,
  status public.chore_status not null default 'assigned',
  photo_path text,
  child_note text check (char_length(child_note) <= 300),
  feedback text check (char_length(feedback) <= 300),
  created_by uuid references public.members (id) on delete set null,
  reviewed_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  -- The assignee must belong to the same household.
  foreign key (assigned_to, household_id) references public.members (id, household_id) on delete cascade,
  constraint reward_is_valid check (
    (reward_type = 'money' and reward_amount between 1 and 100000 and reward_note is null)
    or (reward_type = 'screen_time' and reward_amount between 1 and 1440 and reward_note is null)
    or (reward_type = 'custom' and reward_amount is null and char_length(btrim(reward_note)) between 1 and 80)
  )
);
create index chores_household_status_idx on public.chores (household_id, status);
create index chores_assigned_idx on public.chores (assigned_to, status);

-- ---------------------------------------------------------------- helpers

create function public.my_household_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.members where id = auth.uid()
$$;

create function public.my_role() returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.members where id = auth.uid()
$$;

-- Raises unless the caller is a parent; returns their household.
create function public.require_parent() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare h uuid;
begin
  select household_id into h from public.members where id = auth.uid() and role = 'parent';
  if h is null then
    raise exception 'Only a parent can do that.' using errcode = '42501';
  end if;
  return h;
end;
$$;

-- ---------------------------------------------------------------- row level security

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.chores enable row level security;

create policy "members read their household" on public.households
  for select to authenticated using (id = public.my_household_id());

create policy "members read their household's members" on public.members
  for select to authenticated using (household_id = public.my_household_id());

create policy "parents read household chores; children read their own" on public.chores
  for select to authenticated using (
    household_id = public.my_household_id()
    and (public.my_role() = 'parent' or assigned_to = auth.uid())
  );

-- No insert/update/delete policies: writes only happen through the functions below.
revoke insert, update, delete, truncate on public.households, public.members, public.chores from anon, authenticated;
revoke all on public.households, public.members, public.chores from anon;

-- ---------------------------------------------------------------- households

create function public.new_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O or 1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where join_code = code);
  end loop;
  return code;
end;
$$;

-- Creates a household with the caller as its parent.
create function public.create_household(p_household_name text, p_parent_name text, p_time_zone text default 'UTC')
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if exists (select 1 from public.members where id = auth.uid()) then
    raise exception 'You already belong to a household.' using errcode = '23505';
  end if;
  insert into public.households (name, join_code, time_zone)
  values (btrim(p_household_name), public.new_join_code(),
          case when p_time_zone in (select name from pg_catalog.pg_timezone_names) then p_time_zone else 'UTC' end)
  returning id into h;
  insert into public.members (id, household_id, role, name)
  values (auth.uid(), h, 'parent', btrim(p_parent_name));
  return h;
end;
$$;

create function public.update_household(p_name text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.households set name = btrim(p_name) where id = public.require_parent();
end;
$$;

-- Any member may change their own name (parents) or avatar colour (everyone).
create function public.update_my_profile(p_name text, p_avatar_color text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update public.members
     set avatar_color = p_avatar_color,
         -- Children's names are managed by a parent (they are used to sign in).
         name = case when role = 'parent' then btrim(p_name) else name end
   where id = auth.uid();
end;
$$;

-- Parents rename or recolour a child in their household.
create function public.update_child(p_child_id uuid, p_name text, p_avatar_color text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent();
begin
  update public.members set name = btrim(p_name), avatar_color = p_avatar_color
   where id = p_child_id and household_id = h and role = 'child';
  if not found then raise exception 'Child not found.' using errcode = 'P0002'; end if;
end;
$$;

-- ---------------------------------------------------------------- chores

create function public.check_assignee(p_household uuid, p_child uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members where id = p_child and household_id = p_household and role = 'child') then
    raise exception 'Choose a child from your household.' using errcode = '22023';
  end if;
end;
$$;

create function public.create_chore(
  p_title text, p_description text, p_assigned_to uuid,
  p_reward_type public.reward_type, p_reward_amount integer, p_reward_note text, p_due_date date
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); c uuid;
begin
  perform public.check_assignee(h, p_assigned_to);
  insert into public.chores (household_id, title, description, assigned_to, reward_type, reward_amount, reward_note, due_date, created_by)
  values (h, btrim(p_title), coalesce(btrim(p_description), ''), p_assigned_to, p_reward_type,
          case when p_reward_type = 'custom' then null else p_reward_amount end,
          case when p_reward_type = 'custom' then btrim(p_reward_note) else null end,
          p_due_date, auth.uid())
  returning id into c;
  return c;
end;
$$;

create function public.update_chore(
  p_chore_id uuid, p_title text, p_description text, p_assigned_to uuid,
  p_reward_type public.reward_type, p_reward_amount integer, p_reward_note text, p_due_date date
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); cur public.chores;
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
    due_date = p_due_date,
    assigned_to = p_assigned_to,
    -- Reassigning starts the chore over for the new child.
    status = case when p_assigned_to <> cur.assigned_to then 'assigned' else cur.status end,
    photo_path = case when p_assigned_to <> cur.assigned_to then null else cur.photo_path end,
    child_note = case when p_assigned_to <> cur.assigned_to then null else cur.child_note end,
    submitted_at = case when p_assigned_to <> cur.assigned_to then null else cur.submitted_at end
  where id = p_chore_id;
end;
$$;

-- Returns the chore's photo path (if any) so the caller can remove the file too.
create function public.delete_chore(p_chore_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); path text;
begin
  delete from public.chores where id = p_chore_id and household_id = h returning photo_path into path;
  if not found then raise exception 'Chore not found.' using errcode = 'P0002'; end if;
  return path;
end;
$$;

-- The assigned child marks a chore as done, optionally with a photo already uploaded to
-- proofs/<household>/<chore>/... and a short note.
create function public.submit_chore(p_chore_id uuid, p_photo_path text, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare cur public.chores;
begin
  select c.* into cur from public.chores c
   where c.id = p_chore_id and c.assigned_to = auth.uid()
     and exists (select 1 from public.members m where m.id = auth.uid() and m.role = 'child')
   for update;
  if cur.id is null then raise exception 'Chore not found.' using errcode = 'P0002'; end if;
  if cur.status not in ('assigned', 'needs_changes') then
    raise exception 'This chore has already been handed in.' using errcode = '22023';
  end if;
  if p_photo_path is not null and p_photo_path not like cur.household_id::text || '/' || cur.id::text || '/%' then
    raise exception 'Invalid photo.' using errcode = '22023';
  end if;
  update public.chores set
    status = 'submitted',
    submitted_at = now(),
    photo_path = coalesce(p_photo_path, photo_path),
    child_note = nullif(btrim(coalesce(p_note, '')), ''),
    feedback = null
  where id = p_chore_id;
end;
$$;

-- A parent approves (records the reward) or asks for changes. Children can never call this
-- successfully: the role comes from the members table, not from the request.
create function public.review_chore(p_chore_id uuid, p_approve boolean, p_feedback text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare h uuid := public.require_parent(); cur public.chores;
begin
  select * into cur from public.chores where id = p_chore_id and household_id = h for update;
  if cur.id is null then raise exception 'Chore not found.' using errcode = 'P0002'; end if;
  if cur.status <> 'submitted' then raise exception 'This chore isn''t waiting for approval.' using errcode = '22023'; end if;
  if p_approve then
    update public.chores set status = 'approved', approved_at = now(), reviewed_by = auth.uid(),
      feedback = nullif(btrim(coalesce(p_feedback, '')), '')
    where id = p_chore_id;
  else
    if nullif(btrim(coalesce(p_feedback, '')), '') is null then
      raise exception 'Say what needs changing.' using errcode = '22023';
    end if;
    update public.chores set status = 'needs_changes', reviewed_by = auth.uid(), feedback = btrim(p_feedback)
    where id = p_chore_id;
  end if;
end;
$$;

-- Function permissions: helpers are internal; actions are for signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.my_household_id(), public.my_role(),
  public.create_household(text, text, text), public.update_household(text),
  public.update_my_profile(text, text), public.update_child(uuid, text, text),
  public.create_chore(text, text, uuid, public.reward_type, integer, text, date),
  public.update_chore(uuid, text, text, uuid, public.reward_type, integer, text, date),
  public.delete_chore(uuid), public.submit_chore(uuid, text, text), public.review_chore(uuid, boolean, text)
to authenticated;
revoke execute on function public.require_parent(), public.check_assignee(uuid, uuid), public.new_join_code() from authenticated;

-- ---------------------------------------------------------------- photo storage (private)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: parents see their household's photos; children see photos on their own chores.
create policy "household members read proof photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.chores c
       where c.household_id::text = (storage.foldername(name))[1]
         and c.id::text = (storage.foldername(name))[2]
         and c.household_id = public.my_household_id()
         and (public.my_role() = 'parent' or c.assigned_to = auth.uid())
    )
  );

-- Upload: only the assigned child, only into that chore's folder, only while it can be handed in.
create policy "assigned child uploads proof photo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.chores c
       where c.household_id::text = (storage.foldername(name))[1]
         and c.id::text = (storage.foldername(name))[2]
         and c.assigned_to = auth.uid()
         and c.status in ('assigned', 'needs_changes')
    )
  );

-- Delete: parents tidy up photos in their household (e.g. when a chore is deleted).
create policy "parents delete household proof photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = public.my_household_id()::text
    and public.my_role() = 'parent'
  );

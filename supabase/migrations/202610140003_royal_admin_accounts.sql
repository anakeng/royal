begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  is_blocked boolean not null default true,
  access_expires_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  previous_blocked boolean not null,
  new_blocked boolean not null,
  previous_expiry timestamptz not null,
  new_expiry timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.access_audit enable row level security;
revoke all on public.profiles, public.access_audit from anon, authenticated;
grant select on public.profiles, public.access_audit to authenticated;

-- Roles and access are never read from user-editable Auth metadata.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid()
    and p.role = 'admin' and not p.is_blocked
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy audit_read on public.access_audit for select to authenticated
using ((select private.is_admin()));

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.create_profile();

-- Existing Auth accounts receive no access until explicitly activated.
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users on conflict (id) do nothing;

create function public.get_my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'PROFILE_MISSING' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', p.id, 'role', p.role, 'isBlocked', p.is_blocked,
    'expiresAt', p.access_expires_at,
    'allowed', not p.is_blocked and (p.role = 'admin' or p.access_expires_at > now()),
    'daysRemaining', case when p.is_blocked then 0 when p.role = 'admin' then null
      else greatest(0, ceil(extract(epoch from (p.access_expires_at - now())) / 86400)) end
  );
end;
$$;

-- Use this guard in EVERY future game RPC and RLS policy. A stale JWT
-- cannot bypass a new block or expiration because the table is read again.
create function public.has_app_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid()
    and not is_blocked and (role = 'admin' or access_expires_at > now()));
$$;

-- p_days is the NEW number of remaining 24-hour days, counted from now.
-- NULL preserves that field; 0 expires access immediately.
create function public.admin_set_user_access(
  p_user_id uuid, p_days integer default null, p_blocked boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous public.profiles; updated public.profiles;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_days is null and p_blocked is null then raise exception 'EMPTY_UPDATE' using errcode = '22023'; end if;
  if p_days is not null and (p_days < 0 or p_days > 3650) then
    raise exception 'INVALID_DAYS' using errcode = '22023';
  end if;
  select * into previous from public.profiles where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND' using errcode = '22023'; end if;
  if previous.role = 'admin' then raise exception 'ADMIN_ACCOUNT_PROTECTED' using errcode = '42501'; end if;
  update public.profiles set
    is_blocked = coalesce(p_blocked, is_blocked),
    access_expires_at = case when p_days is null then access_expires_at
      else now() + make_interval(days => p_days) end,
    updated_at = now()
  where id = p_user_id returning * into updated;
  insert into public.access_audit (actor_id, user_id, previous_blocked, new_blocked, previous_expiry, new_expiry)
  values (auth.uid(), p_user_id, previous.is_blocked, updated.is_blocked,
    previous.access_expires_at, updated.access_expires_at);
  return to_jsonb(updated);
end;
$$;

revoke all on function public.get_my_access(), public.has_app_access(),
  public.admin_set_user_access(uuid, integer, boolean) from public, anon;
grant execute on function public.get_my_access(), public.has_app_access(),
  public.admin_set_user_access(uuid, integer, boolean) to authenticated;

commit;

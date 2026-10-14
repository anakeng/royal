begin;
alter table public.profiles add column device_limit integer not null default 1 check (device_limit between 1 and 10);

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash text not null,
  name text not null check (length(name) between 1 and 100),
  session_id uuid not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, secret_hash)
);
create index user_devices_user_idx on public.user_devices(user_id);
create table public.device_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.user_devices enable row level security;
alter table public.device_audit enable row level security;
revoke all on public.user_devices, public.device_audit from anon, authenticated;
grant select(id, user_id, name, revoked, created_at, last_seen_at) on public.user_devices to authenticated;
grant select on public.device_audit to authenticated;
create policy devices_admin_read on public.user_devices for select to authenticated using ((select private.is_admin()));
create policy device_audit_admin_read on public.device_audit for select to authenticated using ((select private.is_admin()));

create function private.device_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_devices where user_id = auth.uid() and not revoked
    and session_id = nullif(auth.jwt()->>'session_id', '')::uuid);
$$;
revoke all on function private.device_allowed() from public, anon;
grant execute on function private.device_allowed() to authenticated;

create function public.register_my_device(p_secret text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; d public.user_devices; hashed text; sid uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Lock the same account for registration, revocation and limit changes.
  select * into p from public.profiles where id = auth.uid() for update;
  if not found or p.is_blocked then raise exception 'ACCOUNT_BLOCKED' using errcode = '42501'; end if;
  if p.role = 'admin' then return; end if;
  if p.access_expires_at <= now() then raise exception 'ACCESS_EXPIRED' using errcode = '42501'; end if;
  sid := nullif(auth.jwt()->>'session_id', '')::uuid;
  if sid is null then raise exception 'SESSION_REQUIRED' using errcode = '42501'; end if;
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' or p_name is null or length(trim(p_name)) not between 1 and 100 then
    raise exception 'INVALID_DEVICE' using errcode = '22023';
  end if;
  hashed := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  select * into d from public.user_devices where user_id = p.id and secret_hash = hashed;
  if found then
    if d.revoked then raise exception 'DEVICE_REVOKED' using errcode = '42501'; end if;
    update public.user_devices set session_id = sid, last_seen_at = now(), name = trim(p_name) where id = d.id;
    return;
  end if;
  if (select count(*) from public.user_devices where user_id = p.id and not revoked) >= p.device_limit then
    raise exception 'DEVICE_LIMIT_REACHED' using errcode = '42501';
  end if;
  insert into public.user_devices (user_id, secret_hash, name, session_id) values (p.id, hashed, trim(p_name), sid);
  insert into public.device_audit(actor_id, user_id, action) values (p.id, p.id, 'registered');
end;
$$;

create function public.admin_set_device_limit(p_user_id uuid, p_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 10 then raise exception 'INVALID_LIMIT' using errcode = '22023'; end if;
  select * into p from public.profiles where id = p_user_id for update;
  if not found or p.role = 'admin' then raise exception 'INVALID_USER' using errcode = '22023'; end if;
  update public.profiles set device_limit = p_limit, updated_at = now() where id = p_user_id;
  -- Keep the most recently connected devices when lowering the limit.
  update public.user_devices set revoked = true where id in (
    select id from public.user_devices where user_id = p_user_id and not revoked
    order by last_seen_at desc, id offset p_limit
  );
  insert into public.device_audit(actor_id, user_id, action, details)
    values (auth.uid(), p_user_id, 'limit_changed', jsonb_build_object('previous', p.device_limit, 'new', p_limit));
end;
$$;

create function public.admin_revoke_device(p_device_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select user_id into owner_id from public.user_devices where id = p_device_id;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = '22023'; end if;
  perform 1 from public.profiles where id = owner_id for update;
  update public.user_devices set revoked = true where id = p_device_id;
  insert into public.device_audit(actor_id, user_id, action, details)
    values (auth.uid(), owner_id, 'revoked', jsonb_build_object('device_id', p_device_id));
end;
$$;

create or replace function public.has_app_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not is_blocked
    and (role = 'admin' or (access_expires_at > now() and private.device_allowed())));
$$;
create or replace function public.get_my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles; device_ok boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'PROFILE_MISSING' using errcode = '42501'; end if;
  device_ok := p.role = 'admin' or private.device_allowed();
  return jsonb_build_object('id', p.id, 'role', p.role, 'isBlocked', p.is_blocked,
    'expiresAt', p.access_expires_at, 'deviceLimit', p.device_limit,
    'allowed', not p.is_blocked and device_ok and (p.role = 'admin' or p.access_expires_at > now()),
    'reason', case when p.is_blocked then 'ACCOUNT_BLOCKED'
      when p.role <> 'admin' and p.access_expires_at <= now() then 'ACCESS_EXPIRED'
      when not device_ok then 'DEVICE_REQUIRED' else null end,
    'daysRemaining', case when p.is_blocked then 0 when p.role = 'admin' then null
      else greatest(0, ceil(extract(epoch from (p.access_expires_at - now())) / 86400)) end);
end;
$$;
revoke all on function public.register_my_device(text, text), public.admin_set_device_limit(uuid, integer),
  public.admin_revoke_device(uuid) from public, anon;
grant execute on function public.register_my_device(text, text), public.admin_set_device_limit(uuid, integer),
  public.admin_revoke_device(uuid) to authenticated;
commit;

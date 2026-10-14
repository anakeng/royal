begin;

-- Royal uses Over's shared server-minute approach. No account, round code or
-- manual pairing is required. One stable poison layout is common to all
-- games, including games that remain open across multiple minute slots.
drop function if exists public.predict_royal_dishes(text);
drop function if exists public.upsert_royal_round(text, smallint[], smallint[], text, timestamptz);

create table if not exists public.royal_shared_layout (
  id boolean primary key default true check (id),
  poison_positions smallint[] not null check (
    array_ndims(poison_positions) = 1 and cardinality(poison_positions) = 5
  ),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.royal_shared_layout enable row level security;
revoke all on table public.royal_shared_layout from public, anon, authenticated;

-- Seed once. Administrative changes to these positions would invalidate
-- rounds already in progress, so ordinary clients have no table write access.
insert into public.royal_shared_layout (id, poison_positions)
select true, array_agg(position::smallint order by position)
from (
  select n as position from generate_series(0, 24) as n
  order by random() limit 5
) as sampled
on conflict (id) do nothing;

create table if not exists public.shared_royal_predictions_1m (
  slot bigint primary key,
  dish_count smallint not null check (dish_count between 1 and 10),
  positions smallint[] not null check (cardinality(positions) = dish_count),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.shared_royal_predictions_1m enable row level security;
revoke all on table public.shared_royal_predictions_1m from public, anon, authenticated;

create or replace function public.get_royal_shared_layout()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_layout public.royal_shared_layout%rowtype;
begin
  select * into strict v_layout from public.royal_shared_layout where id = true;
  return jsonb_build_object(
    'poisonPositions', v_layout.poison_positions,
    'serverTime', clock_timestamp()
  );
end;
$$;

create or replace function public.get_current_royal_prediction()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_slot bigint := floor(extract(epoch from v_now) / 60)::bigint;
  v_layout public.royal_shared_layout%rowtype;
  v_seed text;
  v_digest bytea;
  v_count integer;
  v_offset integer := (v_slot % 20)::integer;
  v_positions smallint[];
  v_result public.shared_royal_predictions_1m%rowtype;
begin
  select * into strict v_layout from public.royal_shared_layout where id = true;
  v_seed := array_to_string(v_layout.poison_positions, ',');
  v_digest := decode(md5(v_seed || ':' || v_slot::text), 'hex');
  v_count := 1 + (get_byte(v_digest, 0) * 256 + get_byte(v_digest, 1)) % 10;

  -- A stable order rotated by one position per minute guarantees a different
  -- combination in the next slot while the poison layout stays unchanged.
  with safe_dishes as (
    select dish.position::smallint as position,
      row_number() over (order by md5(v_seed || ':' || dish.position::text)) - 1 as sort_index
    from generate_series(1, 25) as dish(position)
    where not ((dish.position - 1)::smallint = any(v_layout.poison_positions))
  )
  select array_agg(position order by position) into v_positions
  from safe_dishes
  where (sort_index - v_offset + 20) % 20 < v_count;

  insert into public.shared_royal_predictions_1m (slot, dish_count, positions)
  values (v_slot, v_count, v_positions)
  on conflict (slot) do nothing;

  select * into strict v_result
  from public.shared_royal_predictions_1m
  where slot = v_slot;

  v_now := clock_timestamp();
  if floor(extract(epoch from v_now) / 60)::bigint <> v_slot then
    return public.get_current_royal_prediction();
  end if;
  return jsonb_build_object(
    'slot', v_result.slot,
    'count', v_result.dish_count,
    'positions', v_result.positions,
    'startsAt', to_timestamp(v_slot * 60),
    'validUntil', to_timestamp((v_slot + 1) * 60),
    'serverTime', v_now
  );
end;
$$;

revoke all on function public.get_royal_shared_layout() from public, anon, authenticated;
revoke all on function public.get_current_royal_prediction() from public, anon, authenticated;
grant execute on function public.get_royal_shared_layout() to anon, authenticated;
grant execute on function public.get_current_royal_prediction() to anon, authenticated;

commit;

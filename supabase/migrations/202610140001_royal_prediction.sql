begin;

-- Apply this migration to the dedicated Royal Supabase project, not the dice
-- project. The complete 128-bit round_id is a write capability. The public
-- round_code contains only its first 48 bits and permits prediction reads.
create table public.royal_rounds (
  round_id text primary key check (round_id ~ '^[0-9a-f]{32}$'),
  round_code text not null unique
    check (round_code = upper(left(round_id, 12))),
  board smallint[] not null
    check (array_ndims(board) = 1 and array_lower(board, 1) = 1
      and cardinality(board) = 25),
  revealed smallint[] not null default '{}'::smallint[]
    check (cardinality(revealed) <= 15),
  status text not null check (status in (
    'active', 'cashout_pending', 'won', 'cashed_out', 'poison', 'expired', 'jackpot'
  )),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- No client receives direct table access, even if it has the public API key.
alter table public.royal_rounds enable row level security;
revoke all on table public.royal_rounds from public, anon, authenticated;

create function public.upsert_royal_round(
  p_round_id text,
  p_board smallint[],
  p_revealed smallint[],
  p_status text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_round_id text;
  v_round_code text;
  v_item smallint;
  v_index smallint;
  v_poison_count integer := 0;
  v_counts integer[] := array[0, 0, 0, 0, 0];
  v_progress integer[] := array[0, 0, 0, 0, 0];
  v_seen smallint[] := '{}'::smallint[];
  v_full_bars integer := 0;
  v_safe_count integer := 0;
  v_terminal text := null;
  v_now timestamptz := clock_timestamp();
begin
  if p_round_id is null or p_round_id !~* '^[0-9a-f]{32}$' then
    raise sqlstate 'PT400' using message = 'INVALID_ROUND_ID';
  end if;
  v_round_id := lower(p_round_id);
  v_round_code := upper(left(v_round_id, 12));

  if p_board is null or coalesce(array_ndims(p_board), 0) <> 1
      or array_lower(p_board, 1) <> 1 or cardinality(p_board) <> 25 then
    raise sqlstate 'PT400' using message = 'INVALID_BOARD';
  end if;
  for v_index in 1..25 loop
    v_item := p_board[v_index];
    if v_item is null or v_item < -1 or v_item > 4 then
      raise sqlstate 'PT400' using message = 'INVALID_BOARD';
    end if;
    if v_item = -1 then
      v_poison_count := v_poison_count + 1;
    else
      v_counts[v_item + 1] := v_counts[v_item + 1] + 1;
    end if;
  end loop;
  if v_poison_count <> 5 or v_counts <> array[4, 4, 4, 4, 4] then
    raise sqlstate 'PT400' using message = 'INVALID_BOARD';
  end if;

  if p_revealed is null or cardinality(p_revealed) > 15
      or (cardinality(p_revealed) > 0 and
        (coalesce(array_ndims(p_revealed), 0) <> 1
          or array_lower(p_revealed, 1) <> 1)) then
    raise sqlstate 'PT400' using message = 'INVALID_REVEALED';
  end if;
  if p_status is null or p_status not in (
    'active', 'cashout_pending', 'won', 'cashed_out', 'poison', 'expired', 'jackpot'
  ) then
    raise sqlstate 'PT400' using message = 'INVALID_STATUS';
  end if;
  -- The deadline is supplied by the game; cap it to seven days with a small
  -- device-clock allowance, then keep it immutable on every later update.
  if p_expires_at is null or not isfinite(p_expires_at)
      or p_expires_at > v_now + interval '7 days 5 minutes' then
    raise sqlstate 'PT400' using message = 'INVALID_EXPIRY';
  end if;

  -- Match Royal's reveal order: poison, three completed food bars, or fifteen
  -- safe dishes ends the round immediately. No later dish may be opened.
  foreach v_index in array p_revealed loop
    if v_index is null or v_index < 0 or v_index > 24
        or v_index = any(v_seen) or v_terminal is not null then
      raise sqlstate 'PT400' using message = 'INVALID_REVEALED';
    end if;
    v_seen := array_append(v_seen, v_index);
    v_item := p_board[v_index + 1];
    if v_item = -1 then
      v_terminal := 'poison';
    else
      v_safe_count := v_safe_count + 1;
      v_progress[v_item + 1] := v_progress[v_item + 1] + 1;
      if v_progress[v_item + 1] = 4 then
        v_full_bars := v_full_bars + 1;
      end if;
      if v_full_bars >= 3 then
        v_terminal := 'jackpot';
      elsif v_safe_count = 15 then
        v_terminal := 'won';
      end if;
    end if;
  end loop;
  if (v_terminal is null and p_status in ('poison', 'jackpot', 'won'))
      or (v_terminal is not null and p_status <> v_terminal) then
    raise sqlstate 'PT400' using message = 'INVALID_STATUS';
  end if;

  -- One atomic statement handles concurrent calls for the same token. A
  -- conflict update accepts only an unchanged board/deadline, an ordered
  -- extension of revealed dishes, and a forward-only status transition.
  insert into public.royal_rounds as stored (
    round_id, round_code, board, revealed, status, expires_at
  ) values (
    v_round_id, v_round_code, p_board, p_revealed, p_status, p_expires_at
  )
  on conflict (round_id) do update
    set revealed = excluded.revealed,
        status = excluded.status,
        updated_at = clock_timestamp()
    where stored.board = excluded.board
      and stored.expires_at = excluded.expires_at
      and cardinality(stored.revealed) <= cardinality(excluded.revealed)
      and (cardinality(stored.revealed) = 0
        or stored.revealed = excluded.revealed[1:cardinality(stored.revealed)])
      and (
        stored.status = 'active'
        or (stored.status = 'cashout_pending'
          and excluded.status in ('cashout_pending', 'cashed_out')
          and stored.revealed = excluded.revealed)
        or (stored.status in ('won', 'cashed_out', 'poison', 'expired', 'jackpot')
          and stored.status = excluded.status
          and stored.revealed = excluded.revealed)
      )
  returning round_code into v_round_code;

  if not found then
    raise sqlstate 'PT409' using message = 'ROUND_CONFLICT';
  end if;
  return jsonb_build_object('roundCode', v_round_code);
end;
$$;

create function public.predict_royal_dishes(p_round_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(p_round_code));
  v_round public.royal_rounds%rowtype;
  v_available integer;
  v_max_count integer;
  v_count integer;
  v_offset integer;
  v_positions jsonb;
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_slot bigint;
  v_digest bytea;
begin
  if v_code is null or v_code !~ '^[0-9A-F]{12}$' then
    raise sqlstate 'PT400' using message = 'INVALID_ROUND_CODE';
  end if;

  select * into v_round
  from public.royal_rounds
  where round_code = v_code;
  if not found then
    raise sqlstate 'PT404' using message = 'ROUND_NOT_FOUND';
  end if;
  if v_round.status <> 'active' or v_round.expires_at <= v_now then
    raise sqlstate 'PT410' using message = 'ROUND_FINISHED';
  end if;

  select count(*) into v_available
  from unnest(v_round.board) with ordinality as dish(item, position)
  where dish.item >= 0
    and not ((dish.position - 1)::smallint = any(v_round.revealed));
  if v_available = 0 then
    raise sqlstate 'PT410' using message = 'ROUND_FINISHED';
  end if;
  -- Every call in the same server minute gets the same combination. The full
  -- round ID is the seed; the public 12-character code does not reveal it.
  v_minute := date_trunc('minute', v_now);
  v_slot := floor(extract(epoch from v_minute) / 60)::bigint;
  v_digest := decode(md5(v_round.round_id || ':' || v_slot::text), 'hex');
  -- Leave at least one alternative so the set changes on the next minute
  -- even if the pseudo-random count happens to repeat.
  v_max_count := least(10, greatest(1, v_available - 1));
  v_count := 1 + (get_byte(v_digest, 0) * 256 + get_byte(v_digest, 1)) % v_max_count;
  v_offset := (v_slot % v_available)::integer;

  with ordered as (
    select dish.position::integer as position,
      row_number() over (
        order by md5(v_round.round_id || ':' || dish.position::text)
      ) - 1 as sort_index
    from unnest(v_round.board) with ordinality as dish(item, position)
    where dish.item >= 0
      and not ((dish.position - 1)::smallint = any(v_round.revealed))
  ), chosen as (
    select position from ordered
    where (sort_index - v_offset + v_available) % v_available < v_count
  )
  select jsonb_agg(position order by position) into v_positions
  from chosen;

  return jsonb_build_object(
    'roundCode', v_code,
    'count', v_count,
    'positions', v_positions,
    'serverTime', v_now,
    'validUntil', v_minute + interval '1 minute'
  );
end;
$$;

revoke all on function public.upsert_royal_round(text, smallint[], smallint[], text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.predict_royal_dishes(text)
  from public, anon, authenticated;
grant execute on function public.upsert_royal_round(text, smallint[], smallint[], text, timestamptz)
  to anon, authenticated;
grant execute on function public.predict_royal_dishes(text)
  to anon, authenticated;

commit;

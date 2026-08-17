-- Mahjong multiplayer: one table, three RPCs. No auth, guest ids only.
--
-- Design note: rooms, players and game_state all live in a single row per room.
-- One row = one realtime subscription = one authoritative version of the board.
-- `matches` is append-only, so "which tiles are gone" and "who scored what" are
-- both derived from it and can never disagree.

create table if not exists rooms (
  code       text primary key,                      -- e.g. 'A7QK'
  board      jsonb not null,                        -- [{id,face,x,y,z}, ...] 144 tiles, immutable
                                                     -- (TOASTed + unchanged, so realtime payloads omit it)
  players    jsonb not null default '[]'::jsonb,    -- [{id: guest_id, name, ready}] max 2
  matches    jsonb not null default '[]'::jsonb,    -- [{a: tileId, b: tileId, by: guest_id}] append-only
  status     text  not null default 'lobby',        -- lobby | playing | finished
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

-- Anyone may read a room and create one. All mutations go through the
-- security-definer functions below, so there is deliberately no UPDATE policy:
-- clients cannot rewrite the board or hand themselves points.
drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select to anon, authenticated using (true);

drop policy if exists rooms_create on rooms;
create policy rooms_create on rooms for insert to anon, authenticated with check (true);

-- Realtime
alter publication supabase_realtime add table rooms;


-- join_room: idempotent, caps the room at 2 players.
create or replace function join_room(p_code text, p_guest text, p_name text)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  perform 1 from rooms where code = p_code for update;

  update rooms set players =
    case
      when players @> jsonb_build_array(jsonb_build_object('id', p_guest)) then players
      when jsonb_array_length(players) >= 2 then players
      else players || jsonb_build_object('id', p_guest, 'name', p_name, 'ready', false)
    end
  where code = p_code
  returning * into r;

  return r;
end $$;


-- set_ready: flips one player's ready flag, and starts the game once both are ready.
create or replace function set_ready(p_code text, p_guest text)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms; np jsonb;
begin
  perform 1 from rooms where code = p_code for update;

  select coalesce(jsonb_agg(
           case when p->>'id' = p_guest then jsonb_set(p, '{ready}', 'true'::jsonb) else p end
         ), '[]'::jsonb)
    into np
    from rooms, jsonb_array_elements(rooms.players) p
   where rooms.code = p_code;

  update rooms set
    players = np,
    status = case
      when status = 'lobby'
       and jsonb_array_length(np) >= 2
       and not exists (
             select 1 from jsonb_array_elements(np) q
              where coalesce((q->>'ready')::boolean, false) = false)
      then 'playing' else status
    end
  where code = p_code
  returning * into r;

  return r;
end $$;


-- claim_match: the only way tiles are removed. Atomic, so when both players click
-- the same pair at the same moment exactly one of them gets the points.
-- Checks: game running, both tiles exist, faces equal, neither already claimed.
-- ponytail: free-tile geometry is validated client-side only; a hand-rolled request
-- could match a buried pair. Port isTileFree to plpgsql if that ever matters.
create or replace function claim_match(p_code text, p_guest text, p_a text, p_b text)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms; ok boolean;
begin
  perform 1 from rooms where code = p_code for update;

  select x.status = 'playing'
     and p_a <> p_b
     and (select count(*) from jsonb_array_elements(x.board) t
           where t->>'id' in (p_a, p_b)) = 2
     and (select count(distinct t->>'face') from jsonb_array_elements(x.board) t
           where t->>'id' in (p_a, p_b)) = 1
     and not exists (select 1 from jsonb_array_elements(x.matches) m
           where m->>'a' in (p_a, p_b) or m->>'b' in (p_a, p_b))
    into ok
    from rooms x where x.code = p_code;

  if not coalesce(ok, false) then
    select * into r from rooms where code = p_code;
    return r;
  end if;

  update rooms
     set matches = matches || jsonb_build_object('a', p_a, 'b', p_b, 'by', p_guest)
   where code = p_code
  returning * into r;

  if jsonb_array_length(r.matches) * 2 >= jsonb_array_length(r.board) then
    update rooms set status = 'finished' where code = p_code returning * into r;
  end if;

  return r;
end $$;


-- finish_room: called when a client detects no legal moves remain.
create or replace function finish_room(p_code text)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  update rooms set status = 'finished'
   where code = p_code and status = 'playing'
  returning * into r;

  if r.code is null then
    select * into r from rooms where code = p_code;
  end if;

  return r;
end $$;


-- reshuffle_room: called when no matching free pair is left. Re-deals the faces
-- of the tiles still standing so play can continue instead of ending stuck.
-- The guards allow a permutation and nothing else: same tiles at the same
-- coordinates, same faces in the same quantities. So a tampered client can't
-- turn the board into 144 of one face, or slide tiles out from under a stack.
-- ponytail: it cannot verify the board really was deadlocked — that check needs
-- isTileFree in plpgsql. Port it if reshuffle-at-will becomes a problem.
create or replace function reshuffle_room(p_code text, p_guest text, p_board jsonb)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  perform 1 from rooms where code = p_code for update;

  update rooms set board = p_board
  where code = p_code
    and status = 'playing'
    and players @> jsonb_build_array(jsonb_build_object('id', p_guest))
    and jsonb_array_length(p_board) = jsonb_array_length(board)
    -- every (id, x, y, z) is unchanged
    and not exists (
      select t->>'id', t->>'x', t->>'y', t->>'z' from jsonb_array_elements(p_board) t
      except
      select t->>'id', t->>'x', t->>'y', t->>'z' from jsonb_array_elements(board) t)
    -- each face still appears exactly as many times as before
    and not exists (
      select t->>'face', count(*) from jsonb_array_elements(p_board) t group by 1
      except
      select t->>'face', count(*) from jsonb_array_elements(board) t group by 1)
  returning * into r;

  if r.code is null then
    select * into r from rooms where code = p_code;
  end if;

  return r;
end $$;


-- restart_room: rematch in place. Deals a fresh board, wipes the score and
-- sends both players back to the lobby, so nobody has to swap links again.
-- Only a seated player of a finished room can do it, and whoever presses second
-- is a no-op because the status guard no longer matches.
create or replace function restart_room(p_code text, p_guest text, p_board jsonb)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms; np jsonb;
begin
  perform 1 from rooms where code = p_code for update;

  select coalesce(jsonb_agg(jsonb_set(p, '{ready}', 'false'::jsonb)), '[]'::jsonb)
    into np
    from rooms, jsonb_array_elements(rooms.players) p
   where rooms.code = p_code;

  update rooms set
    board = p_board,
    matches = '[]'::jsonb,
    players = np,
    status = 'lobby'
  where code = p_code
    and status = 'finished'
    and jsonb_array_length(p_board) = 144
    and players @> jsonb_build_array(jsonb_build_object('id', p_guest))
  returning * into r;

  if r.code is null then
    select * into r from rooms where code = p_code;
  end if;

  return r;
end $$;


grant execute on function join_room(text, text, text)          to anon, authenticated;
grant execute on function set_ready(text, text)                to anon, authenticated;
grant execute on function claim_match(text, text, text, text)   to anon, authenticated;
grant execute on function finish_room(text)                     to anon, authenticated;
grant execute on function restart_room(text, text, jsonb)       to anon, authenticated;
grant execute on function reshuffle_room(text, text, jsonb)     to anon, authenticated;

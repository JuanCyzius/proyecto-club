-- ============================================================
-- HARDENING — Operaciones administrativas fuera del alcance del cliente
--
-- Tres funciones afectan a TODO el grupo y no son idempotentes: si un
-- usuario las llamara desde la consola del navegador, podría cerrar la
-- temporada de todos o duplicar el calendario de la liga.
--
-- No hacen falta roles ni panel de admin: simplemente dejan de ser
-- llamables desde la aplicación. Se ejecutan desde el SQL Editor de
-- Supabase, que es donde corresponde para operaciones de temporada.
--
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

-- 1) Cierre de temporada: reparte premios y reinicia clasificaciones
revoke execute on function public.rollover_season() from authenticated;
revoke execute on function public.rollover_season() from anon;

-- 2) Creación de la liga del grupo: genera el calendario completo
revoke execute on function public.create_group_league(text) from authenticated;
revoke execute on function public.create_group_league(text) from anon;

-- ------------------------------------------------------------
-- 3) settle_expired: cierra subastas vencidas.
--    Esta SÍ debe seguir accesible (la app la llama al abrir el
--    mercado), pero se le añade protección para que no se pueda
--    abusar de ella: como mucho una pasada cada 20 segundos.
-- ------------------------------------------------------------
create table if not exists public.rate_limits (
  key        text primary key,
  last_run   timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
-- Sin policies: solo la tocan funciones SECURITY DEFINER.

create or replace function public.settle_expired()
returns int language plpgsql security definer set search_path = public as $$
declare v_l record; v_n int := 0; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- Freno: la resolución de subastas es una tarea de mantenimiento,
  -- no hace falta ejecutarla más de una vez cada 20 segundos.
  select last_run into v_last from public.rate_limits
    where key = 'settle_expired' for update;
  if v_last is not null and now() - v_last < interval '20 seconds' then
    return 0;
  end if;
  insert into public.rate_limits (key, last_run) values ('settle_expired', now())
    on conflict (key) do update set last_run = now();

  for v_l in
    select * from public.market_listings
    where status = 'active' and ends_at <= now()
    order by ends_at limit 50
  loop
    if v_l.current_bidder is not null then
      perform public._settle(v_l.id, v_l.current_bidder, v_l.current_bid, true);
    else
      update public.market_listings set status = 'expired' where id = v_l.id;
      update public.player_cards set status = 'in_club' where id = v_l.card_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function public.settle_expired() from public;
grant execute on function public.settle_expired() to authenticated;

-- ------------------------------------------------------------
-- 4) apply_match_injuries: solo afecta a las cartas del propio
--    usuario, pero se le añade un freno para que no pueda llamarse
--    en bucle sorteando lesiones ajenas al juego real.
-- ------------------------------------------------------------
create or replace function public.apply_match_injuries(p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  i int; v_inj record; v_total numeric; v_r numeric; v_acc numeric := 0;
  v_out jsonb := '[]'::jsonb; v_key text; v_last timestamptz;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Como mucho una vez cada 5 segundos por usuario
  v_key := 'injuries:' || v_user::text;
  select last_run into v_last from public.rate_limits where key = v_key for update;
  if v_last is not null and now() - v_last < interval '5 seconds' then
    return v_out;
  end if;
  insert into public.rate_limits (key, last_run) values (v_key, now())
    on conflict (key) do update set last_run = now();

  -- Descontar un partido a las lesiones existentes
  update public.player_cards
    set injury_matches_left = injury_matches_left - 1,
        injury_type = case when injury_matches_left - 1 <= 0 then null else injury_type end
    where owner_id = v_user and injury_matches_left > 0;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return v_out;
  end if;

  select sum(weight) into v_total from public.injury_types;

  for i in 1..array_length(p_card_ids, 1) loop
    if random() < 0.04 then
      v_r := random() * v_total;
      v_acc := 0;
      for v_inj in select * from public.injury_types order by code loop
        v_acc := v_acc + v_inj.weight;
        if v_r <= v_acc then
          update public.player_cards
            set injury_type = v_inj.code,
                injury_matches_left = v_inj.severity
            where id = p_card_ids[i] and owner_id = v_user
              and injury_matches_left = 0;
          if found then
            v_out := v_out || jsonb_build_object(
              'card_id', p_card_ids[i], 'type', v_inj.code,
              'name', v_inj.name, 'matches', v_inj.severity
            );
          end if;
          exit;
        end if;
      end loop;
    end if;
  end loop;

  return v_out;
end; $$;
revoke all on function public.apply_match_injuries(uuid[]) from public;
grant execute on function public.apply_match_injuries(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- Comprobación: las dos primeras deben dar false, las otras true
-- ------------------------------------------------------------
select
  has_function_privilege('authenticated','public.rollover_season()','execute')        as rollover_expuesto,
  has_function_privilege('authenticated','public.create_group_league(text)','execute') as liga_expuesta,
  has_function_privilege('authenticated','public.settle_expired()','execute')          as mercado_ok,
  has_function_privilege('authenticated','public.import_players_from_staging()','execute') as import_expuesto;

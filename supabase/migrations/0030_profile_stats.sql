-- ============================================================
-- ESTADÍSTICAS DEL PERFIL
--
-- Todo en UNA sola llamada. Las definiciones son las mismas que ya usa
-- el motor de objetivos (_objective_progress), así que no hay dos
-- verdades: si un objetivo dice "30 victorias", el perfil dice lo mismo.
--
-- Nivel y XP salen de la fórmula que ya existe en _grant_rewards:
--   nivel = 1 + floor(xp / 500)
-- es decir, el nivel N empieza a los (N-1) * 500 de XP.
-- ============================================================

create index if not exists idx_matches_home_done
  on public.matches (home_user, status) where status = 'done';
create index if not exists idx_cards_owner_template
  on public.player_cards (owner_id, template_id);

create or replace function public.my_profile_stats()
returns TABLE(
  -- Progresión
  "xp" int,
  "level" int,
  "xp_into_level" int,
  "xp_for_level" int,
  "xp_to_next" int,
  -- Actividad
  "matches_played" int,
  "matches_won" int,
  "matches_drawn" int,
  "matches_lost" int,
  "goals_for" int,
  "goals_against" int,
  "clean_sheets" int,
  "minutes_played" int,
  -- Colección
  "cards_owned" int,
  "unique_players" int,
  "catalog_size" int,
  "best_overall" int,
  "fav_card_name" text,
  "fav_card_overall" int,
  "fav_card_position" text,
  "fav_card_rarity" text,
  "fav_card_club" text,
  "fav_card_nationality" text,
  -- Otros
  "packs_opened" int,
  "coins_earned" bigint,
  "duels_won" int,
  "member_since" timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_xp int; v_level int; v_base int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select p.xp, p.level into v_xp, v_level
    from public.profiles p where p.id = v_user;
  v_xp := coalesce(v_xp, 0);
  -- El nivel se recalcula con la fórmula real, por si la columna quedó
  -- desfasada: así la barra siempre coincide con el XP.
  v_level := greatest(1, 1 + (v_xp / 500));
  v_base := (v_level - 1) * 500;

  return query
  with m as (
    -- Un solo recorrido de los partidos del usuario
    select
      count(*)::int as played,
      count(*) filter (
        where (mt.home_user = v_user and mt.winner = 'home')
           or (mt.away_user = v_user and mt.winner = 'away')
      )::int as won,
      count(*) filter (where mt.winner = 'draw')::int as drawn,
      coalesce(sum(
        case when mt.home_user = v_user then mt.home_score else mt.away_score end
      ), 0)::int as gf,
      coalesce(sum(
        case when mt.home_user = v_user then mt.away_score else mt.home_score end
      ), 0)::int as ga,
      count(*) filter (
        where case when mt.home_user = v_user then mt.away_score
                   else mt.home_score end = 0
      )::int as clean,
      -- Minutos disputados: 90 por partido, 120 si hubo prórroga
      coalesce(sum(
        case when (mt.log->>'wentToPenalties')::boolean then 120 else 90 end
      ), 0)::int as minutes
    from public.matches mt
    where mt.status = 'done'
      and (mt.home_user = v_user or mt.away_user = v_user)
  ),
  col as (
    select
      count(*)::int as owned,
      count(distinct c.template_id)::int as uniq,
      coalesce(max(t.overall), 0)::int as best
    from public.player_cards c
    join public.player_templates t on t.id = c.template_id
    where c.owner_id = v_user and c.status = 'in_club'
  ),
  fav as (
    -- Carta favorita: la de mayor media del plantel. Si empatan, la que
    -- esté en el once, y si no, la más antigua (la que más jugó).
    select i.name, t.overall, t.position, t.rarity, i.club_name, i.nationality
    from public.player_cards c
    join public.player_templates t on t.id = c.template_id
    join public.player_identities i on i.id = t.identity_id
    where c.owner_id = v_user and c.status = 'in_club'
    order by
      t.overall desc,
      exists (select 1 from public.squad_slots s
              where s.user_id = v_user and s.card_id = c.id) desc,
      c.created_at
    limit 1
  )
  select
    v_xp, v_level, v_xp - v_base, 500, greatest(0, v_base + 500 - v_xp),
    m.played, m.won, m.drawn, greatest(0, m.played - m.won - m.drawn),
    m.gf, m.ga, m.clean, m.minutes,
    col.owned, col.uniq,
    (select count(*)::int from public.player_templates),
    col.best,
    fav.name, fav.overall, fav.position, fav.rarity, fav.club_name, fav.nationality,
    (select count(*)::int from public.pack_openings po where po.user_id = v_user),
    coalesce((select sum(l.delta) from public.coin_ledger l
              where l.user_id = v_user and l.delta > 0), 0)::bigint,
    (select count(*)::int from public.penalty_duels d
      where d.status = 'done' and d.winner = v_user),
    (select p.created_at from public.profiles p where p.id = v_user)
  from m
  cross join col
  left join fav on true;
end; $$;
grant execute on function public.my_profile_stats() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select * from public.my_profile_stats();

-- ============================================================
-- RANGOS DE RECOMPENSA · ÍTEMS PARA TODO EL PLANTEL · DESCANSO
-- POR PARTIDOS
--
-- 1. La recompensa por ganar deja de ser un monto fijo por franja y
--    pasa a ser un rango al azar (más variedad partido a partido).
-- 2. Los ítems de curación/energía dejan de aplicarse a una sola
--    carta elegida: se gastan una vez y afectan a todo el plantel.
-- 3. La energía deja de recuperarse por tiempo real y pasa a
--    recuperarse jugando: quien no participó de un partido recupera
--    fuerte, para quedar al 100% tras 1-2 partidos de descanso.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Recompensa por victoria: rango al azar según nivel del rival
--
--   Nivel 65 (≤66)  → 100-120      Nivel 85 (≤86) → 340-380
--   Nivel 70 (≤71)  → 140-170      Nivel 90 (≤91) → 440-480
--   Nivel 75 (≤76)  → 190-223      Nivel 95 (≤96) → 500-530
--   Nivel 80 (≤81)  → 240-270      Nivel 99 (resto) → 650-850
-- ------------------------------------------------------------
create or replace function public.win_reward(p_rating int)
returns numeric language sql volatile as $$
  select case
    when p_rating <= 66 then floor(random() * (120 - 100 + 1) + 100)
    when p_rating <= 71 then floor(random() * (170 - 140 + 1) + 140)
    when p_rating <= 76 then floor(random() * (223 - 190 + 1) + 190)
    when p_rating <= 81 then floor(random() * (270 - 240 + 1) + 240)
    when p_rating <= 86 then floor(random() * (380 - 340 + 1) + 340)
    when p_rating <= 91 then floor(random() * (480 - 440 + 1) + 440)
    when p_rating <= 96 then floor(random() * (530 - 500 + 1) + 500)
    else                     floor(random() * (850 - 650 + 1) + 650)
  end::numeric;
$$;
revoke all on function public.win_reward(int) from public;
grant execute on function public.win_reward(int) to authenticated;

-- ------------------------------------------------------------
-- 2) Ítems de curación/energía: se usan una vez y afectan a todo
--    el plantel del usuario (ya no a una sola carta elegida).
-- ------------------------------------------------------------
drop function if exists public.use_item(text, uuid);

create or replace function public.use_item(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_have int;
  v_affected int := 0;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_item from public.items where code = p_code;
  if not found then raise exception 'item not found'; end if;

  select qty into v_have from public.user_items
    where user_id = v_user and item_code = p_code for update;
  if coalesce(v_have, 0) < 1 then raise exception 'no tenés ese ítem'; end if;

  if v_item.kind = 'heal' then
    update public.player_cards
      set injury_matches_left = 0, injury_type = null
      where owner_id = v_user
        and injury_matches_left > 0
        and injury_matches_left <= v_item.power;
    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'no hay lesiones en el plantel que ese ítem pueda curar';
    end if;
  else
    update public.player_cards
      set stamina = least(100, stamina + v_item.power)
      where owner_id = v_user and stamina < 100;
    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'todo el plantel ya está al máximo de energía';
    end if;
  end if;

  update public.user_items set qty = qty - 1
    where user_id = v_user and item_code = p_code;

  return jsonb_build_object(
    'code', p_code,
    'kind', v_item.kind,
    'affected', v_affected
  );
end; $$;
revoke all on function public.use_item(text) from public;
grant execute on function public.use_item(text) to authenticated;

-- ------------------------------------------------------------
-- 3) Recuperación de energía por partidos no jugados
--
-- Antes: +8 de energía por día real transcurrido (recover_stamina).
-- Ahora, además: cada vez que se juega un partido, todas las cartas
-- que NO participaron recuperan +55. Con eso, un jugador que queda
-- afuera vuelve al 100% en 1-2 partidos de descanso (2 × 55 = 110,
-- y si ya tenía más de 45 de energía, con uno solo le alcanza).
-- ------------------------------------------------------------
create or replace function public.apply_match_stamina(
  p_card_ids uuid[],
  p_drops numeric[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  i int;
  v_updated int := 0;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Desgaste de las cartas que jugaron este partido.
  if p_card_ids is not null and array_length(p_card_ids, 1) is not null then
    for i in 1..array_length(p_card_ids, 1) loop
      update public.player_cards
        set stamina = greatest(0, least(100,
              round(stamina - coalesce(p_drops[i], 1.5))::int)),
            last_played = now()
        where id = p_card_ids[i] and owner_id = v_user;
      if found then v_updated := v_updated + 1; end if;
    end loop;
  end if;

  -- Descanso: el resto del plantel (lo que no jugó este partido)
  -- recupera fuerte, para volver al 100% en 1-2 partidos afuera.
  update public.player_cards
    set stamina = least(100, stamina + 55)
    where owner_id = v_user
      and stamina < 100
      and (
        p_card_ids is null
        or array_length(p_card_ids, 1) is null
        or not (id = any(p_card_ids))
      );

  return v_updated;
end;
$$;
revoke all on function public.apply_match_stamina(uuid[], numeric[]) from public;
grant execute on function public.apply_match_stamina(uuid[], numeric[]) to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  t.name as nivel,
  public.win_reward(t.max_rating)::int as ejemplo_monedas
from public.difficulty_tiers t
order by t.sort;

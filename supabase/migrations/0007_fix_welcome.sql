-- ============================================================
-- claim_welcome robusto + diagnóstico
-- Antes devolvía 0 en silencio si el catálogo estaba vacío.
-- Ahora falla con un mensaje claro y reparte un plantel completo.
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

create or replace function public.claim_welcome()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_count     int;
  v_templates int;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- ¿Ya tiene jugadores? No repetir el regalo.
  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then
    return 0;
  end if;

  -- Sin catálogo no hay nada que repartir: error explícito.
  select count(*) into v_templates from public.player_templates;
  if v_templates = 0 then
    raise exception 'catalog empty: no player templates found (run 0002_players.sql and seed_players.sql)';
  end if;

  -- Plantel balanceado. Si falta alguna posición, se completa con
  -- cualquier plantilla para garantizar un once jugable.
  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from public.player_templates t
       where t.position = 'GK' order by random() limit 3)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CB','RB','LB') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('CDM','CM','CAM','RM','LM') order by random() limit 9)
    union all
    (select t.id from public.player_templates t
       where t.position in ('RW','LW','ST') order by random() limit 6)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;

  -- Red de seguridad: completar hasta 18 cartas si el catálogo era pobre.
  if v_count < 18 then
    insert into public.player_cards (template_id, owner_id)
    select t.id, v_user
    from public.player_templates t
    order by random()
    limit (18 - v_count);
    select count(*) into v_count from public.player_cards where owner_id = v_user;
  end if;

  return v_count;
end;
$$;

revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;

-- ============================================================
-- DIAGNÓSTICO — ejecutá esto para ver qué falta en tu base
-- ============================================================
select
  (select count(*) from public.player_identities)  as identidades,
  (select count(*) from public.player_templates)   as jugadores_catalogo,
  (select count(*) from public.packs)              as sobres,
  (select count(*) from public.ai_opponents)       as rivales_ia,
  (select count(*) from public.profiles)           as clubes;

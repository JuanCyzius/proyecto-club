-- ============================================================
-- 1. NUEVOS RANGOS DE MONEDAS · PARTIDO RÁPIDO
--    65:100-120 · 70:120-150 · 75:150-223 · 80:220-270
--    85:270-330 · 90:330-350 · 95:350-400 · 99:400-650
-- 2. SOBRE DE BIENVENIDA: 15 cartas garantizando como mínimo
--    1 arquero, 2 centrales (CB), 2 medios (CM) y 1 delantero (ST);
--    las 9 restantes salen de cualquier posición.
-- ============================================================

create or replace function public.win_reward(p_rating int)
returns numeric language sql volatile as $$
  select case
    when p_rating <= 66 then floor(random() * (120 - 100 + 1) + 100)
    when p_rating <= 71 then floor(random() * (150 - 120 + 1) + 120)
    when p_rating <= 76 then floor(random() * (223 - 150 + 1) + 150)
    when p_rating <= 81 then floor(random() * (270 - 220 + 1) + 220)
    when p_rating <= 86 then floor(random() * (330 - 270 + 1) + 270)
    when p_rating <= 91 then floor(random() * (350 - 330 + 1) + 330)
    when p_rating <= 96 then floor(random() * (400 - 350 + 1) + 350)
    else                     floor(random() * (650 - 400 + 1) + 400)
  end::numeric;
$$;
revoke all on function public.win_reward(int) from public;
grant execute on function public.win_reward(int) to authenticated;

create or replace function public.claim_welcome()
returns int language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_templates int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.profiles where id = v_user and crest_chosen) then
    raise exception 'elegí primero el escudo de tu club';
  end if;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  if v_count > 0 then return 0; end if;

  select count(*) into v_templates from public.player_templates;
  if v_templates = 0 then
    raise exception 'catalog empty: importá primero el CSV';
  end if;

  -- 15 cartas: 1 GK + 2 CB + 2 CM + 1 ST garantizados + 9 libres
  insert into public.player_cards (template_id, owner_id)
  select id, v_user from (
    (select t.id from (
       select id from public.player_templates
       where position = 'GK' and overall between 62 and 72 limit 80
     ) t order by random() limit 1)
    union all
    (select t.id from (
       select id from public.player_templates
       where position = 'CB' and overall between 62 and 72 limit 200
     ) t order by random() limit 2)
    union all
    (select t.id from (
       select id from public.player_templates
       where position = 'CM' and overall between 62 and 72 limit 200
     ) t order by random() limit 2)
    union all
    (select t.id from (
       select id from public.player_templates
       where position = 'ST' and overall between 62 and 72 limit 150
     ) t order by random() limit 1)
    union all
    (select t.id from (
       select id from public.player_templates
       where overall between 62 and 72 limit 600
     ) t order by random() limit 9)
  ) picked;

  select count(*) into v_count from public.player_cards where owner_id = v_user;
  return v_count;
end; $$;
revoke all on function public.claim_welcome() from public;
grant execute on function public.claim_welcome() to authenticated;

select
  o as nivel, public.win_reward(o)::int as ejemplo
from unnest(array[65, 70, 75, 80, 85, 90, 95, 99]) o;

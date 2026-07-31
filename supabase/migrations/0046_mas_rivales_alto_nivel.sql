-- ============================================================
-- MÁS RIVALES DE NIVEL ALTO
--
-- Los niveles 85+ tenían pocos clubes, así que se repetían siempre
-- los mismos. Esto agrega automáticamente TODOS los clubes reales
-- del catálogo cuya plantilla dé media alta, con estilo y formación
-- variados. Al ser clubes reales, cada uno trae su propio plantel:
-- más rivales = más jugadores distintos apareciendo en los partidos.
-- ============================================================

insert into public.ai_opponents (name, style, tier, rating, formation, real_club, active, sort)
select
  c.club_name,
  -- Estilo variado y estable por club (hash del nombre)
  (array['possession','high_press','offensive','counter','defensive'])[
    1 + (abs(hashtext(c.club_name)) % 5)
  ],
  case
    when c.avg_top >= 84 then 'legendary'
    when c.avg_top >= 80 then 'elite'
    else 'strong'
  end,
  c.avg_top::int,
  (array['4-3-3','4-2-3-1','4-4-2','3-5-2'])[
    1 + (abs(hashtext(c.club_name || 'f')) % 4)
  ],
  c.club_name,
  true,
  100
from (
  select i.club_name, avg(t.overall) as avg_top, count(*) as n
  from public.player_identities i
  join public.player_templates t on t.identity_id = i.id
  where i.club_name is not null
  group by i.club_name
  having count(*) >= 14 and avg(t.overall) >= 76
) c
where not exists (
  select 1 from public.ai_opponents ao where ao.real_club = c.club_name
);

-- Los niveles altos necesitan clubes de verdad: si alguno quedó
-- inactivo por no tener plantilla, se desactiva para no romper el sorteo.
update public.ai_opponents ao set active = false
where ao.real_club is not null
  and not exists (
    select 1 from public.player_identities i
    where i.club_name = ao.real_club
  );

select tier, count(*) as rivales, min(rating) as min_media, max(rating) as max_media
from public.ai_opponents
where active
group by tier
order by min(rating);

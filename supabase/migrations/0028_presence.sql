-- ============================================================
-- PRESENCIA: QUIÉN ESTÁ EN LÍNEA Y CUÁNDO SE CONECTÓ
--
-- Se registra la última actividad en la propia tabla de perfiles, sin
-- tablas extra ni conexiones abiertas: el navegador avisa cada tantos
-- minutos y la escritura se ignora si ya se anotó hace poco. Con eso
-- alcanza para "en línea ahora" y "hace 2 h", sin gastar recursos.
-- ============================================================

alter table public.profiles
  add column if not exists last_seen timestamptz;

create index if not exists idx_profiles_last_seen
  on public.profiles (last_seen desc nulls last);

-- ------------------------------------------------------------
-- Latido: marca al usuario como activo.
-- Escribe como mucho una vez por minuto para no castigar la base.
-- ------------------------------------------------------------
create or replace function public.touch_presence()
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_last timestamptz;
begin
  if v_user is null then return; end if;

  select last_seen into v_last from public.profiles where id = v_user;
  if v_last is not null and now() - v_last < interval '60 seconds' then
    return;
  end if;

  update public.profiles set last_seen = now() where id = v_user;
end; $$;
revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

-- ------------------------------------------------------------
-- Listado de clubes con su actividad y algunos datos de contexto
-- ------------------------------------------------------------
create or replace function public.presence_list()
returns TABLE(
  "user_id" uuid,
  "username" text,
  "club_name" text,
  "crest_club" text,
  "level" int,
  "division" int,
  "rating" int,
  "last_seen" timestamptz,
  "minutes_ago" int,
  "squad_size" int,
  "best_overall" int,
  "matches_today" int,
  "joined_at" timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.username,
    p.club_name,
    p.crest_club,
    p.level,
    p.division,
    p.rating,
    p.last_seen,
    case
      when p.last_seen is null then null
      else greatest(0, (extract(epoch from (now() - p.last_seen)) / 60)::int)
    end,
    (select count(*)::int from public.player_cards c
      where c.owner_id = p.id and c.status = 'in_club'),
    coalesce((
      select max(t.overall)::int
      from public.player_cards c
      join public.player_templates t on t.id = c.template_id
      where c.owner_id = p.id and c.status = 'in_club'
    ), 0),
    (select count(*)::int from public.matches m
      where m.status = 'done'
        and m.played_at >= date_trunc('day', now())
        and (m.home_user = p.id or m.away_user = p.id)),
    p.created_at
  from public.profiles p
  order by
    -- Primero los conectados ahora, después por actividad más reciente
    (p.last_seen is not null and now() - p.last_seen < interval '3 minutes') desc,
    p.last_seen desc nulls last
  limit 60;
$$;
grant execute on function public.presence_list() to authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.profiles) as clubes,
  (select count(*) from public.profiles
     where last_seen > now() - interval '3 minutes') as en_linea_ahora;

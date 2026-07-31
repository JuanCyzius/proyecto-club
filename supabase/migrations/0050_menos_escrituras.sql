-- ============================================================
-- MENOS ESCRITURAS: FRENO A LAS LIQUIDACIONES AUTOMÁTICAS
--
-- settle_expired() (subastas vencidas) y settle_daily_top() (premio
-- diario) se ejecutaban en CADA carga del Mercado y de Actividad.
-- Con varios usuarios navegando, eran cientos de escrituras por hora
-- para no hacer nada la mayoría de las veces.
--
-- Ahora ambas salen enseguida si ya se ejecutaron hace poco (60 s el
-- mercado, 30 min el premio diario) o si no hay nada pendiente. El
-- comportamiento del juego no cambia: lo que hay que liquidar se
-- liquida igual, solo que sin repetir el trabajo al pedo.
-- ============================================================

create table if not exists public.job_runs (
  job     text primary key,
  last_at timestamptz not null default now()
);
alter table public.job_runs enable row level security;
-- Sin políticas: solo lo tocan funciones security definer.

/** true si el trabajo puede correr ahora (y deja marcado que corrió). */
create or replace function public._job_due(p_job text, p_every interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  select last_at into v_last from public.job_runs where job = p_job for update;
  if v_last is not null and now() - v_last < p_every then
    return false;
  end if;
  insert into public.job_runs (job, last_at) values (p_job, now())
    on conflict (job) do update set last_at = now();
  return true;
end; $$;

-- ------------------------------------------------------------
-- Mercado: como mucho una liquidación por minuto, y solo si hay
-- subastas realmente vencidas.
-- ------------------------------------------------------------
create or replace function public.settle_expired_throttled()
returns int language plpgsql security definer set search_path = public as $$
begin
  -- Consulta barata sobre índice: si no hay nada vencido, no se escribe
  if not exists (
    select 1 from public.market_listings
    where status = 'active' and ends_at <= now()
    limit 1
  ) then
    return 0;
  end if;
  if not public._job_due('market_settle', interval '60 seconds') then
    return 0;
  end if;
  return public.settle_expired();
end; $$;
revoke all on function public.settle_expired_throttled() from public;
grant execute on function public.settle_expired_throttled() to authenticated;

-- ------------------------------------------------------------
-- Premio diario: como mucho una vez cada media hora.
-- ------------------------------------------------------------
create or replace function public.settle_daily_top_throttled()
returns int language plpgsql security definer set search_path = public as $$
begin
  -- Si el premio de ayer ya está pagado, no hay nada que hacer
  if exists (
    select 1 from public.daily_top_prizes where day = current_date - 1 limit 1
  ) then
    return 0;
  end if;
  if not public._job_due('daily_top', interval '30 minutes') then
    return 0;
  end if;
  return public.settle_daily_top();
end; $$;
revoke all on function public.settle_daily_top_throttled() from public;
grant execute on function public.settle_daily_top_throttled() to authenticated;

select 'liquidaciones con freno listas' as resultado;

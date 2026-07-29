-- ============================================================
-- ESTAMINA PERSISTENTE ENTRE PARTIDOS
--
-- Ahora un partido cuesta 1-3 puntos de estamina sobre 100. Para que
-- eso tenga sentido, el desgaste debe acumularse entre partidos y
-- recuperarse con el tiempo (rotar la plantilla pasa a importar).
--
-- Recuperación: +8 puntos por día desde el último partido jugado.
-- ============================================================

alter table public.player_cards
  add column if not exists last_played timestamptz;

-- Aplica el desgaste de un partido a las cartas indicadas.
-- Solo el servidor la ejecuta (recibe la lista de cartas que jugaron).
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
  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return 0;
  end if;

  for i in 1..array_length(p_card_ids, 1) loop
    update public.player_cards
      set stamina = greatest(0, least(100,
            round(stamina - coalesce(p_drops[i], 1.5))::int)),
          last_played = now()
      where id = p_card_ids[i] and owner_id = v_user;
    if found then v_updated := v_updated + 1; end if;
  end loop;

  return v_updated;
end;
$$;
revoke all on function public.apply_match_stamina(uuid[], numeric[]) from public;
grant execute on function public.apply_match_stamina(uuid[], numeric[]) to authenticated;

-- Recuperación por descanso: +8 por día desde el último partido.
-- Se llama al abrir la plantilla; es barata e idempotente.
create or replace function public.recover_stamina()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid(); v_n int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  update public.player_cards
    set stamina = least(100, stamina + floor(
          extract(epoch from (now() - last_played)) / 86400 * 8)::int),
        last_played = now()
    where owner_id = v_user
      and last_played is not null
      and stamina < 100
      and now() - last_played > interval '3 hours';

  get diagnostics v_n = ROW_COUNT;
  return v_n;
end;
$$;
revoke all on function public.recover_stamina() from public;
grant execute on function public.recover_stamina() to authenticated;

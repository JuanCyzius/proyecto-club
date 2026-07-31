-- ============================================================
-- TARJETAS ROJAS Y SUSPENSIONES
--
-- Una roja deja al jugador fuera de 1 a 5 fechas según la gravedad.
-- Es poco probable (como las lesiones) pero pasa, y los jugadores
-- más agresivos —los de físico alto y poca técnica, típico
-- "leñero"— son bastante más propensos dentro de esa baja
-- probabilidad.
--
-- Se descuenta una fecha por partido jugado, igual que las lesiones.
-- Un suspendido no puede ser alineado.
-- ============================================================

alter table public.player_cards
  add column if not exists suspension_matches int not null default 0,
  add column if not exists suspension_reason  text;

create index if not exists idx_cards_suspended
  on public.player_cards (owner_id) where suspension_matches > 0;

create table if not exists public.red_card_types (
  code     text primary key,
  name     text not null,
  severity int  not null,   -- fechas de suspensión
  weight   numeric not null
);
alter table public.red_card_types enable row level security;
drop policy if exists "red_types_read" on public.red_card_types;
create policy "red_types_read" on public.red_card_types for select using (true);

insert into public.red_card_types (code, name, severity, weight) values
  ('doble_amarilla', 'Doble amarilla',            1, 46),
  ('ultimo_hombre',  'Falta como último hombre',  1, 22),
  ('plancha',        'Plancha temeraria',         2, 18),
  ('codazo',         'Codazo',                    3,  8),
  ('agresion',       'Agresión a un rival',       4,  4),
  ('insultos',       'Insultos al árbitro',       5,  2)
on conflict (code) do update
  set name = excluded.name, severity = excluded.severity, weight = excluded.weight;

-- ------------------------------------------------------------
-- Aplicar rojas tras el partido.
--
-- p_card_ids: los que disputaron el partido.
-- Base 1.2% por jugador. El factor de agresividad se calcula con las
-- stats del jugador: mucho físico y poca técnica (regate/pase) =
-- más propenso. Va de ~0.5x (técnico) a ~2.5x (leñero), así que en
-- el peor caso ronda el 3% y en el mejor el 0.6%.
-- ------------------------------------------------------------
create or replace function public.apply_match_reds(p_card_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  i int; v_red record; v_total numeric; v_r numeric; v_acc numeric;
  v_aggr numeric; v_chance numeric; v_st record;
  v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- Descontar una fecha a las suspensiones vigentes
  update public.player_cards
    set suspension_matches = suspension_matches - 1,
        suspension_reason = case
          when suspension_matches - 1 <= 0 then null else suspension_reason end
    where owner_id = v_user and suspension_matches > 0;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return v_out;
  end if;

  select sum(weight) into v_total from public.red_card_types;

  for i in 1..array_length(p_card_ids, 1) loop
    -- Perfil del jugador para medir su agresividad
    select
      coalesce((t.attributes->>'physical')::numeric, 60)   as physical,
      coalesce((t.attributes->>'defending')::numeric, 60)  as defending,
      coalesce((t.attributes->>'dribbling')::numeric, 60)  as dribbling,
      coalesce((t.attributes->>'passing')::numeric, 60)    as passing
      into v_st
      from public.player_cards pc
      join public.player_templates t on t.id = pc.template_id
      where pc.id = p_card_ids[i] and pc.owner_id = v_user;

    if not found then continue; end if;

    -- Agresividad: físico y marca por encima de la técnica
    v_aggr := 1 + (
      ((v_st.physical + v_st.defending) / 2)
      - ((v_st.dribbling + v_st.passing) / 2)
    ) / 28.0;
    v_aggr := greatest(0.45, least(2.5, v_aggr));
    v_chance := 0.012 * v_aggr;

    if random() < v_chance then
      v_r := random() * v_total;
      v_acc := 0;
      for v_red in select * from public.red_card_types order by code loop
        v_acc := v_acc + v_red.weight;
        if v_r <= v_acc then
          update public.player_cards
            set suspension_matches = v_red.severity,
                suspension_reason = v_red.code
            where id = p_card_ids[i] and owner_id = v_user
              and suspension_matches = 0;
          if found then
            v_out := v_out || jsonb_build_object(
              'card_id', p_card_ids[i],
              'reason', v_red.code,
              'name', v_red.name,
              'matches', v_red.severity
            );
          end if;
          exit;
        end if;
      end loop;
    end if;
  end loop;

  return v_out;
end; $$;
revoke all on function public.apply_match_reds(uuid[]) from public;
grant execute on function public.apply_match_reds(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- Levantar una sanción cuesta monedas (500 por fecha restante).
-- ------------------------------------------------------------
create or replace function public.pay_suspension(p_card_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_left int; v_cost bigint; v_coins bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select suspension_matches into v_left from public.player_cards
    where id = p_card_id and owner_id = v_user for update;
  if v_left is null then raise exception 'jugador no encontrado'; end if;
  if v_left <= 0 then raise exception 'ese jugador no está suspendido'; end if;

  v_cost := v_left * 500;
  select coins into v_coins from public.profiles where id = v_user for update;
  if v_coins < v_cost then raise exception 'insufficient funds'; end if;

  update public.profiles set coins = coins - v_cost where id = v_user;
  insert into public.coin_ledger(user_id, delta, reason, ref, balance_after)
    values (v_user, -v_cost, 'suspension_pay', p_card_id::text, v_coins - v_cost);
  update public.player_cards
    set suspension_matches = 0, suspension_reason = null
    where id = p_card_id;

  return jsonb_build_object('paid', v_cost);
end; $$;
revoke all on function public.pay_suspension(uuid) from public;
grant execute on function public.pay_suspension(uuid) to authenticated;

select 'tarjetas rojas listas' as resultado;

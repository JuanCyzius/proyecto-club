-- ============================================================
-- FIX — "there is no unique or exclusion constraint matching
--        the ON CONFLICT specification"
--
-- Causa: idx_identities_source se creó como índice único PARCIAL
-- (`where source_id is not null`). PostgreSQL no puede inferir el
-- ON CONFLICT desde un índice parcial salvo que se repita el
-- predicado en la cláusula.
--
-- Solución: índice único normal. Es seguro porque PostgreSQL trata
-- los NULL como distintos, así que las filas antiguas sin source_id
-- no generan conflicto entre sí.
--
-- Ejecutar ANTES de import_players_from_staging().
-- Idempotente.
-- ============================================================

drop index if exists public.idx_identities_source;

create unique index if not exists idx_identities_source
  on public.player_identities (source_id);


-- ============================================================
-- FIX 2 — Valores monetarios inflados x10
--
-- value_eur y wage_eur vienen como "78000000.0". La versión
-- anterior de _n() borraba todo lo que no fuera dígito, incluido
-- el punto, convirtiendo 78.000.000 en 780.000.000.
-- Afecta a 19.165 de los 19.239 jugadores.
--
-- Solución: quedarse con la parte entera (antes del punto).
-- ============================================================

create or replace function public._n(t text)
returns int language sql immutable as $$
  select nullif(
    regexp_replace(split_part(trim(coalesce(t, '')), '.', 1), '[^0-9-]', '', 'g'),
    ''
  )::int;
$$;

-- Comprobación: debe devolver 78000000 (no 780000000)
select public._n('78000000.0') as valor_correcto;

-- Comprobación: debe devolver una fila con indisunique = true
-- y sin predicado parcial (indpred nulo).
select
  i.relname            as indice,
  ix.indisunique       as es_unico,
  (ix.indpred is null) as no_es_parcial
from pg_index ix
join pg_class i on i.oid = ix.indexrelid
join pg_class t on t.oid = ix.indrelid
where t.relname = 'player_identities'
  and i.relname = 'idx_identities_source';

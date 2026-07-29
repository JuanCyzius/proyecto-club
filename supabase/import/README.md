# Importar la base de jugadores desde `players_22.csv`

El CSV es la **única fuente de verdad** del catálogo. Estos pasos reemplazan por completo los jugadores de ejemplo anteriores.

> **Importante:** la importación **borra todas las cartas existentes** de los usuarios (apuntaban a los jugadores viejos). Los clubes, monedas y partidos se conservan. Cada usuario podrá reclamar su plantel de nuevo desde *Plantilla*.

---

## Paso 1 — Ejecutar las migraciones

En el **SQL Editor** de Supabase, en este orden:

1. `supabase/migrations/0008_players_from_csv.sql`
   Crea la tabla de staging, amplía el esquema con **todos** los campos del CSV y define las funciones de importación y verificación.
2. `supabase/migrations/0009_catalog_helpers.sql`
   Actualiza sobres, plantel de bienvenida y listas de filtros para usar la base nueva.
3. `supabase/migrations/0010_fix_import_conflict.sql`
   Corrige dos cosas: el índice que necesita el `ON CONFLICT` de la importación, y el truncado de los valores monetarios (venían como `78000000.0` y se multiplicaban por 10).
4. `supabase/migrations/0011_fix_age_constraint.sql`
   Amplía el rango de edad permitido a 14-60. El límite original (15-45) era para jugadores ficticios y rechazaba un caso real: Kazuyoshi Miura, 54 años. Incluye además una **comprobación previa** que valida todo el CSV contra las restricciones antes de importar (debe dar 0 en todas las filas).

> Si ya ejecutaste 0008 antes de esta corrección, **ejecutá 0010 igual**: es idempotente y arregla ambos problemas.

## Paso 2 — Subir el CSV a la tabla de staging

En el **Table Editor** de Supabase:

1. Buscá la tabla **`players_import`** (la creó el paso 1, con las 110 columnas del CSV, todas como texto).
2. Botón **Insert → Import data from CSV**.
3. Seleccioná tu archivo `players_22.csv` (13 MB) y confirmá.

Debería quedar con **19.239 filas**. Verificalo con:

```sql
select count(*) from public.players_import;
```

> Si la carga por navegador falla por el tamaño, alternativa por terminal:
> ```bash
> psql "TU_CONNECTION_STRING" \
>   -c "\copy public.players_import from 'players_22.csv' with (format csv, header true)"
> ```

## Paso 3 — Transformar e importar

```sql
select * from public.import_players_from_staging();
```

Devuelve tres números: `identidades`, `jugadores`, `porteros`.
Esperado: **19239 · 19239 · 2132**.

## Paso 4 — Verificar

```sql
select * from public.verify_player_import();
```

Todas las filas deben tener `ok = true`:

| Chequeo | Esperado |
|---|---|
| Jugadores en el CSV (staging) | 19239 |
| Identidades importadas | 19239 |
| Plantillas (jugadores del juego) | 19239 |
| Coinciden staging y catálogo | true |
| Porteros con stats de portería | 2132 |
| Sin atributos principales | 0 |
| Sin overall | 0 |
| Rarezas presentes | las 6 |
| Con club asignado | ~19178 |
| Jugadores de ejemplo restantes | 0 |

## Paso 5 (opcional) — Liberar espacio

Una vez verificado, podés vaciar la tabla de staging:

```sql
truncate public.players_import;
```

Conservá la tabla si pensás reimportar en el futuro (por ejemplo, con otra temporada del dataset).

---

## Qué se importa

**Datos biográficos y de club** (en `player_identities`): nombre corto y largo, fecha de nacimiento, nacionalidad, club, liga, nivel de liga, altura, peso, pie hábil, pierna mala, filigranas, ritmo de trabajo, complexión, reputación internacional, rasgos y etiquetas.

**Datos de juego** (en `player_templates`): posición principal, todas las posiciones, media, potencial, edad, rareza, valor, salario, los 6 atributos principales, los 6 de portería y los 29 atributos detallados (ataque, habilidad, movimiento, potencia, mentalidad y defensa).

## Rareza: el único campo derivado

El CSV no trae rareza (es un concepto del juego). Se calcula a partir del `overall`, con bandas calibradas sobre la distribución real del dataset:

| Rareza | Overall | Jugadores | % |
|---|---|---|---|
| Icono | 89+ | 22 | 0,11% |
| Legendario | 84-88 | 118 | 0,61% |
| Épico | 78-83 | 723 | 3,76% |
| Raro | 72-77 | 2.964 | 15,41% |
| Poco común | 65-71 | 7.229 | 37,57% |
| Común | <65 | 8.183 | 42,53% |

Ningún otro dato se inventa ni se altera.

## Porteros

El CSV deja vacíos los 6 atributos principales de los porteros y en su lugar trae sus stats reales (`goalkeeping_*`). El juego ahora:

- guarda esas stats tal cual en `gk_attributes`,
- las usa en el simulador (paradas y penales) y en la cara de la carta,
- y rellena los 6 atributos principales derivándolos de ellas, para que el resto del sistema siga funcionando.

Un jugador de campo puesto al arco rinde un 30% peor: la penalización es intencional.

# Proyecto Club — Fase 1 (Fundaciones)

Base del juego de navegador de colección/gestión de fútbol.
Stack: **Next.js (App Router) + TypeScript + Tailwind**, **Supabase** (Auth, Postgres, RLS), deploy en **Netlify**. Mobile-first.

Esta fase entrega: **registro abierto por usuario y contraseña**, **creación de club en un paso**, **dashboard vacío** y **CI/CD**. Aún no hay jugadores, cartas, partidos, mercado ni sobres (llegan en fases siguientes).

## Modelo de acceso
Cualquiera puede crear su cuenta desde la app: elige **nombre del club**, **usuario**, **email** y **contraseña**. Recibe un **email de confirmación**; al abrir el enlace entra directo a su club. Incluye **recuperación de contraseña** por email.

El `username` es su identidad pública en el juego (para ligas y ranking); el email es para acceder y recuperar la cuenta.

---

## 1. Requisitos
- Node.js 20+
- Un proyecto en [Supabase](https://supabase.com)
- Cuenta en [Netlify](https://netlify.com) y un repo en GitHub

## 2. Instalación local
```bash
npm install
cp .env.example .env.local   # rellena con tus valores de Supabase
npm run dev
```

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU-CLAVE
```
Los encuentras en Supabase → Project Settings → API Keys. Usa la **publishable key** (`sb_publishable_...`), reemplazo actual de la anon key para el cliente, con el mismo privilegio bajo (RLS manda). Nunca uses la **secret key** en el cliente. (Proyectos antiguos: si solo tienes una anon key legacy, ponla en `NEXT_PUBLIC_SUPABASE_ANON_KEY`; el código la usa como fallback.)

## 2b. ⚠️ Si te quedaste en un bucle /club ↔ /login

Ese bucle ocurre cuando tu usuario existe en `auth.users` pero **no tiene fila en `profiles`**.

**Solución:** ejecutá `supabase/migrations/0006_auth_repair.sql` en el SQL Editor. Es idempotente y hace todo lo necesario:
- añade `username` a `profiles` si falta,
- **crea los perfiles de usuarios huérfanos** (esto rompe el bucle),
- instala el trigger que crea el perfil al registrarse,
- limpia restos del viejo sistema de invitados.

Al final del archivo hay una consulta de comprobación: descomentala y ejecutala (los tres valores deben dar `true`).

Además, la app ya no puede volver a entrar en bucle: si detecta sesión sin perfil, te lleva a `/setup` para crear el club (o cerrar sesión), en vez de rebotar contra `/login`.

## 3. Base de datos
Aplica la migración `supabase/migrations/0001_init_phase1.sql`:

**Opción A — SQL Editor:** copia el contenido del archivo y ejecútalo.

**Opción B — Supabase CLI:**
```bash
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Crea la tabla `profiles` (con `username` único), la vista pública `public_profiles`, el trigger `handle_new_user` (crea el perfil al registrarse) y la función `is_username_available`.

Si venís de una versión anterior del proyecto, ejecutá también `0006_fix_open_registration.sql` y `0007_email_registration.sql` (ambas son idempotentes y seguras de repetir).

### ⚠️ Configuración obligatoria de Supabase Auth

**a) Activar confirmación por email**
Authentication → Providers → Email:
- **Confirm email: ON**
- **Allow new users to sign up: ON**

**b) Configurar las URLs de redirección**
Authentication → URL Configuration:
- **Site URL:** la URL de tu sitio en Netlify (ej. `https://tu-juego.netlify.app`)
- **Redirect URLs:** añadí estas dos entradas:
  - `https://tu-juego.netlify.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Si estas URLs no están, el enlace del email no funciona.

**c) SMTP propio (importante)**
El servidor de correo integrado de Supabase es **solo para pruebas**: envía muy pocos emails por hora y suele caer en spam. Para que se registren 20-30 personas necesitás SMTP propio.

Opción recomendada (gratis): **Resend**
1. Creá una cuenta en resend.com y verificá un dominio (o usá su dominio de pruebas).
2. Generá una API key.
3. En Supabase → Project Settings → **Authentication → SMTP Settings** → *Enable Custom SMTP*:
   - Host: `smtp.resend.com` · Port: `465` · User: `resend` · Password: tu API key
   - Sender email/name: los tuyos

**d) Variable de entorno del sitio**
Para que los enlaces de los emails apunten al dominio correcto, añadí en Netlify (y en `.env.local`):
```
NEXT_PUBLIC_SITE_URL=https://tu-juego.netlify.app
```
Si no la definís, se deduce del request (funciona, pero es menos fiable detrás de proxies).

## 4. Deploy en Netlify
1. Conecta el repo en Netlify.
2. En *Site settings → Environment variables* añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. El plugin `@netlify/plugin-nextjs` (en `netlify.toml`) gestiona el build.

### CI/CD (GitHub Actions)
`.github/workflows/ci.yml` corre lint + typecheck + build en cada push/PR y aplica migraciones en `main`. Secrets necesarios: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.

---

## 5. Cómo validar la Fase 1

**a) Registro con confirmación.** En `/login`, pestaña *Crear cuenta*: club, usuario, email y contraseña → recibís un email → al abrir el enlace entrás a `/club` con tu club creado.

**b) Usuario único.** Si el usuario ya existe, la app avisa antes de registrar.

**c) Login y recuperación.** Cerrá sesión y entrá con email + contraseña. *Olvidé mi contraseña* envía un enlace para fijar una nueva.

**d) RLS en `profiles`.** Un usuario no puede leer/editar el perfil de otro:
```sql
-- Autenticado como A, intentando ver a B:
select * from public.profiles where id = 'ID_DE_B';  -- 0 filas
```
La tabla base solo es visible para su dueño (`auth.uid() = id`). Los básicos públicos (usuario/club/nivel/división) viven en la vista `public_profiles`. El perfil solo se crea vía el trigger `handle_new_user` (SECURITY DEFINER); el cliente no inserta filas crudas ni fija `coins`/`level`.

**e) El build pasa sin errores de tipos.**
```bash
npm run typecheck
npm run build
```

---

## 6. Estructura (resumen)
```
app/(auth)/login   → registro + login (usuario/contraseña) con pestañas
app/(game)/club    → dashboard (identidad + monedero + estados vacíos)
app/(game)/{squad,market,packs,play} → placeholders de próximas fases
components/ui       → design system (Button, Card, Input, Modal, Tabs, Avatar, EmptyState)
components/nav      → navegación inferior mobile-first
components/brand    → PitchBackdrop (firma visual: líneas de campo)
lib/supabase        → clientes browser/server + env (publishable key)
lib/auth.ts         → helpers getSessionUser / getProfile
middleware.ts       → refresco de sesión en cada request
supabase/migrations → SQL versionado (0001_init_phase1.sql)
```

## 7. Seguridad (server-authoritative)
- El cliente **nunca** fija `coins`, `level`, ni crea perfiles: todo pasa por trigger/Server Actions.
- RLS activa en `profiles`. La `secret`/`service_role` key jamás se usa en el cliente.

---

## Fase 2 — Jugadores y cartas (base real desde CSV)

El catálogo son **19.239 jugadores reales** importados desde `players_22.csv`. Ese archivo es la **única fuente de verdad**: no hay jugadores de ejemplo ni datos inventados.

### Importación
Instrucciones completas en **`supabase/import/README.md`**. Resumen:
1. Ejecutar `0008_players_from_csv.sql` y `0009_catalog_helpers.sql`.
2. Importar `players_22.csv` en la tabla `players_import` (Table Editor → Import data from CSV).
3. `select * from public.import_players_from_staging();`
4. `select * from public.verify_player_import();` → todo debe dar `ok = true`.

### Qué se guarda
Todo lo que trae el CSV: datos biográficos (nacimiento, altura, peso, nacionalidad), club y liga, pie hábil, pierna mala, filigranas, ritmo de trabajo, reputación, rasgos, valor, los 6 atributos principales, los 6 de portería y los 29 atributos detallados.

Lo único derivado es la **rareza**, que el CSV no trae: se calcula por bandas de `overall` (icono 89+, legendario 84-88, épico 78-83, raro 72-77, poco común 65-71, común <65). La distribución resultante es una pirámide sana: 42% comunes y solo **22 iconos**.

### Porteros
El CSV deja vacíos los atributos principales de los porteros y trae sus stats reales de portería. El juego los guarda aparte (`gk_attributes`), los usa en el simulador (paradas y penales), los muestra en la cara de la carta (EST/BLO/SAQ/REF/VEL/COL) y deriva de ellos los 6 principales para el resto del sistema. Hay un test que verifica que un portero de 90 encaja menos goles que uno de 55.

### Posiciones
Se añadieron **CF, RWB y LWB** al juego para no perder información del CSV. Cada jugador guarda además todas sus posiciones secundarias.

### Validación
- Catálogo (`/players`): buscador por nombre corto o completo, y filtros por posición, rareza, **liga**, **nacionalidad** y media mínima.
- Detalle (`/players/[id]`): ficha completa con todos los atributos agrupados.
- Sobres, plantel de bienvenida, equipos IA, plantilla y colección leen todos de esta misma base.

## Fase 3 — Plantilla, formación y táctica

Instancias de carta por usuario, pitch interactivo, formaciones, táctica, química y media de equipo.

### Base de datos (Fase 3)
Aplica `supabase/migrations/0003_squad.sql`: crea `player_cards` (instancias), `squads`, `squad_slots` (todas con RLS de dueño) y el RPC de desarrollo `dev_grant_starter_cards`.

### Cómo probar (Fase 3)
1. Entra a **Plantilla** (`/squad`). Si no tenés jugadores, pulsá **Reclamar plantel de prueba** (reparte ~27 cartas variadas vía RPC; se reemplaza por el sobre de bienvenida en la Fase 5).
2. Tocá un hueco del campo → elegí una carta del selector. El color del borde indica el ajuste de posición: verde (natural), dorado (compatible), gris (misma línea), rojo (fuera de posición).
3. Cambiá la **formación**: los titulares se reubican por mejor ajuste.
4. Configurá la **táctica** (mentalidad, presión, ritmo, amplitud, pase) y armá la **banca**.
5. **Media** y **Química** se recalculan en vivo. Pulsá **Guardar**.

### Validación (Fase 3)
- Colocás 11 titulares + suplentes y persisten al recargar.
- Cambiar de formación reubica correctamente a los jugadores.
- Media y química cambian al mover jugadores o sacarlos de su posición.
- El guardado valida en el servidor que cada carta te pertenezca (server-authoritative).

> Nota de UX: para colocar jugadores se usa **tocar/click** (tocás el hueco y elegís la carta) en vez de arrastrar. Es más fiable en móvil que el drag & drop táctil y funciona igual en escritorio. Si preferís arrastrar, se puede añadir con una librería de DnD.

> Nota técnica: media y química se calculan en el cliente solo para la UI. En la Fase 4, el servidor recarga la plantilla real y **recalcula todo** al simular; nunca confía en valores del cliente.

---

## Fase 4 — Motor de simulación + partidos vs IA

El juego cobra vida: motor determinista, partidos con eventos y replay, rivales IA.

### Configuración adicional (Fase 4)
El resultado de los partidos lo escribe **solo el servidor** con una clave privilegiada. Añadí al entorno del servidor (local y en Netlify, **sin** `NEXT_PUBLIC_`):
```
SUPABASE_SECRET_KEY=sb_secret_TU-CLAVE
```
La encontrás en Supabase → Project Settings → API Keys → *Secret keys*. Esta clave **nunca** va al cliente. (Proyecto antiguo: usá `SUPABASE_SERVICE_ROLE_KEY`.)

### Base de datos (Fase 4)
Aplicá `supabase/migrations/0004_matches.sql`: crea `ai_opponents` (con 8 rivales sembrados) y `matches` (RLS: los usuarios solo **leen** sus partidos; la escritura es del servidor).

### El motor (`lib/sim`, TypeScript puro)
- Determinista: misma entrada + `seed` → mismo resultado (auditable, testeable).
- `rng.ts` (RNG con seed), `ratings.ts` (ratings por unidad + táctica + localía), `events.ts` (bucle de minutos: ocasiones, remates, goles, faltas, tarjetas, lesiones, cambios), `engine.ts` (tiempos, prórroga y penales en copa).
- No importa nada de Supabase/Next → portable a una Edge Function/worker cuando haga falta escalar.

Tests: `npm run test:sim` (determinismo, variabilidad, el mejor gana >70%, la copa siempre define, marcadores en rango).

### Cómo probar (Fase 4)
1. Armá y **guardá tu once** en Plantilla (Fase 3).
2. Entrá a **Jugar** (`/play`), elegí un rival y pulsá **Jugar**.
3. El servidor simula con tu equipo y táctica reales y te lleva al **replay** (`/match/[id]`): comentario minuto a minuto, marcador en vivo, controles de pausa/saltar y resumen con estadísticas y MVP.

### Validación (Fase 4)
- Jugás vs IA y ves el partido con eventos coherentes; equipos mejores tienden a ganar; cambiar tu táctica cambia resultados.
- El marcador y el log se guardan en el servidor: el cliente no puede falsificarlos (RLS de `matches` es solo lectura; escribe el service role).
- Sin once completo, el juego te pide armarlo antes de jugar.

> Nota de arquitectura: para poder desplegarlo hoy en Netlify, la simulación corre en un **Server Action** (server-authoritative) reutilizando el motor puro `lib/sim`. Cuando quieras escalar a miles de partidos, ese mismo motor se mueve a una Edge Function/worker con una cola, sin reescribirlo.

---

## Fase 5 — Economía y sobres

Cierra el bucle: **jugar → ganar monedas → abrir sobres → mejorar**.

### Base de datos (Fase 5)
Aplicá `supabase/migrations/0005_economy.sql`. Crea:
- `coin_ledger`: registro contable append-only de cada movimiento (fuente de verdad; `profiles.coins` es caché).
- `packs` (4 sobres sembrados: Bronce, Plata, Oro, Especial) y `pack_openings` (auditoría con seed).
- RPCs transaccionales (`SECURITY DEFINER`): `grant_match_reward`, `open_pack`, `quick_sell`, `claim_welcome`.

### Cómo funciona la economía
**Entradas (faucets):** recompensa por partido (según resultado y nivel del rival) y venta rápida de duplicados.
**Salidas (sinks):** compra de sobres.

Protecciones implementadas:
- **Idempotencia:** cada partido paga una sola vez (`reason + ref` en el ledger). Reintentos o doble clic no duplican.
- **Rendimientos decrecientes:** cada partido recompensado del día paga un 8% menos, con piso del 25%. Mata el farmeo infinito.
- **Atomicidad:** cobrar y entregar cartas ocurre en una sola transacción. Si algo falla, se revierte todo.
- **Cartas creadas solo por el servidor:** `player_cards` no tiene policy de INSERT para usuarios; solo las RPC pueden crearlas. Duplicación imposible.
- **Auditoría:** cada apertura guarda su seed y resultado en `pack_openings`.

### Cómo probar (Fase 5)
1. **Plantilla** → si no tenés jugadores, **Abrir sobre de bienvenida** (27 jugadores, una sola vez).
2. Armá tu once y jugá en **Jugar**. Al final del replay verás la **recompensa en monedas**.
3. **Sobres** (`/packs`): mirá las probabilidades (son públicas), comprá y abrí. Las cartas se revelan una a una y entran a tu club.
4. **Club → Mi colección** (`/collection`): ordená por media/rareza/posición y hacé **venta rápida** de los duplicados.
5. **Club**: saldo, número de jugadores, últimos partidos y últimos movimientos del ledger.

### Validación (Fase 5)
- El saldo cuadra con la suma del ledger: `select sum(delta) from coin_ledger where user_id = '...'`.
- Jugar muchos partidos seguidos paga cada vez menos (rendimientos decrecientes).
- Sin monedas suficientes, el sobre no se abre y no se descuenta nada.
- Vender una carta que está en el once libera su posición automáticamente.

> Nota: las probabilidades de sobre se resuelven en Postgres con `random()`. La apertura queda registrada con seed y resultado en `pack_openings`, así que toda entrega es auditable.

---

## Mercado, lesiones e ítems

### Migraciones (en este orden)
- `0017_injuries_and_items.sql` — lesiones por partidos e ítems consumibles.
- `0018_packs_with_items.sql` — sobres ampliados que también entregan ítems.
- `0019_market.sql` — mercado de traspasos.

### Lesiones
Los jugadores se lesionan durante los partidos (~4% por jugador). Cada lesión
tiene tipo y duración **en partidos**, no en tiempo:

| Gravedad | Partidos | Ejemplos |
|---|---|---|
| Leve | 1 | golpe en el hombro, tobillo resentido, golpe en el muslo |
| Media | 2 | sobrecarga de gemelo, molestia en el aductor, esguince de tobillo |
| Grave | 3 | desgarro isquiotibial, lesión de rodilla |

Un jugador lesionado **no puede jugar ni venderse**. La lesión baja un partido
cada vez que disputás un encuentro.

### Ítems
Salen en los sobres y se compran en la tienda (pestaña *Ítems* en Sobres).

| Ítem | Efecto | Precio |
|---|---|---|
| Vendaje | cura lesión de 1 partido | 600 |
| Fisioterapia | cura hasta 2 partidos | 1.800 |
| Tratamiento total | cura cualquier lesión | 5.000 |
| Bebida isotónica | +10 de energía | 250 |
| Recuperación | +20 de energía | 700 |
| Cámara hiperbárica | +30 de energía | 1.600 |

Se usan desde **Colección → tocar un jugador**.

### Sobres ampliados
| Sobre | Total | Ítems | Precio |
|---|---|---|---|
| Bronce | 10 | 3 | 700 |
| Plata | 10 | 3 | 1.800 |
| Oro | 7 | 2 | 5.000 |
| Especial | 7 | 2 | 15.000 |

### Mercado
Subasta con puja y compra inmediata, 8 horas de duración.

- **Impuesto del 5%** al vendedor (sumidero de monedas).
- **Rangos de precio** por rareza y media: impide regalar cartas entre amigos.
- **Escrow**: al pujar se retiene tu dinero; si te superan, se devuelve solo.
- **Anti-francotirador**: una puja en los últimos 2 minutos extiende la subasta.
- No se puede vender un jugador **del once, lesionado o vinculado**.
- Las subastas vencidas se resuelven al abrir el mercado.

Publicás desde **Colección → jugador → Publicar en el mercado**.

---

## Fase 7 — PvP, ligas y ranked

Migración: `0021_pvp_leagues_ranked.sql`. Pantalla nueva: **Ligas** (en la barra inferior).

### Liga del grupo
Botón *Crear liga del grupo*: genera una competición con **todos los clubes
registrados**, calendario de ida y vuelta, y la tabla en cero. Cada partido
jugado actualiza automáticamente puntos, goles y diferencia.

Con 30 clubes son 870 partidos (58 por club). La tabla ordena por puntos,
luego diferencia de gol y luego goles a favor.

### Ranked
*Buscar partido* empareja con un club de rating parecido (la banda se ensancha
si no encuentra a nadie). Al resolverse ajusta el rating con un sistema Elo
(K=32) y recalcula la división (10 = más baja, 1 = más alta).

El Elo premia las sorpresas: ganarle a alguien muy superior da +29, mientras que
un favorito que gana lo esperable suma solo +3.

### Desafíos con apuesta
Retás a otro club poniendo monedas; ambos ponen lo mismo. El ganador se lleva el
bote menos un **5% de comisión** (sumidero). Si empatan, cada uno recupera lo
suyo sin comisión. El dinero se retiene al crear el desafío (escrow), así que
nadie puede apostar lo que no tiene.

> Solo se apuestan **monedas**, nunca cartas: en un grupo de gente que se conoce,
> apostar jugadores es un vector de colusión.

### Seguridad
- Los partidos PvP se simulan en el servidor **recargando las plantillas reales
  de ambos usuarios**. El cliente no aporta ningún dato de juego.
- Determinismo con seed también en PvP: ambos ven exactamente el mismo partido.
- Resolución idempotente: un partido no puede jugarse ni pagarse dos veces
  (`status = 'pending'` como condición y bandera `settled`).

### Validación
- Creá la liga, jugá una jornada y verificá que la tabla suma bien.
- Dos usuarios en ranked: ambos ven el mismo resultado y los ratings se mueven
  en sentidos opuestos.
- Una apuesta: `select sum(delta) from coin_ledger` debe cuadrar con los saldos,
  y la diferencia total es exactamente la comisión.

---

## Fase 8 — Progresión, objetivos y temporadas

Migraciones: `0022_objectives.sql` y `0023_season_pass.sql`.
Pantalla nueva: **Objetivos** (desde el Club).

### Cómo funciona el progreso
No hay contadores que mantener: el progreso se calcula **leyendo los hechos ya
registrados** (partidos jugados, ledger de monedas, sobres abiertos...). Así
siempre refleja la realidad y es imposible que se desincronice.

### Contenido
- **3 misiones diarias** (jugar, ganar, marcar goles).
- **5 semanales** (volumen de partidos, victorias, vallas invictas, sobres, PvP).
- **3 de temporada** (metas grandes de una sola vez).
- **Recompensa diaria con racha**: de 120 a 360 monedas según los días seguidos.
- **7 logros permanentes** (coleccionar, conseguir un 90+, 100 victorias...).
- **Pase de temporada de 10 niveles**, ganado con XP. Nada se compra con dinero.

### Rollover de temporada
`rollover_season()` cierra la temporada, reparte premios por posición final
(50.000 al campeón, decreciente), guarda el histórico, reinicia clasificaciones
y abre la siguiente.

**Conserva club, cartas, monedas, ítems y logros.** Solo se reinicia lo
competitivo: el XP de temporada vuelve a cero y el rating revierte parcialmente
hacia la media (1800 → 1266), así que conservás parte de la ventaja ganada.

### Rankings
Por rating, nivel, XP de temporada o victorias, más un palmarés histórico de
títulos por club.

### Balance
La progresión aporta cerca del 47% del ingreso diario de un jugador activo; el
resto viene de los partidos. Con eso, un sobre Bronce se compra en medio día y
uno Especial en unos ocho.

### Validación
- Completá una misión jugando, cobrala, y comprobá que no se puede cobrar dos
  veces (la clave primaria de `user_objectives` lo garantiza por periodo).
- Ejecutá `select public.rollover_season();` y verificá que conservás las cartas
  y las monedas, pero la tabla de la liga se reinicia.

---

## Modo Draft

Migración: `0024_draft_mode.sql`. Se entra desde **Jugar → Draft**.

### Cómo funciona
1. Pagás **2.500 monedas** de entrada.
2. Armás un once eligiendo entre **5 candidatos por puesto** (todos de media
   79+, así que tocan cracks que no tenés en tu plantilla).
3. Jugás hasta **5 partidos seguidos**. Una derrota termina la racha.
4. Cobrás según cuántos ganaste.

### Recompensas
| Victorias | Monedas | Sobres | Neto |
|---|---|---|---|
| 0 | 300 | — | −2.200 |
| 1 | 1.200 | — | −1.300 |
| 2 | 2.600 | Bronce | **+800** |
| 3 | 5.000 | Plata | +4.300 |
| 4 | 9.000 | Oro | +11.500 |
| 5 | 18.000 | Oro + Especial | +35.500 |

Con **2 victorias recuperás la entrada**. El valor esperado (asumiendo 55% de
victorias) es de ~3.900 contra una entrada de 2.500: rentable, pero no roto.

Los rivales suben de nivel con cada victoria (75 → 80 → 85), y los partidos son
a eliminación directa (sin empates: hay prórroga y penales).

Los sobres ganados quedan como **créditos canjeables**: se abren gratis desde la
pantalla del Draft. La operación es contablemente neutra y no se puede canjear
dos veces.

### ⚠ Arreglo de seguridad incluido
Esta migración **revoca el permiso de `import_players_from_staging`**, que por
un error estaba accesible a cualquier usuario autenticado. Esa función borra el
catálogo completo y las cartas de todos los jugadores. Ahora solo se puede
ejecutar desde el SQL Editor. También elimina `dev_grant_starter_cards`, que
regalaba cartas.

## Siguiente fase
**Fase 6 — Mercado:** subastas y compra inmediata entre usuarios, impuesto de mercado, rangos de precio anti-lavado, expiración por cron e historial.



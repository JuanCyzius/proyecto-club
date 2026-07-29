# Dirección artística — Proyecto Club

Referencia única para que todo el juego hable el mismo idioma visual.
Si algo no encaja acá, no entra.

## Concepto

**Estadio de noche.** Fondo profundo casi negro con un tinte azul-verdoso,
como una cancha vista desde la tribuna alta, y el verde del césped bajo los
focos como único color de acción. El oro aparece solo cuando hay algo valioso
en juego.

## Color

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#080C10` | Fondo de la aplicación |
| `surface` | `#101820` | Tarjetas y listas |
| `surface-2` | `#16212A` | Campos, elementos anidados |
| `surface-3` | `#1D2A35` | Estado hover |
| `border` | `#22303B` | Separación por defecto |
| `border-strong` | `#2E3F4C` | Bordes activos |
| `text` | `#EAF1F3` | Texto principal |
| `muted` | `#8FA3AD` | Texto secundario |
| `muted-2` | `#63757E` | Marcadores de posición |
| `turf` | `#2FE08A` | **Acción.** Botones, activo, éxito |
| `trophy` | `#F5C451` | **Valor.** Monedas, premios, rareza alta |
| `danger` | `#F2555A` | Errores, lesiones, derrota |
| `info` | `#4FA8F5` | Datos neutros, gemas |

Regla: **un solo acento por pantalla.** Si el verde manda, el oro se reserva
para el dato de valor. Nunca los dos compitiendo.

## Tipografía

- **Display — Archivo** (600/700/800): títulos, medias, marcadores, números
  grandes. Condensada y atlética, como la numeración de una camiseta.
- **Cuerpo — Manrope** (400/500/600/700): texto, etiquetas, botones.

Los números siempre en `tabular-nums`: al animar un contador, las cifras no
deben bailar.

**Escala:** título de pantalla 26px/800 · título de sección (eyebrow) 11px/600
mayúsculas con `tracking-[0.16em]` · cuerpo 14-15px · metadatos 10-11px.

## Forma

- **Radios:** 8px (chips, barras) · 12px (botones, campos) · 18px (tarjetas,
  listas) · 24px (hojas, cabecera del club).
- **Elevación, 3 niveles:** `e1` para listas, `e2` para tarjetas, `e3` solo
  para lo que flota (hojas, diálogos). Sin sombras dramáticas.
- **Bordes antes que sombras.** La separación se resuelve con `border` de 1px;
  la sombra solo indica que algo está por encima.
- **Listas agrupadas:** un borde exterior con filas separadas por hairlines, en
  vez de una caja por elemento. Menos ruido.

## Movimiento

| Uso | Duración | Curva |
|---|---|---|
| Hover, color | 150 ms | `ease-out` |
| Entrada de elemento | 200-250 ms | `cubic-bezier(0.16,1,0.3,1)` |
| Hoja / diálogo | 280 ms | igual |
| Celebración, rebote | 320 ms | `cubic-bezier(0.34,1.56,0.64,1)` |

Solo se animan **`transform` y `opacity`**. Nunca `width`, `height`, `top` ni
`margin`: provocan reflow y tiran los fotogramas. Las barras de progreso usan
`scaleX` con origen a la izquierda.

Toda animación respeta `prefers-reduced-motion`.

## Firma

**Las líneas de campo** (`.pitch-lines`): línea de medio campo y círculo
central, tenues, tras las cabeceras principales. Aparecen en el club, el acceso
y el onboarding — nunca en pantallas de datos, donde solo estorbarían.

## Retratos y escudos

- **Rostros:** ilustración generada por código a partir del nombre
  (determinista: el mismo jugador tiene siempre la misma cara). Seis peinados,
  barbas, tonos de piel variados. No se usan fotos de personas reales.
- **Escudos:** 263 clubes, normalizados a lienzo cuadrado de 96×96 con el
  escudo centrado y recortado al contenido. Se muestran fijando el tamaño; al
  venir del mismo lienzo, nunca se deforman.
- **Marcos de carta por rareza:** bronce → plata → oro → zafiro → rubí → icono.
  El degradado y el resplandor suben con la rareza.

## Escritura

- Voz activa y en segunda persona: "Armá tu once", no "El once debe armarse".
- El botón dice lo que pasa: *Publicar* produce *Publicado*.
- Los errores explican qué pasó y cómo seguir; no piden disculpas.
- Los estados vacíos son una invitación, no un lamento.
- Español rioplatense, coherente en toda la interfaz.

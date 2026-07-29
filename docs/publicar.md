# Publicar y actualizar Proyecto Club

Guía para tener el juego online 24/7 y poder actualizarlo en un minuto.

---

## Resumen

| | |
|---|---|
| **Dónde vive el código** | GitHub (repositorio privado) |
| **Quién lo sirve** | Netlify (gratis) |
| **Base de datos** | Supabase (gratis) |
| **Costo total** | $0 |
| **Actualizar** | Arrastrar archivos → `git push` → listo en ~2 min |

La idea es que **Netlify vigile tu repositorio de GitHub**. Cada vez que
subís un cambio, Netlify lo detecta, compila y publica solo. Vos nunca
volvés a tocar Netlify.

---

## Parte 1 — Publicarlo (una sola vez, ~20 minutos)

### 1. Crear el repositorio en GitHub

1. Entrá a [github.com/new](https://github.com/new).
2. Nombre: `proyecto-club`.
3. Elegí **Private** (privado). Importante: el código no tiene por qué ser
   público, y así nadie ve la lógica del juego.
4. **No** marques ninguna casilla de "Initialize with…".
5. Creá el repositorio y dejá la página abierta: te va a mostrar unos
   comandos que vas a necesitar.

### 2. Subir el código

Descomprimí el zip. Abrí una terminal **dentro de la carpeta
`proyecto-club`** (la que tiene el `package.json`) y ejecutá:

```bash
git init
git add .
git commit -m "Primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/proyecto-club.git
git push -u origin main
```

Cambiá `TU-USUARIO` por tu usuario de GitHub.

> Si nunca usaste Git, instalalo desde [git-scm.com](https://git-scm.com).
> La primera vez te va a pedir usuario y contraseña: la "contraseña" es un
> **token**, que se crea en GitHub → Settings → Developer settings →
> Personal access tokens → Tokens (classic) → Generate new token, con el
> permiso `repo` marcado. Guardalo en algún lado, lo vas a reusar.

**El `.env.local` no se sube** — está en el `.gitignore` a propósito, para
que tus claves no queden en GitHub. Las vas a cargar en Netlify aparte.

### 3. Conectar Netlify

1. Entrá a [netlify.com](https://netlify.com) y creá una cuenta
   (podés entrar directamente con GitHub).
2. **Add new site → Import an existing project**.
3. Elegí **GitHub** y autorizá el acceso.
4. Seleccioná el repositorio `proyecto-club`.
5. Netlify va a detectar la configuración solo (ya está en `netlify.toml`).
   No cambies nada.
6. Antes de darle a *Deploy*, abrí **Add environment variables** y cargá
   estas cuatro:

| Nombre | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | El de tu `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | El de tu `.env.local` |
| `SUPABASE_SECRET_KEY` | El de tu `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | Lo completás en el paso 5 |

7. **Deploy site**. Tarda unos 2-3 minutos la primera vez.

### 4. Ponerle un nombre lindo

Netlify te asigna algo tipo `random-name-123456.netlify.app`.
Para cambiarlo: **Site configuration → Change site name** y poné algo como
`proyecto-club`. Te queda `proyecto-club.netlify.app`.

### 5. Cerrar el círculo con Supabase

Ahora que sabés la URL final, faltan dos cosas:

**a) En Netlify**, agregá o corregí la variable:
```
NEXT_PUBLIC_SITE_URL = https://proyecto-club.netlify.app
```
(sin barra al final)

**b) En Supabase**, andá a **Authentication → URL Configuration** y poné:

- **Site URL**: `https://proyecto-club.netlify.app`
- **Redirect URLs**: agregá estas dos líneas:
  ```
  https://proyecto-club.netlify.app/auth/callback
  http://localhost:3000/auth/callback
  ```

La segunda es para que puedas seguir probando en tu computadora.

**Sin este paso los emails de confirmación no funcionan**, porque el enlace
apunta a `localhost` y a tus amigos no les va a abrir nada.

### 6. Redesplegar para aplicar las variables

En Netlify: **Deploys → Trigger deploy → Deploy site**.

Listo. Pasale el link a tus amigos.

---

## Parte 2 — Actualizarlo (un minuto, cada vez)

Cuando te pase un zip nuevo:

1. Descomprimilo.
2. Copiá los archivos **encima** de tu carpeta local, reemplazando.
   ⚠️ **No borres la carpeta entera** o perdés el `.env.local`.
3. En la terminal, dentro de la carpeta:

```bash
git add .
git commit -m "Modo penales PvP"
git push
```

Netlify lo detecta solo y en ~2 minutos está online. Podés seguir el
progreso en la pestaña **Deploys**.

### Si el cambio incluye una migración SQL

Ejecutala en **Supabase → SQL Editor** *antes* o *justo después* del push.
El orden importa poco, pero conviene que la base esté lista cuando el
código nuevo entre en producción.

### Si algo sale mal

Netlify guarda todos los despliegues anteriores. En **Deploys**, entrá al
último que funcionaba y tocá **Publish deploy**. Vuelve atrás al instante,
sin tocar código.

---

## Parte 3 — Cosas que conviene saber

### Los límites gratuitos te sobran

Para 20-30 amigos jugando:

| Servicio | Límite gratis | Lo que vas a usar |
|---|---|---|
| Netlify | 100 GB/mes de tráfico | Muy por debajo |
| Netlify | 300 min/mes de compilación | ~3 min por actualización |
| Supabase | 500 MB de base | El catálogo pesa ~50 MB |
| Supabase | 50.000 usuarios activos | 30 |

**El único límite real**: Supabase **pausa** los proyectos gratuitos si no
reciben actividad por 7 días. Mientras tus amigos jueguen, no pasa nada. Si
se frena el grupo una semana, entrás al panel de Supabase y lo reactivás con
un clic.

### El email de confirmación

Por defecto Supabase manda los mails desde su servidor compartido, que tiene
un límite bajo y a veces cae en spam. Si tus amigos no reciben el mail de
confirmación:

- Revisá **Authentication → Emails** en Supabase.
- Para algo más confiable, conectá tu propio SMTP (Resend tiene plan gratis
  de 3.000 mails/mes, que para 30 personas es muchísimo).

### Probar antes de publicar

Si querés ver un cambio antes de que lo vean tus amigos:

```bash
npm install     # solo la primera vez, o si cambian las dependencias
npm run dev
```

Y abrís `http://localhost:3000`. Eso usa tu `.env.local` y la misma base de
datos, así que ojo: lo que hagas ahí es real.

### Guardá tus claves

Anotá en algún lado las tres variables del `.env.local`. Si perdés la
carpeta, las recuperás igual desde Supabase → Project Settings → API Keys,
pero mejor tenerlas a mano.

---

## Resumen para pegar en la heladera

```bash
# Actualizar el juego
git add .
git commit -m "qué cambié"
git push
```

Eso es todo. Netlify hace el resto.

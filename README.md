# 🍺 Rondas — el diario de copas de la peña

Red social privada tipo Letterboxd para apuntar cada cerveza, copa, vino, cóctel o chupito: foto, precio, nota del 1 al 10, sitio y reseña. Cada perfil tiene su diario, estadísticas, histograma de notas y favoritas. También hay un ranking de la peña con los bares, las mejor valoradas y los récords.

- **Coste: 0 €.** Supabase (plan gratuito) para cuentas, base de datos y fotos, y un hosting estático gratuito para la web.
- **Funciona en cualquier móvil** como web, y se puede **instalar como app** (icono en la pantalla de inicio, pantalla completa).
- **Sin compilar nada:** es HTML + CSS + JavaScript puro.

---

## 0. Probarla ahora mismo (modo demo)

Con `js/config.js` vacío, la app arranca en **modo demo** con datos de ejemplo guardados solo en tu navegador:

```bash
cd rondas
python3 -m http.server 8000      # o: npx serve
# abre http://localhost:8000 y pulsa "Entrar como invitado"
```

---

## 1. Crear el backend en Supabase (unos 10 min)

1. Entra en <https://supabase.com>, crea una cuenta y luego **New project**. Elige la región más cercana (Europa, p. ej. *West EU*) y guarda la contraseña de la base de datos.
2. Abre **SQL Editor → New query** y pega el contenido de `supabase/schema.sql`.
   - ⚠️ **Antes de ejecutarlo**, busca `CAMBIA-ESTE-CODIGO` y pon vuestro **código de la peña** (por ejemplo `pena-murcia-2026`). Sin ese código nadie se puede registrar.
   - Pulsa **Run**. Debería terminar sin errores.
3. **Authentication → Sign In / Providers → Email**: desactiva **Confirm email**. Así nadie tiene que confirmar el correo para entrar.
   *(Si prefieres dejarla activada también funciona, pero el correo gratuito de Supabase tiene un límite de envíos muy bajo.)*
4. **Project Settings → API** (o el botón **Connect**): copia la **Project URL** y la clave **anon / publishable**.
5. Pégalas en `js/config.js`:

```js
export const CONFIG = {
  APP_NAME: 'Rondas',
  TAGLINE: 'El diario de copas de la peña',
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',   // la anon/publishable, NUNCA la service_role
};
```

> La clave anon es pública por diseño: lo que protege los datos son las políticas RLS del `schema.sql`. Solo los usuarios registrados ven el contenido y cada uno solo puede editar o borrar lo suyo.

---

## 2. Publicarla gratis

Es una web estática: cualquier hosting estático gratuito sirve. Dos opciones sencillas:

**Opción A · GitHub Pages**
1. Crea un repo (puede ser privado si tu plan lo permite; si no, público, porque no contiene secretos) y sube la carpeta `rondas` tal cual.
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. En un minuto la tienes en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

**Opción B · Cloudflare Pages**
1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Upload assets**.
2. Arrastra la carpeta `rondas`. Te dará una URL `https://rondas-xxx.pages.dev`.

Después, en Supabase: **Authentication → URL Configuration → Site URL** = tu URL pública. Esto hace falta para que funcione el enlace de "¿Has olvidado la contraseña?".

---

## 3. Dar de alta a la peña

1. Pasa la URL y el **código de la peña** por el grupo.
2. Cada uno: **Crear cuenta**, con nombre, usuario, email, contraseña y código.
3. Instalar en el móvil:
   - **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*.
   - **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
4. Cuando estéis los 13, ciérralo del todo en **Authentication → Sign In / Providers → Allow new users to sign up = OFF**.

---

## Qué incluye

| Pantalla | Qué hay |
|---|---|
| **Inicio** | Feed con las rondas de todos: foto, nota, tipo, sitio, precio y reseña. 🍻 Brindis (doble toque en la foto) y comentarios. |
| **＋ Nueva ronda** | Foto (cámara o galería, se comprime en el móvil), tipo, nombre con autocompletado, nota 1–10 con un toque, precio por unidad con la última referencia, cantidad (p. ej. 4 cañas en una entrada), sitio, reseña y fecha. |
| **Perfil** | Total, cervezas, copas, dinero gastado; reparto por tipo; histograma de notas; favoritas; **Diario** por meses y cuadrícula de **Fotos**. Filtros: siempre / este año / este mes / 7 días. |
| **Ranking** | Cifras de la peña, la tabla (por total, cervezas, copas, gasto o nota media), mejor valoradas, ranking de bares con precio medio de caña y copa, y récords (la más cara, la caña más barata). |
| **Peña** | Los miembros con sus contadores y su última ronda. |
| **Ajustes** | Foto de perfil, nombre, bio, instalar la app y cerrar sesión. |

## Límites del plan gratuito (a tener en cuenta)

- 500 MB de base de datos y 1 GB de fotos. Cada foto se sube comprimida (~150–250 KB más una miniatura), así que caben miles de fotos.
- Si **nadie usa la app en 7 días**, Supabase **pausa** el proyecto. No se pierde nada: entra en el panel de Supabase y pulsa **Restore**.

## Personalizar

- Nombre y eslogan: `js/config.js`.
- Tipos de bebida, emojis y colores: `TYPES` en `js/util.js`. Si añades un tipo, añádelo también al `check (type in (...))` de la tabla `drinks`.
- Colores y tipografías: variables al principio de `css/app.css`.
- Si cambias archivos después de publicar, sube la versión de `CACHE` en `sw.js` (`rondas-v2`…) para que los móviles cojan lo nuevo.

## Estructura

```
index.html            · entrada
manifest.webmanifest  · datos para instalar como app
sw.js                 · service worker (instalable / abre sin conexión)
css/app.css           · estilos
js/config.js          · ⚙️ tus claves de Supabase
js/app.js             · interfaz y navegación
js/api-supabase.js    · backend real
js/api-demo.js        · backend de demo (localStorage)
js/stats.js           · estadísticas y rankings
js/util.js            · utilidades (tipos, formatos, compresión de fotos)
supabase/schema.sql   · tablas, seguridad, fotos y código de invitación
icons/                · iconos de la app
```

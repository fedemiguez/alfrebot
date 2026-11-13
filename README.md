# alfrebot

Armá tu tienda por WhatsApp o en la web. Dominio: [alfrebot.com.ar](https://alfrebot.com.ar). **Tía Norma** (`/ceramicas-de-norma`) es la tienda demo.

## Stack

- Next.js 16 (Cache Components) + Tailwind 4
- Drizzle + Neon Postgres (con fallback en memoria si no hay `DATABASE_URL`)
- Motor de bot + adaptadores `simulator` / `meta`
- Vercel Blob para fotos (placeholder local si no hay token)
- AI SDK / Gateway opcional (Gemini Flash) para texto libre y **audios** (STT)

## Desarrollo

```bash
cp .env.example .env.local
npm install
npm run dev
```

Dos caminos para la dueña (misma tabla `stores`):

1. **WhatsApp:** [http://localhost:3000/registro](http://localhost:3000/registro) → celular → Abrir WhatsApp.
2. **Web (Google / email):** [http://localhost:3000/sign-up](http://localhost:3000/sign-up) → `/asistente` con el mismo motor. Pedidos del catálogo siguen por WhatsApp (`contact_phone`).

> **Migración:** la ruta canónica del chat web es `/asistente`. `/probar` responde **308** hacia `/asistente` (compatibilidad de links viejos).
>
> **Chat v2:** con `ALFREBOT_CHAT_V2=1` (default), `/asistente` abre el chat WhatsApp-like. Para volver al shell clásico: `ALFREBOT_CHAT_V2=0` o abrí `/asistente-v1`. Preview de UI sin login: `/asistente-v2-preview`.

La key de dueña es `stores.channel_identity` (`+549…` o `clerk:{userId}`). El WhatsApp de pedidos (`contact_phone`) **no** vincula cuentas: solo lo ven los compradores.

**Vincular web ↔ WhatsApp (gestión):** en `/asistente` → menú → **Vincular WhatsApp** (código de 6 dígitos, 30 min). Desde el celular: «ya tengo cuenta» + el código. El `from` de Meta prueba la posesión del número; queda la misma fila `stores` con `clerk_user_id`. Clerk autentica el camino web; no reemplaza Meta.

Clerk se provisiona desde Vercel Marketplace (`CLERK_*` en preview/production). En el **Dashboard de Clerk (Production)**: activá **Google** + **Email** como métodos de sign-up/sign-in, y usá keys `pk_live_` / `sk_live_` (sin banner de development).

## Scripts

- `npm run build` — build de producción
- `npm run db:generate` / `npm run db:push` — esquema Drizzle → Neon (requiere `DATABASE_URL`; hace falta tras agregar columnas de iconos PWA)
- Smokes: `npx tsx scripts/smoke-store-icon.ts` (y los demás `scripts/smoke-*.ts`)

## Pedidos en el catálogo

- Default: botón **Lo quiero** → `wa.me` al dueño con el producto (requiere número público / `showPhone`).
- Opcional: `checkoutMode: 'cart'` (bot en el alta o panel `/admin`) → carrito local y checkout por WhatsApp con el listado. **Sin pasarela de pago.**
- **Voz (comprador):** en `/{slug}` hay **Hablar** (Web Speech + `speechSynthesis`). Búsqueda determinística sobre el catálogo; “Lo quiero” abre el mismo `wa.me`. Sin LLM. Si el navegador no entiende, fallback cloud STT (**Groq primero**) en `POST /api/store/[slug]/transcribe` — no cambia el pipeline Gemini→Groq del bot de la dueña.

Smoke búsqueda/intención (sin micrófono ni API):

```bash
npx tsx scripts/smoke-store-voice.ts
```

### Migración schema

- `stores.channel_identity` — identidad de canal (antes `phone`): WA E.164 o `clerk:{userId}`
- `conversations.channel_identity` — misma key (antes `phone`)
- `stores.clerk_user_id` / `stores.owner_email` — alias / metadata del camino web
- `stores.checkout_mode` (`whatsapp` | `cart`, default `whatsapp`)
- `stores.contact_phone` — WhatsApp público para catálogo / Lo quiero
- `channel_link_intents` — códigos de un solo uso para vincular Clerk ↔ WhatsApp
- `stores.icon_192_url` / `icon_512_url` / `icon_apple_url` / `icon_svg_url` — iconos PWA (PNG/SVG en Blob)
- `stores.accent_color` — color de acento de la vitrina (`#rrggbb`, null = terracota de marca)
- `stores.business_kind` — rubro (`artesanal` | `comida` | `ropa`, null = layout default de fichas)
- `stores.welcome_message` — frase corta debajo del nombre (null = sin frase)
- `stores.theme` — tema de fondo (`claro` | `crema` | `oscuro`, null = look actual del sitio)

Con `DATABASE_URL` (después de pull/merge de columnas nuevas):

```bash
npm run db:push
```

Sin Neon, el fallback en memoria ya incluye los campos.

**Icono de la app (PWA):** en el menú del bot → **Icono de la tienda** (o «armar icono» / «generar icono»). Gemini Flash arma un SVG; se rasteriza a PNG 192/512/180 y se guarda en Blob. Si no hay AI o falla, compone un SVG a partir del pedido del usuario, de los productos o del nombre de la tienda (no monograma). También se puede subir una imagen propia. El manifest `/{slug}/manifest.webmanifest` y el catálogo usan esas URLs.

## Meta WhatsApp

Ver `.env.example`. Webhook: `GET/POST /api/whatsapp/meta`. Mientras `META_TEST_MODE=true`, el registro deriva números no verificados al chat web (`/asistente`).

## Stock y pausa (bot / chat web)

En el alta, o después desde el menú, la dueña elige el modo de la tienda:

| Modo | Qué hace |
| --- | --- |
| **Con números** | Cada producto tiene unidades (`quantity`). En 0 se muestra **Agotado**. |
| **Sin números** | Solo marcás Agotado o Disponible; reactivar = disponible. |

Comandos / menú (WhatsApp o simulador):

- `menú` → **Stock / pausa**
- Texto libre: `stock`, `listado`, `mis productos`, `pausar`, `agotado`, `cantidad`

### Ejemplo: sin números

```
Dueña: menú
Bot:    [Cargar producto] [Ver mi tienda] [Stock / pausa] [Ayuda]
Dueña: Stock / pausa
Bot:    Tu tienda solo marca Agotado o Disponible…
        [Ver listado] [Elegir producto] [Con números] …
Dueña: Elegir producto → Taza de café → Pausar (agotado)
Bot:    ¿Marcamos "Taza de café" como agotado?
Dueña: Sí, guardar
Bot:    Marqué "Taza de café" como agotado.
```

En la tienda el producto sigue visible con cartel **Agotado**. **Ocultar** la saca del catálogo (como el admin).

### Ejemplo: cantidades

```
Dueña: Stock / pausa → Elegir producto → Jarrón azul → Cambiar cantidad
Bot:    ¿Cuántas unidades de "Jarrón azul" quedan?
Dueña: 2
Bot:    ¿Dejamos "Jarrón azul" con 2 unidades?
Dueña: Sí, guardar
```

Si pone `0`, queda agotado. Siempre hay confirmación antes de guardar. Con botones/listas de Meta (o del simulador); si no hay botones, respondé con el número de la opción.

## Audios (WhatsApp / `/asistente`)

Podés **dictar** nombre, precio, descripción, cantidad o pedidos de stock. El bot transcribe con Gemini (AI Gateway o `GOOGLE_GENERATIVE_AI_API_KEY`) y, si Google falla o se satura, con **Groq Whisper** (`GROQ_API_KEY`). Sigue el mismo flujo de siempre, con un eco `Te escuché: «…»` antes de la respuesta.

- En `/asistente`: botón 🎤 → hablá → tocá de nuevo para enviar.
- En WhatsApp real: mandá un audio como siempre (ogg/opus).
- Sin API key: el bot responde *No pude escuchar el audio…* y sigue usable por texto/botones.
- El audio **no** reemplaza la foto al cargar un producto.

### Ejemplo: precio por audio

```
Bot:    ¿A cómo la vendés? Podés decir 15 mil o 15000 (texto o audio).
Dueña:  [audio] "quince mil"
Bot:    Te escuché: «quince mil»
Bot:    ¿Querés contar algo del producto? …
```

### Ejemplo: pausar / listado

```
Dueña:  [audio] "mostrame el stock"
Bot:    Te escuché: «mostrame el stock»
Bot:    Tus productos: …
```

Smoke local (mock STT, sin Gemini):

```bash
npx tsx --env-file=.env.local scripts/smoke-audio.ts
```

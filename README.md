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

Flujo dueña:

1. [http://localhost:3000/registro](http://localhost:3000/registro) — pedís el celular.
2. Elegís **Abrir WhatsApp** o **Seguir en la web** (`/probar?phone=…&code=…`).
3. Mismo motor de bot; con celular real la tienda **no** es demo y podés retomar por WhatsApp después.

## Scripts

- `npm run build` — build de producción
- `npm run db:generate` / `npm run db:push` — esquema Drizzle → Neon (requiere `DATABASE_URL`)

## Pedidos en el catálogo

- Default: botón **Lo quiero** → `wa.me` al dueño con el producto (requiere número público / `showPhone`).
- Opcional: `checkoutMode: 'cart'` (bot en el alta o panel `/admin`) → carrito local y checkout por WhatsApp con el listado. **Sin pasarela de pago.**

### Migración schema

- `stores.checkout_mode` (`whatsapp` | `cart`, default `whatsapp`)
- `stores.contact_phone` — WhatsApp público para catálogo / Lo quiero (si el `phone` del canal no es un móvil AR válido, p.ej. simulador)

Con `DATABASE_URL`:

```bash
npm run db:push
```

Sin Neon, el fallback en memoria ya incluye los campos.

## Meta WhatsApp

Ver `.env.example`. Webhook: `GET/POST /api/whatsapp/meta`. Mientras `META_TEST_MODE=true`, el registro deriva números no verificados al chat web (`/probar`).

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

## Audios (WhatsApp / `/probar`)

Podés **dictar** nombre, precio, descripción, cantidad o pedidos de stock. El bot transcribe con Gemini (AI Gateway o `GOOGLE_GENERATIVE_AI_API_KEY`) y, si Google falla o se satura, con **Groq Whisper** (`GROQ_API_KEY`). Sigue el mismo flujo de siempre, con un eco `Te escuché: «…»` antes de la respuesta.

- En `/probar`: botón 🎤 → hablá → tocá de nuevo para enviar.
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

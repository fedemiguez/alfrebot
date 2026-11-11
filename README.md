# alfrebot

Armá tu tienda por WhatsApp. Dominio: [alfrebot.com.ar](https://alfrebot.com.ar). **Tía Norma** (`/ceramicas-de-norma`) es la tienda demo.

## Stack

- Next.js 16 (Cache Components) + Tailwind 4
- Drizzle + Neon Postgres (con fallback en memoria si no hay `DATABASE_URL`)
- Motor de bot + adaptadores `simulator` / `meta`
- Vercel Blob para fotos (placeholder local si no hay token)
- AI SDK / Gateway opcional (Gemini Flash) para texto libre

## Desarrollo

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abrí [http://localhost:3000/probar](http://localhost:3000/probar) y tocá **Empezar**.

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

Ver `.env.example`. Webhook: `GET/POST /api/whatsapp/meta`. Mientras `META_TEST_MODE=true`, el registro deriva números no verificados a `/probar`.

## Stock y pausa (bot / `/probar`)

En el alta, o después desde el menú, la dueña elige el modo de la tienda:

| Modo | Qué hace |
| --- | --- |
| **Llevar cantidades** | Cada pieza tiene unidades (`quantity`). En 0 se muestra **Agotado**. |
| **Solo pausar** | Sin números: pausar = agotado en la tienda; reactivar = disponible. |

Comandos / menú (WhatsApp o simulador):

- `menú` → **Stock / pausa**
- Texto libre: `stock`, `listado`, `mis piezas`, `pausar`, `agotado`, `cantidad`

### Ejemplo: solo pausar

```
Dueña: menú
Bot:    [Cargar pieza] [Ver mi tienda] [Stock / pausa] [Ayuda]
Dueña: Stock / pausa
Bot:    Tu tienda solo pausa piezas…
        [Ver listado] [Elegir pieza] [Llevar cantidades] …
Dueña: Elegir pieza → Taza de café → Pausar (agotado)
Bot:    ¿Marcamos "Taza de café" como agotado?
Dueña: Sí, guardar
Bot:    Marqué "Taza de café" como agotado.
```

En la tienda la pieza sigue visible con cartel **Agotado**. **Ocultar** la saca del catálogo (como el admin).

### Ejemplo: cantidades

```
Dueña: Stock / pausa → Elegir pieza → Jarrón azul → Cambiar cantidad
Bot:    ¿Cuántas unidades de "Jarrón azul" quedan?
Dueña: 2
Bot:    ¿Dejamos "Jarrón azul" con 2 unidades?
Dueña: Sí, guardar
```

Si pone `0`, queda agotado. Siempre hay confirmación antes de guardar. Con botones/listas de Meta (o del simulador); si no hay botones, respondé con el número de la opción.

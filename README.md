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

### Migración schema (`checkout_mode`)

Se agregó `stores.checkout_mode` (`whatsapp` | `cart`, default `whatsapp`). Con `DATABASE_URL`:

```bash
npm run db:push
```

Sin Neon, el fallback en memoria ya incluye el campo.

## Meta WhatsApp

Ver `.env.example`. Webhook: `GET/POST /api/whatsapp/meta`. Mientras `META_TEST_MODE=true`, el registro deriva números no verificados a `/probar`.

/**
 * One-off: vacía tiendas y datos de bot en Neon para rehacer altas limpias.
 * No toca el schema. No imprime DATABASE_URL ni filas.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(url);

async function counts() {
  const [stores] = await sql`SELECT COUNT(*)::int AS n FROM stores`;
  const [products] = await sql`SELECT COUNT(*)::int AS n FROM products`;
  const [conversations] = await sql`SELECT COUNT(*)::int AS n FROM conversations`;
  const [signup_intents] = await sql`SELECT COUNT(*)::int AS n FROM signup_intents`;
  const [processed_messages] =
    await sql`SELECT COUNT(*)::int AS n FROM processed_messages`;
  return {
    stores: stores?.n ?? 0,
    products: products?.n ?? 0,
    conversations: conversations?.n ?? 0,
    signup_intents: signup_intents?.n ?? 0,
    processed_messages: processed_messages?.n ?? 0,
  };
}

const before = await counts();
console.log(
  `[clean] before stores=${before.stores} products=${before.products} conversations=${before.conversations}`,
);

// Orden por FK: products → stores. El resto es independiente.
await sql`TRUNCATE TABLE products, stores, conversations, signup_intents, processed_messages RESTART IDENTITY CASCADE`;

const after = await counts();

if (
  after.stores !== 0 ||
  after.products !== 0 ||
  after.conversations !== 0 ||
  after.signup_intents !== 0 ||
  after.processed_messages !== 0
) {
  console.error("[fail] tables not empty after truncate", after);
  process.exit(1);
}

console.log("[ok] stores cleaned");
console.log(
  `[ok] removed stores=${before.stores} products=${before.products} conversations=${before.conversations}`,
);

// Reseed tienda demo (Cerámicas de Norma) para que /ceramicas-de-norma no 404.
const demoStoreId = "00000000-0000-4000-8000-000000000001";
await sql`
  INSERT INTO stores (
    id, channel_identity, contact_phone, owner_name, name, slug,
    show_phone, checkout_mode, tracks_quantity, is_demo, status
  ) VALUES (
    ${demoStoreId}::uuid,
    ${"+5491100000001"},
    ${"+5491100000001"},
    ${"Norma"},
    ${"Cerámicas de Norma"},
    ${"ceramicas-de-norma"},
    true,
    ${"whatsapp"},
    false,
    false,
    ${"active"}
  )
`;
await sql`
  INSERT INTO products (id, store_id, title, description, price_cents, image_url, in_stock, hidden, position)
  VALUES
    ('00000000-0000-4000-8000-000000000011'::uuid, ${demoStoreId}::uuid, 'Jarrón azul', 'Esmalte azul profundo, hecho a mano.', 1500000, '/demo/jarron-azul.svg', true, false, 0),
    ('00000000-0000-4000-8000-000000000012'::uuid, ${demoStoreId}::uuid, 'Taza de café', 'Ideal para el mate o el café de la mañana.', 650000, '/demo/taza.svg', true, false, 1),
    ('00000000-0000-4000-8000-000000000013'::uuid, ${demoStoreId}::uuid, 'Plato grande', 'Para servir o decorar la mesa.', 980000, '/demo/plato.svg', true, false, 2)
`;
console.log("[ok] demo store reseeded");
console.log("[ok] Changes applied");

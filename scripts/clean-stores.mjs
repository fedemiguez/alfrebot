/**
 * One-off: vacía tiendas y datos de bot en Neon para rehacer altas limpias.
 * No toca el schema. No imprime DATABASE_URL ni filas.
 * No reseedea demo (arranque fresco v2).
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
  const [channel_link_intents] =
    await sql`SELECT COUNT(*)::int AS n FROM channel_link_intents`;
  const [processed_messages] =
    await sql`SELECT COUNT(*)::int AS n FROM processed_messages`;
  return {
    stores: stores?.n ?? 0,
    products: products?.n ?? 0,
    conversations: conversations?.n ?? 0,
    signup_intents: signup_intents?.n ?? 0,
    channel_link_intents: channel_link_intents?.n ?? 0,
    processed_messages: processed_messages?.n ?? 0,
  };
}

const before = await counts();
console.log(
  `[clean] before stores=${before.stores} products=${before.products} conversations=${before.conversations} signup_intents=${before.signup_intents} channel_link_intents=${before.channel_link_intents} processed_messages=${before.processed_messages}`,
);

const slugs = await sql`SELECT slug FROM stores WHERE slug IS NOT NULL ORDER BY slug`;
console.log(
  `[clean] before slugs=${slugs.map((r) => r.slug).join(",") || "(none)"}`,
);

await sql`TRUNCATE TABLE products, stores, conversations, signup_intents, channel_link_intents, processed_messages RESTART IDENTITY CASCADE`;

const after = await counts();

if (
  after.stores !== 0 ||
  after.products !== 0 ||
  after.conversations !== 0 ||
  after.signup_intents !== 0 ||
  after.channel_link_intents !== 0 ||
  after.processed_messages !== 0
) {
  console.error("[fail] tables not empty after truncate", after);
  process.exit(1);
}

console.log("[ok] stores cleaned (no demo reseed)");
console.log(
  `[ok] removed stores=${before.stores} products=${before.products} conversations=${before.conversations} signup_intents=${before.signup_intents} channel_link_intents=${before.channel_link_intents} processed_messages=${before.processed_messages}`,
);
console.log("[ok] Changes applied");

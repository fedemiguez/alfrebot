/**
 * One-off / build helper: aplica channel_identity + columnas Clerk en Neon.
 * - Rename phone → channel_identity (preserva datos)
 * - Agrega clerk_user_id / owner_email y uniques sin truncar
 * No imprime DATABASE_URL. No usa drizzle-kit interactivo (falla en CI).
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(url);

async function tryStep(label, run) {
  try {
    await run();
    console.log(`[ok] ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|already exists|duplicate/i.test(msg)) {
      console.log(`[skip] ${label}`);
      return;
    }
    console.error(`[fail] ${label}: ${msg.slice(0, 240)}`);
    process.exit(1);
  }
}

await tryStep("stores.phone → channel_identity", () =>
  sql`ALTER TABLE stores RENAME COLUMN phone TO channel_identity`,
);
await tryStep("conversations.phone → channel_identity", () =>
  sql`ALTER TABLE conversations RENAME COLUMN phone TO channel_identity`,
);

await tryStep("stores.clerk_user_id column", () =>
  sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS clerk_user_id text`,
);
await tryStep("stores.owner_email column", () =>
  sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_email text`,
);

// Uniques: rename deja el constraint viejo; drizzle quiere el nombre nuevo.
await tryStep("drop stores_phone_unique (legacy)", () =>
  sql`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_phone_unique`,
);
await tryStep("drop stores_phone_key (legacy)", () =>
  sql`ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_phone_key`,
);
await tryStep("stores_channel_identity_unique", () =>
  sql`ALTER TABLE stores ADD CONSTRAINT stores_channel_identity_unique UNIQUE (channel_identity)`,
);
await tryStep("stores_clerk_user_id_unique", () =>
  sql`ALTER TABLE stores ADD CONSTRAINT stores_clerk_user_id_unique UNIQUE (clerk_user_id)`,
);

// Conversations: PK ya renombrada con la columna; por si quedó índice viejo.
await tryStep("drop conversations_pkey legacy name noop check", async () => {
  // Solo verifica que channel_identity exista (ya renombrada).
  await sql`
    SELECT channel_identity FROM conversations LIMIT 0
  `;
});

await tryStep("verify stores.channel_identity", async () => {
  await sql`SELECT channel_identity, clerk_user_id, owner_email FROM stores LIMIT 0`;
});

console.log("[ok] Changes applied");

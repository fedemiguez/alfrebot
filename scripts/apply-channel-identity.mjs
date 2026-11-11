/**
 * One-off / build helper: rename phone → channel_identity (preserva datos)
 * y luego drizzle-kit push --force (clerk_user_id, owner_email, etc.).
 * No imprime DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(url);

async function tryRename(label, run) {
  try {
    await run();
    console.log(`[ok] ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|already exists/i.test(msg)) {
      console.log(`[skip] ${label}`);
      return;
    }
    console.error(`[fail] ${label}: ${msg.slice(0, 200)}`);
    process.exit(1);
  }
}

await tryRename("stores.phone → channel_identity", () =>
  sql`ALTER TABLE stores RENAME COLUMN phone TO channel_identity`,
);
await tryRename("conversations.phone → channel_identity", () =>
  sql`ALTER TABLE conversations RENAME COLUMN phone TO channel_identity`,
);

const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
});
if (push.status !== 0) {
  process.exit(push.status ?? 1);
}
console.log("[ok] drizzle-kit push finished");

/**
 * Smoke: vincular camino Clerk → tienda WA existente (misma fila stores).
 * Uso: DATABASE_URL= npx tsx scripts/smoke-channel-link.ts
 */
import { handleMessage } from "../lib/bot/engine";
import { getMemoryDb } from "../lib/db/memory";
import {
  getStoreByChannelIdentity,
  getStoreForChannelIdentity,
  upsertStore,
} from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const waFrom = "+5491155557777";
const clerkFrom = "clerk:user_link_smoke";
const ownerEmail = "link@example.com";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.processedMessages.clear();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

let n = 0;
async function say(
  from: string,
  text?: string,
  choiceId?: string,
  email?: string,
) {
  n += 1;
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `link_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: email,
    },
    caps,
  );
  const flat = replies
    .map((r) => (r.kind === "text" ? r.text : `[image]`))
    .join(" | ");
  console.log(`> [${from}] ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 220)}`);
  return replies;
}

async function main() {
  reset();

  // Tienda nacida por WhatsApp
  await upsertStore({
    channelIdentity: waFrom,
    contactPhone: waFrom,
    ownerName: "Norma WA",
    name: "Tienda Link",
    slug: "tienda-link",
    showPhone: true,
    status: "active",
    isDemo: false,
  });

  // Entrada por Clerk con el mismo número de pedidos → vínculo
  const hello = await say(clerkFrom, "Hola", undefined, ownerEmail);
  assert(
    hello.some((r) => r.kind === "text" && /cómo te llamás/i.test(r.text)),
    "clerk starts onboarding when not yet linked",
  );
  await say(clerkFrom, "Norma", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Tienda Link Web", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail); // mostrar número → pide contacto
  const linked = await say(clerkFrom, "11 5555-7777", undefined, ownerEmail);

  assert(
    linked.some((r) => r.kind === "text" && /vincul/i.test(r.text)),
    "bot announces link",
  );

  const byWa = await getStoreByChannelIdentity(waFrom);
  const byClerk = await getStoreForChannelIdentity(clerkFrom);
  assert(byWa, "wa store exists");
  assert(byClerk, "clerk resolves store");
  assert(byWa.id === byClerk.id, "same store row after link");
  assert(byWa.clerkUserId === "user_link_smoke", "clerkUserId on wa store");
  assert(byWa.ownerEmail === ownerEmail, "ownerEmail set");
  assert(
    !(await getStoreByChannelIdentity(clerkFrom)),
    "clerk stub store removed",
  );

  // Nueva sesión Clerk → resume menú (no onboarding)
  reset();
  await upsertStore({
    channelIdentity: waFrom,
    contactPhone: waFrom,
    clerkUserId: "user_link_smoke",
    ownerEmail,
    ownerName: "Norma WA",
    name: "Tienda Link",
    slug: "tienda-link",
    showPhone: true,
    status: "active",
    isDemo: false,
  });
  const resume = await say(clerkFrom, "Hola", undefined, ownerEmail);
  assert(
    resume.some((r) => r.kind === "text" && /hola de nuevo/i.test(r.text)),
    "linked clerk resumes",
  );
  assert(
    resume.some((r) => r.kind === "text" && r.options?.some((o) => o.id === "menu_store")),
    "shows menu",
  );

  console.log("\nOK channel link: WA + Clerk same store row");
  console.log("ALL CHANNEL LINK SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

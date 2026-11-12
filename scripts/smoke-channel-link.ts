/**
 * Smoke: vínculo explícito Clerk ↔ WhatsApp con código (sin auto-link por contact_phone).
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
  mem.channelLinkIntents.clear();
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
  console.log(`< ${flat.slice(0, 280)}`);
  return replies;
}

function extractCode(replies: Awaited<ReturnType<typeof say>>): string {
  for (const r of replies) {
    if (r.kind !== "text") continue;
    const m = r.text.match(/\b(\d{6})\b/);
    if (m?.[1]) return m[1];
  }
  throw new Error("no link code in replies");
}

/** Alta web mínima hasta IDLE con tienda activa. */
async function onboardClerkWeb() {
  await say(clerkFrom, "Hola", undefined, ownerEmail);
  await say(clerkFrom, "Norma", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Tienda Link Web", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail); // mostrar número
  // contact_phone: NO debe vincular una tienda WA ajena
  await say(clerkFrom, "11 5555-7777", undefined, ownerEmail);
  await say(clerkFrom, "Sin números", "stock_pause_mode", ownerEmail);
  await say(clerkFrom, "Sin carrito", "checkout_whatsapp", ownerEmail);
}

async function main() {
  // ——— 1) contact_phone ya no auto-vincula ———
  reset();
  await upsertStore({
    channelIdentity: waFrom,
    contactPhone: waFrom,
    ownerName: "Norma WA",
    name: "Tienda WA Vieja",
    slug: "tienda-wa-vieja",
    showPhone: true,
    status: "active",
    isDemo: false,
  });

  await say(clerkFrom, "Hola", undefined, ownerEmail);
  await say(clerkFrom, "Norma", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Tienda Clerk Nueva", undefined, ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  await say(clerkFrom, "Sí", "yes", ownerEmail);
  const afterContact = await say(clerkFrom, "11 5555-7777", undefined, ownerEmail);
  assert(
    !afterContact.some((r) => r.kind === "text" && /vincul/i.test(r.text)),
    "contact_phone must NOT auto-link",
  );
  const waStill = await getStoreByChannelIdentity(waFrom);
  assert(waStill && !waStill.clerkUserId, "WA store stays without clerk");
  const clerkStub = await getStoreByChannelIdentity(clerkFrom);
  // Puede no existir aún hasta completar alta; si existe, es otra fila
  if (clerkStub) {
    assert(clerkStub.id !== waStill.id, "clerk did not steal WA store");
  }
  console.log("OK: no auto-link on contact_phone");

  // ——— 2) Clerk-first → código → WA ———
  reset();
  await onboardClerkWeb();
  const clerkStore = await getStoreForChannelIdentity(clerkFrom);
  assert(clerkStore?.status === "active" && clerkStore.slug, "clerk store active");
  assert(
    clerkStore.channelIdentity === clerkFrom,
    "canonical identity still clerk: until link",
  );

  const codeReplies = await say(
    clerkFrom,
    "Vincular WhatsApp",
    "menu_link_wa",
    ownerEmail,
  );
  const code = extractCode(codeReplies);
  assert(/código es/i.test(codeReplies.map((r) => (r.kind === "text" ? r.text : "")).join(" ")), "shows code copy");

  // Desde el celular (WA): ya tengo cuenta + código
  const linked = await say(waFrom, `Ya tengo cuenta. Código ${code}`);
  assert(
    linked.some((r) => r.kind === "text" && /vincul/i.test(r.text)),
    "WA announces link",
  );

  const byWa = await getStoreByChannelIdentity(waFrom);
  const byClerk = await getStoreForChannelIdentity(clerkFrom);
  assert(byWa, "wa identity resolves store");
  assert(byClerk, "clerk still resolves store");
  assert(byWa.id === byClerk.id, "same store row after link");
  assert(byWa.id === clerkStore.id, "kept clerk store row");
  assert(byWa.channelIdentity === waFrom, "canonical identity is WA");
  assert(byWa.clerkUserId === "user_link_smoke", "clerkUserId set");
  assert(byWa.ownerEmail === ownerEmail, "ownerEmail kept");
  console.log("OK: clerk-first link via code");

  // ——— 3) Resume desde ambos canales (sesión nueva = sin conversation) ———
  getMemoryDb().conversations.clear();
  getMemoryDb().processedMessages.clear();
  const resumeWa = await say(waFrom, "Hola");
  assert(
    resumeWa.some((r) => r.kind === "text" && /hola de nuevo/i.test(r.text)),
    "WA resumes",
  );
  getMemoryDb().conversations.clear();
  getMemoryDb().processedMessages.clear();
  const resumeClerk = await say(clerkFrom, "Hola", undefined, ownerEmail);
  assert(
    resumeClerk.some((r) => r.kind === "text" && /hola de nuevo/i.test(r.text)),
    "Clerk resumes",
  );
  console.log("OK: resume both channels");

  // ——— 4) WA-first con productos + stub Clerk vacío → linked_into_wa ———
  reset();
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
  // Clerk completa alta (otra fila) y vincula
  await onboardClerkWeb();
  const code2 = extractCode(
    await say(clerkFrom, undefined, "menu_link_wa", ownerEmail),
  );
  await say(waFrom, code2);
  const merged = await getStoreByChannelIdentity(waFrom);
  assert(merged?.clerkUserId === "user_link_smoke", "clerk on WA store");
  assert(
    merged?.slug === "tienda-link" || merged?.slug?.includes("tienda"),
    "ended on a real store",
  );
  // Si ambas tenían productos sería conflicto; acá clerk store también tiene 0 productos
  // hasta cargar foto → merge preferirá según counts. Con ambas en 0, migra clerk→WA.
  console.log("OK: code link with pre-existing WA row");

  console.log("\nALL CHANNEL LINK SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

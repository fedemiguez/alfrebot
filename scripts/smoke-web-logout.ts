/**
 * Smoke: logout desde chat web (simulator + Clerk).
 * WhatsApp/Meta no debe entrar al flujo.
 * Uso: DATABASE_URL= npx tsx scripts/smoke-web-logout.ts
 */
import { handleMessage } from "../lib/bot/engine";
import { isLogoutIntent } from "../lib/bot/nlu";
import { getMemoryDb } from "../lib/db/memory";
import { getConversation } from "../lib/db/repos";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const clerkFrom = "clerk:user_smoke_web_logout";
const waFrom = "+5491155559999";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.processedMessages.clear();
}

let n = 0;
async function say(
  from: string,
  channel: "simulator" | "meta",
  text?: string,
  choiceId?: string,
) {
  n += 1;
  const replies = await handleMessage(
    {
      channel,
      from,
      messageId: `logout_${n}_${Date.now()}`,
      text,
      choiceId,
      ownerEmail: "dueño@example.com",
    },
    caps,
  );
  const flat = replies
    .map((r) =>
      r.kind === "text" || r.kind === "sign_out"
        ? `[${r.kind}] ${r.text}`
        : `[image] ${r.caption || ""}`,
    )
    .join(" | ");
  console.log(`> [${channel}] ${choiceId || text}`);
  console.log(`< ${flat.slice(0, 320)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(isLogoutIntent("salir"), "salir");
  assert(isLogoutIntent("LOGOUT"), "LOGOUT");
  assert(isLogoutIntent("  Cerrar sesión "), "cerrar sesión");
  assert(!isLogoutIntent("cancelar"), "cancelar no es logout");
  assert(!isLogoutIntent("salimos mañana"), "frase larga no");

  reset();
  // Warm conversation
  await say(clerkFrom, "simulator", "Hola");
  const ask = await say(clerkFrom, "simulator", "salir");
  assert(
    ask.some(
      (r) =>
        r.kind === "text" &&
        /cerrar la sesi[oó]n/i.test(r.text) &&
        r.options?.some((o) => o.id === "yes" && /cerrar/i.test(o.label)),
    ),
    "pide confirmación con Sí, cerrar sesión",
  );
  assert(
    !ask.some((r) => r.options?.some((o) => o.label === "Cancelar")),
    "sin Cancelar en confirmación de logout",
  );
  const convAsk = await getConversation(clerkFrom);
  assert(convAsk?.state === "ASK_LOGOUT", "state ASK_LOGOUT");

  const denied = await say(clerkFrom, "simulator", "No", "no");
  assert(
    denied.some(
      (r) => r.kind === "text" && /no cerr[eé] la sesi[oó]n/i.test(r.text),
    ),
    "negativa mantiene sesión",
  );
  assert(
    !denied.some((r) => r.kind === "sign_out"),
    "negativa no dispara sign_out",
  );

  await say(clerkFrom, "simulator", "logout");
  const confirmed = await say(clerkFrom, "simulator", "Sí", "yes");
  assert(
    confirmed.some(
      (r) =>
        r.kind === "sign_out" && /cerr[eé] tu sesi[oó]n/i.test(r.text),
    ),
    "afirmativa → sign_out",
  );

  // WhatsApp: "salir" sigue cancelando; "logout" no abre ASK_LOGOUT
  reset();
  await say(waFrom, "meta", "Hola");
  const waSalir = await say(waFrom, "meta", "salir");
  assert(
    waSalir.some((r) => r.kind === "text" && /cancelamos/i.test(r.text)),
    "WA salir = cancel",
  );
  assert(
    !waSalir.some((r) => r.kind === "sign_out"),
    "WA salir sin sign_out",
  );
  const waLogout = await say(waFrom, "meta", "logout");
  const waConv = await getConversation(waFrom);
  assert(waConv?.state !== "ASK_LOGOUT", "WA logout no entra ASK_LOGOUT");
  assert(
    !waLogout.some((r) => r.kind === "sign_out"),
    "WA logout sin sign_out",
  );
  assert(
    !waLogout.some(
      (r) => r.kind === "text" && /cerrar la sesi[oó]n de este chat/i.test(r.text),
    ),
    "WA logout sin UX de cerrar sesión",
  );

  // Phone simulator (sin clerk:): salir sigue cancelando
  reset();
  const phone = "+5491166667777";
  await say(phone, "simulator", "Hola");
  const phoneSalir = await say(phone, "simulator", "salir");
  assert(
    phoneSalir.some((r) => r.kind === "text" && /cancelamos/i.test(r.text)),
    "simulator sin Clerk: salir = cancel",
  );
  assert(!phoneSalir.some((r) => r.kind === "sign_out"), "sin sign_out");

  console.log("OK: smoke-web-logout");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

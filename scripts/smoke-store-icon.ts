/**
 * Smoke: icono PWA — menú / NLU → hub → monograma SVG→PNG → preview;
 * subida manual de imagen → preview PNG. Sin LLM.
 */
import { handleMessage } from "../lib/bot/engine";
import type { OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import { getStoreForChannelIdentity } from "../lib/db/repos";
import {
  buildAndUploadStoreIconsFromImage,
  monogramSvg,
  storeInitials,
  svgToPng,
  withTimeout,
} from "../lib/store-icon";

const caps = { buttons: true, maxButtons: 3, maxListRows: 10 };
const from = "+01155558888";

function reset() {
  const mem = getMemoryDb();
  mem.stores.clear();
  mem.products.clear();
  mem.conversations.clear();
  mem.signupIntents.clear();
  mem.channelLinkIntents?.clear();
  mem.processedMessages.clear();
}

let n = 0;
async function say(
  text?: string,
  choiceId?: string,
  media?: {
    kind: "image";
    mime: string;
    fetch: () => Promise<Blob>;
  },
) {
  n += 1;
  const replies = await handleMessage(
    {
      channel: "simulator",
      from,
      messageId: `smoke_icon_${n}_${Date.now()}`,
      text,
      choiceId,
      media,
    },
    caps,
  );
  const flat = replies
    .map((r) =>
      r.kind === "text"
        ? r.text
        : `[image] ${(r.caption || "").slice(0, 80)} url=${r.url.slice(0, 48)}…`,
    )
    .join(" | ");
  console.log(`> ${choiceId || text || (media ? "[image]" : "")}`);
  console.log(`< ${flat.slice(0, 360)}`);
  return replies;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hasImage(replies: OutboundMessage[]): boolean {
  return replies.some((r) => r.kind === "image" && Boolean(r.url));
}

function menuHasIcon(replies: OutboundMessage[]): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some(
        (o) => o.id === "menu_icon" && o.label === "Icono de la tienda",
      ),
  );
}

function hasOption(replies: OutboundMessage[], id: string): boolean {
  return replies.some(
    (r) => r.kind === "text" && r.options?.some((o) => o.id === id),
  );
}

async function onboard() {
  await say("Empezar");
  await say("Norma");
  await say("Sí", "yes");
  await say("Cerámicas Smoke Icon");
  await say("Sí", "yes");
  await say("Sí", "yes");
  await say("11 5555-8888");
  await say(undefined, "stock_pause_mode");
  await say(undefined, "checkout_whatsapp");
}

async function main() {
  // Unit: monograma + raster
  const initials = storeInitials("Cerámicas de Norma");
  assert(initials === "CN", `initials expected CN got ${initials}`);
  const svg = monogramSvg("Cerámicas de Norma");
  assert(/<svg[\s>]/i.test(svg), "monogram svg");
  const png = await svgToPng(svg, 192);
  assert(png.length > 100, "png bytes");
  assert(png[0] === 0x89 && png[1] === 0x50, "png magic");
  console.log("OK: monogram → png 192");

  const fromUpload = await buildAndUploadStoreIconsFromImage({
    storeId: "smoke-store",
    imageBytes: png,
  });
  assert(fromUpload.source === "upload", "upload source");
  assert(fromUpload.icon512Url.length > 10, "upload icon512");
  assert(
    fromUpload.icon512Url.startsWith("data:image/png") ||
      fromUpload.icon512Url.startsWith("http"),
    "upload url",
  );
  console.log("OK: upload image → png icons");

  let timedOut = false;
  try {
    await withTimeout(
      new Promise((r) => setTimeout(r, 500)),
      50,
      "smoke-timeout",
    );
  } catch (err) {
    timedOut = err instanceof Error && /timeout/i.test(err.message);
  }
  assert(timedOut, "withTimeout must reject");
  console.log("OK: withTimeout");

  reset();
  await onboard();

  const menu = await say("menú");
  assert(menuHasIcon(menu), "menu includes Icono de la tienda");

  const hub = await say(undefined, "menu_icon");
  assert(hasOption(hub, "icon_generate"), "hub has Que lo arme el bot");
  assert(hasOption(hub, "icon_upload"), "hub has Subir mi icono");
  assert(
    hub.some(
      (r) =>
        r.kind === "text" &&
        /icono de la tienda|no es la foto de un producto/i.test(r.text),
    ),
    "hub copy distinguishes product vs store icon",
  );

  const gen = await say(undefined, "icon_generate");
  assert(hasImage(gen), "preview image after icon_generate");
  assert(
    gen.some(
      (r) =>
        r.kind === "text" &&
        r.options?.some((o) => o.id === "icon_regen" || o.id === "icon_done"),
    ),
    "regen/done options",
  );
  assert(hasOption(gen, "icon_upload"), "preview offers upload");

  let store = await getStoreForChannelIdentity(from);
  assert(store?.icon192Url, "icon192Url saved");
  assert(store?.icon512Url, "icon512Url saved");
  assert(store?.iconAppleUrl, "iconAppleUrl saved");
  console.log("OK: icons persisted after generate flow");

  const nlu = await say("armar icono");
  assert(
    hasImage(nlu) ||
      nlu.some((r) => r.kind === "text" && /icono|Listo|Generar|Arme/i.test(r.text)),
    "NLU armar icono responds",
  );

  await say(undefined, "icon_done");

  const again = await say("generar icono");
  assert(hasImage(again), "NLU generar icono shows png");
  store = await getStoreForChannelIdentity(from);
  assert(store?.icon512Url, "icon still present");
  await say(undefined, "icon_done");

  const uploadAsk = await say("subir icono");
  assert(
    uploadAsk.some(
      (r) => r.kind === "text" && /mandame la imagen|subir icono/i.test(r.text),
    ),
    "NLU subir icono asks for image",
  );

  const tinyPng = await svgToPng(monogramSvg("X"), 64);
  const uploaded = await say(undefined, "icon_upload", {
    kind: "image",
    mime: "image/png",
    fetch: async () => new Blob([new Uint8Array(tinyPng)], { type: "image/png" }),
  });
  assert(hasImage(uploaded), "upload shows preview png");
  assert(hasOption(uploaded, "icon_done"), "upload preview has Listo");
  store = await getStoreForChannelIdentity(from);
  assert(store?.icon512Url, "icon after manual upload");
  assert(!store?.iconSvgUrl, "manual upload clears svg source");

  await say(undefined, "icon_done");
  console.log("OK: smoke-store-icon");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

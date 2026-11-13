/**
 * Smoke: icono PWA — menú / NLU → hub → composición SVG→PNG → preview;
 * pedido específico (pelota+fuego); productos (lámpara+sushi); subida.
 * Sin LLM.
 */
import { handleMessage } from "../lib/bot/engine";
import type { OutboundMessage } from "../lib/channels/types";
import { getMemoryDb } from "../lib/db/memory";
import {
  getStoreForChannelIdentity,
  createProduct,
} from "../lib/db/repos";
import sharp from "sharp";
import {
  buildAndUploadStoreIcons,
  buildAndUploadStoreIconsFromImage,
  composeStoreIconSvg,
  detectIconMotifs,
  extractIconDesignHint,
  monogramSvg,
  pickIconMotifs,
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
let ownerImageUrl: string | undefined;
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
      ownerImageUrl,
    },
    caps,
  );
  const flat = replies
    .map((r) =>
      r.kind === "text" || r.kind === "sign_out"
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

function menuHasStoreGroup(replies: OutboundMessage[]): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some((o) => o.id === "menu_group_store" && o.label === "Tienda"),
  );
}

function menuHasIcon(replies: OutboundMessage[]): boolean {
  return replies.some(
    (r) =>
      r.kind === "text" &&
      r.options?.some(
        (o) => o.id === "menu_icon" && o.label === "Foto o logo",
      ),
  );
}

function hasOption(replies: OutboundMessage[], id: string): boolean {
  return replies.some(
    (r) => r.kind === "text" && r.options?.some((o) => o.id === id),
  );
}

function captionOf(replies: OutboundMessage[]): string {
  return replies
    .filter((r) => r.kind === "image")
    .map((r) => r.caption || "")
    .join(" ");
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
  // Unit: hint extraction
  assert(
    extractIconDesignHint("Armar icono, pelota de fútbol con fuego") ===
      "pelota de fútbol con fuego",
    "extract design hint from armar icono…",
  );
  assert(
    extractIconDesignHint("Generar otro") === undefined,
    "Generar otro is not a design hint",
  );
  assert(
    extractIconDesignHint("Que lo arme el bot") === undefined,
    "UI label is not a design hint",
  );

  // Unit: motifs + composed SVG (pedido específico)
  const ballFire = detectIconMotifs("pelota de fútbol con fuego");
  assert(ballFire.includes("ball") && ballFire.includes("fire"), "ball+fire motifs");
  const composedPedido = composeStoreIconSvg({
    storeName: "Test",
    designHint: "pelota de fútbol con fuego",
  });
  assert(/<svg[\s>]/i.test(composedPedido), "composed svg pedido");
  assert(!/<text[\s>]/i.test(composedPedido), "composed has no text/iniciales");
  const pngPedido = await svgToPng(composedPedido, 192);
  assert(pngPedido.length > 100 && pngPedido[0] === 0x89, "pedido png");
  console.log("OK: pedido pelota+fuego → composed png");

  // Unit: productos lámpara + sushi
  const fakeProducts = [
    { title: "Lámpara de pie", hidden: false },
    { title: "Sushi nigiri", hidden: false },
  ] as Parameters<typeof pickIconMotifs>[0]["products"];
  const productMotifs = pickIconMotifs({
    storeName: "Mi tienda",
    products: fakeProducts,
  });
  assert(
    productMotifs.includes("lamp") && productMotifs.includes("sushi"),
    `product motifs lamp+sushi got ${productMotifs.join(",")}`,
  );
  const composedProducts = composeStoreIconSvg({
    storeName: "Mi tienda",
    products: fakeProducts,
  });
  assert(!/<text[\s>]/i.test(composedProducts), "product compose no initials");
  await svgToPng(composedProducts, 64);
  console.log("OK: productos lámpara+sushi → composed");

  // Unit: monograma still works for on-the-fly route (paths, not <text>)
  const initials = storeInitials("Cerámicas de Norma");
  assert(initials === "CN", `initials expected CN got ${initials}`);
  const svg = monogramSvg("Cerámicas de Norma");
  assert(/<svg[\s>]/i.test(svg), "monogram svg");
  assert(!/<text[\s>]/i.test(svg), "monogram uses paths not text");
  assert(/<path[\s>]/i.test(svg), "monogram has letter paths");
  const png = await svgToPng(svg, 192);
  assert(png.length > 100, "png bytes");
  assert(png[0] === 0x89 && png[1] === 0x50, "png magic");
  {
    const { data, info } = await sharp(png)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    let letterWhites = 0;
    const x0 = Math.floor(info.width * 0.3);
    const x1 = Math.floor(info.width * 0.7);
    const y0 = Math.floor(info.height * 0.3);
    const y1 = Math.floor(info.height * 0.7);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * info.width + x) * 4;
        if (data[i]! > 220 && data[i + 1]! > 220 && data[i + 2]! > 220) {
          letterWhites++;
        }
      }
    }
    assert(letterWhites > 200, `monogram letter visible (whites=${letterWhites})`);
  }
  const fedeSvg = monogramSvg("Fede tienda súper buena");
  assert(storeInitials("Fede tienda súper buena") === "FT", "Fede → FT");
  assert(!/<text[\s>]/i.test(fedeSvg), "Fede monogram paths");
  console.log("OK: monogram → png 192 (on-the-fly only)");

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
  assert(menuHasStoreGroup(menu), "menu includes grupo Tienda");
  const storeGroup = await say(undefined, "menu_group_store");
  assert(menuHasIcon(storeGroup), "Tienda includes Foto o logo");

  const hub = await say(undefined, "menu_icon");
  assert(hasOption(hub, "icon_generate"), "hub has Que lo arme el bot");
  assert(hasOption(hub, "icon_upload"), "hub has Subir mi imagen");
  assert(
    !hasOption(hub, "icon_from_profile"),
    "hub hides Google photo without imageUrl",
  );
  assert(hasOption(hub, "menu_cancel"), "icon hub has Cancelar");
  assert(
    hub.some(
      (r) =>
        r.kind === "text" &&
        /foto de un producto|foto principal|logo/i.test(r.text),
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
  assert(hasOption(gen, "menu_cancel"), "icon preview has Cancelar");
  assert(hasOption(gen, "icon_upload"), "preview offers upload");
  assert(
    !hasOption(gen, "icon_from_profile"),
    "preview hides Google photo without imageUrl",
  );
  const autoCap = captionOf(gen);
  assert(
    /productos o al nombre|armé esta foto/i.test(autoCap),
    `auto copy mentions productos/nombre, got: ${autoCap}`,
  );
  assert(!/iniciales/i.test(autoCap), "auto copy must not mention iniciales");

  let store = await getStoreForChannelIdentity(from);
  assert(store?.icon192Url, "icon192Url saved");
  assert(store?.icon512Url, "icon512Url saved");
  assert(store?.iconAppleUrl, "iconAppleUrl saved");
  console.log("OK: icons persisted after generate flow");

  // Pedido específico vía NLU
  const pedido = await say("Armar icono, pelota de fútbol con fuego");
  assert(hasImage(pedido), "specific pedido shows image");
  const pedidoCap = captionOf(pedido);
  assert(
    /pelota|fútbol|futbol|pediste/i.test(pedidoCap),
    `pedido caption acknowledges request, got: ${pedidoCap}`,
  );
  assert(!/iniciales/i.test(pedidoCap), "pedido copy must not mention iniciales");
  assert(hasOption(pedido, "icon_upload"), "pedido preview keeps Subir mi imagen");
  await say(undefined, "icon_done");

  // Productos → composición
  store = await getStoreForChannelIdentity(from);
  assert(store, "store exists");
  await createProduct({
    storeId: store!.id,
    title: "Lámpara de pie",
    priceCents: 5000,
    imageUrl: "data:image/png;base64,xx",
  });
  await createProduct({
    storeId: store!.id,
    title: "Sushi nigiri",
    priceCents: 3000,
    imageUrl: "data:image/png;base64,yy",
  });
  const built = await buildAndUploadStoreIcons({
    store: store!,
    products: fakeProducts,
    forceComposed: true,
  });
  assert(built.source === "composed", "forceComposed source");
  assert(!built.designHint, "no design hint on product path");
  console.log("OK: buildAndUpload composed from products");

  const nlu = await say("armar icono");
  assert(
    hasImage(nlu) ||
      nlu.some((r) => r.kind === "text" && /icono|Listo|Generar|Arme|armé/i.test(r.text)),
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

  // Foto de perfil Clerk/Google (data URL → mismo pipeline de subida).
  const profilePng = await svgToPng(monogramSvg("GP"), 128);
  ownerImageUrl = `data:image/png;base64,${profilePng.toString("base64")}`;
  const hubWithPhoto = await say(undefined, "menu_icon");
  assert(
    hasOption(hubWithPhoto, "icon_from_profile"),
    "hub shows Usar mi foto de Google when imageUrl present",
  );
  assert(hasOption(hubWithPhoto, "menu_cancel"), "hub with photo keeps Cancelar");
  const fromProfile = await say(undefined, "icon_from_profile");
  assert(hasImage(fromProfile), "profile photo shows preview");
  assert(
    captionOf(fromProfile).match(/foto de cuenta/i),
    "profile caption mentions foto de cuenta",
  );
  assert(hasOption(fromProfile, "icon_done"), "profile preview has Listo");
  assert(hasOption(fromProfile, "menu_cancel"), "profile preview has Cancelar");
  store = await getStoreForChannelIdentity(from);
  assert(store?.icon512Url, "icon after profile photo");
  assert(!store?.iconSvgUrl, "profile photo clears svg source");
  await say(undefined, "icon_done");

  // Sin foto: explicar en vez de colgar.
  ownerImageUrl = undefined;
  const noPhoto = await say("usar mi foto de google");
  assert(
    noPhoto.some(
      (r) =>
        r.kind === "text" &&
        /entrar con google|foto de perfil|foto de cuenta/i.test(r.text),
    ),
    "explains need for Google/account photo when missing",
  );

  console.log("OK: smoke-store-icon");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

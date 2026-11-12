import { revalidateTag } from "next/cache";
import type { ChannelCapabilities, InboundMessage, OutboundMessage } from "@/lib/channels/types";
import { CHOICE, imageWithOptions, withOptions } from "@/lib/bot/render";
import {
  extractPersonName,
  extractSignupCode,
  formatPriceArs,
  interpretFreeText,
  isAffirmative,
  isNegative,
  parseCaptionHints,
  parsePriceToCents,
} from "@/lib/bot/nlu";
import { uniqueSlug } from "@/lib/bot/slug";
import {
  confirmStockMessage,
  detectStockActionFromText,
  findProductsByHint,
  formatProductList,
  parseQuantityInput,
  productActionOptions,
  productPickOptions,
  productStatusLine,
  resolveChoiceId,
  stockHubMessage,
  withPendingChoices,
} from "@/lib/bot/stock";
import type { Product } from "@/lib/db/schema";
import { transcribeAudio } from "@/lib/bot/transcribe";
import { uploadDataUrl, uploadProductImage } from "@/lib/blob";
import { appBaseUrl, metaBotNumber } from "@/lib/env";
import {
  clerkUserIdFromIdentity,
  isClerkIdentity,
} from "@/lib/channel-identity";
import {
  formatPhoneDisplay,
  isWhatsAppContactPhone,
  normalizeArMobileE164,
} from "@/lib/phone";

function storeIsDemo(from: string): boolean {
  if (isClerkIdentity(from)) return false;
  return !isWhatsAppContactPhone(from);
}

import {
  createChannelLinkIntent,
  createProduct,
  getConversation,
  getProduct,
  getSignupIntent,
  getStoreForChannelIdentity,
  linkVerifiedWaToClerkAccount,
  listProductsByStore,
  markProcessed,
  saveConversation,
  slugExists,
  updateProduct,
  updateStoreIcons,
  upsertStore,
  type ConversationDraft,
  type ProductDraft,
} from "@/lib/db/repos";
import type { Store } from "@/lib/db/schema";
import {
  buildAndUploadStoreIcons,
  buildAndUploadStoreIconsFromImage,
  extractIconDesignHint,
} from "@/lib/store-icon";

export type BotState =
  | "NEW"
  | "ASK_NAME"
  | "CONFIRM_NAME"
  | "ASK_STORE"
  | "CONFIRM_SLUG"
  | "ASK_SHOW_PHONE"
  | "ASK_CONTACT_CHOICE"
  | "ASK_CONTACT_PHONE"
  | "ASK_LINK_CODE"
  | "ASK_STOCK_MODE"
  | "ASK_CHECKOUT_MODE"
  | "IDLE"
  | "PRODUCT_PHOTO"
  | "PRODUCT_TITLE"
  | "PRODUCT_PRICE"
  | "PRODUCT_DESC"
  | "PRODUCT_CONFIRM"
  | "STOCK_HUB"
  | "STOCK_PICK"
  | "STOCK_ACTIONS"
  | "STOCK_QTY"
  | "STOCK_CONFIRM"
  | "PRICE_INPUT"
  | "PHOTO_INPUT"
  | "ICON_HUB"
  | "ICON_WAIT_UPLOAD"
  | "ICON_PREVIEW";

const DEFAULT_CAPS: ChannelCapabilities = {
  buttons: true,
  maxButtons: 3,
  maxListRows: 10,
};

function draftOf(raw: Record<string, unknown> | null | undefined): ConversationDraft {
  return (raw ?? {}) as ConversationDraft;
}

function productDraft(d: ConversationDraft): ProductDraft {
  return d.product ?? {};
}

function storeUrl(slug: string): string {
  return `${appBaseUrl()}/${slug}`;
}

function revalidateStore(slug: string | null | undefined) {
  if (!slug) return;
  try {
    revalidateTag(`store:${slug}`, { expire: 0 });
  } catch (err) {
    console.warn("[bot] revalidateTag failed", err);
  }
}

function clearStockDraft(d: ConversationDraft): ConversationDraft {
  return {
    ...d,
    stockProductId: undefined,
    stockAction: undefined,
    stockQtyPending: undefined,
    stockPricePending: undefined,
    stockPhotoUrlPending: undefined,
    stockPhotoBlobKeyPending: undefined,
    stockModePending: undefined,
    pendingChoices: undefined,
  };
}

function globalCommands(text?: string, choiceId?: string): "menu" | "help" | "cancel" | null {
  if (choiceId === CHOICE.MENU_BACK) return "menu";
  if (choiceId === CHOICE.MENU_HELP || choiceId === "help") return "help";
  if (choiceId === CHOICE.MENU_ADD) return null;
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (t === "menu" || t === "menú" || t === "volver" || /^volver al men/.test(t)) {
    return "menu";
  }
  if (t === "ayuda" || t === "help") return "help";
  if (t === "cancelar") return "cancel";
  return null;
}

function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Pedidos / WhatsApp de contacto (no confundir con “whatsapp” del modo de checkout). */
function wantsContactPhoneText(text: string): boolean {
  const t = normalizeLoose(text);
  // Vincular cuenta web ↔ WhatsApp de gestión no es “WhatsApp de pedidos”.
  if (wantsLinkExistingAccountText(t) || wantsGenerateLinkCodeText(t)) {
    return false;
  }
  return (
    /\b(whats?app|contacto|pedidos?)\b/.test(t) ||
    /numero (de )?(pedidos?|whats?app|contacto)/.test(t) ||
    /cambiar (el )?numero/.test(t)
  );
}

/** Desde WhatsApp: ya armé la tienda en la web y quiero el mismo catálogo acá. */
function wantsLinkExistingAccountText(text: string): boolean {
  const t = normalizeLoose(text);
  return (
    /ya tengo (una )?cuenta/.test(t) ||
    /ya (la )?arme (en )?la web/.test(t) ||
    /ya (me )?registre (en )?la web/.test(t) ||
    /vincular (mi )?cuenta/.test(t) ||
    /unir (mi )?cuenta/.test(t) ||
    t === "vincular" ||
    t === "ya tengo"
  );
}

/** Desde /asistente (Clerk): generar código para escribir desde el celular. */
function wantsGenerateLinkCodeText(text: string): boolean {
  const t = normalizeLoose(text);
  return (
    /vincular (whats?app|el (celular|telefono|whats?app))/.test(t) ||
    /unir (whats?app|el (celular|telefono))/.test(t) ||
    /codigo (de )?vincul/.test(t) ||
    /gestionar (por|desde) whats?app/.test(t)
  );
}

/** Código de 6 dígitos para vínculo Clerk↔WA (no confundir con signup de 4). */
function extractChannelLinkCode(text?: string): string | null {
  if (!text) return null;
  const labeled = text.match(
    /\b(?:c[oó]digo|vincular|link)\s*[:=]?\s*(\d{6})\b/i,
  );
  if (labeled?.[1]) return labeled[1];
  const bare = text.trim().match(/^(\d{6})$/);
  return bare?.[1] ?? null;
}

function wantsStoreLinkText(text: string): boolean {
  const t = normalizeLoose(text);
  // "tienda" solo abre el grupo del menú; el link pide “ver mi tienda” / “mi tienda”.
  return /\b(ver (mi )?tienda|mi tienda|link( de)?( la)? tienda|catalogo|mi link)\b/.test(
    t,
  );
}

/** Títulos de grupo del menú (NLU / botón). */
function matchMenuGroup(
  text?: string,
  choiceId?: string,
): "products" | "store" | "wa" | null {
  if (
    choiceId === CHOICE.MENU_GROUP_PRODUCTS ||
    choiceId === CHOICE.MENU_GROUP_STORE ||
    choiceId === CHOICE.MENU_GROUP_WA
  ) {
    if (choiceId === CHOICE.MENU_GROUP_PRODUCTS) return "products";
    if (choiceId === CHOICE.MENU_GROUP_STORE) return "store";
    return "wa";
  }
  if (!text) return null;
  const t = normalizeLoose(text);
  if (t === "productos" || t === "producto") return "products";
  if (t === "tienda") return "store";
  if (t === "whatsapp" || t === "whats app" || t === "whats") return "wa";
  return null;
}

function menuMessage(
  caps: ChannelCapabilities,
  _from?: string,
): OutboundMessage {
  const options: { id: string; label: string }[] = [
    { id: CHOICE.MENU_GROUP_PRODUCTS, label: "Productos" },
    { id: CHOICE.MENU_GROUP_STORE, label: "Tienda" },
    { id: CHOICE.MENU_GROUP_WA, label: "WhatsApp" },
    { id: CHOICE.MENU_HELP, label: "Ayuda" },
  ];
  return withOptions("¿Qué querés hacer?", options, caps);
}

function productsMenuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "Productos — ¿qué necesitás?",
    [
      { id: CHOICE.MENU_ADD, label: "Cargar producto" },
      { id: CHOICE.MENU_PRICE, label: "Cambiar precio" },
      { id: CHOICE.MENU_PHOTO, label: "Cambiar foto" },
      { id: CHOICE.MENU_STOCK, label: "Stock / pausa" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function storeMenuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "Tienda — ¿qué necesitás?",
    [
      { id: CHOICE.MENU_ICON, label: "Icono de la tienda" },
      { id: CHOICE.MENU_STORE, label: "Ver mi tienda" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function waMenuMessage(
  caps: ChannelCapabilities,
  from?: string,
): OutboundMessage {
  const options: { id: string; label: string }[] = [
    { id: CHOICE.MENU_CONTACT, label: "WhatsApp pedidos" },
  ];
  if (from && isClerkIdentity(from)) {
    options.push({ id: CHOICE.MENU_LINK_WA, label: "Vincular WhatsApp" });
  }
  options.push({ id: CHOICE.MENU_BACK, label: "Volver al menú" });
  return withOptions("WhatsApp — ¿qué necesitás?", options, caps);
}

function groupMenuMessage(
  group: "products" | "store" | "wa",
  caps: ChannelCapabilities,
  from?: string,
): OutboundMessage {
  if (group === "products") return productsMenuMessage(caps);
  if (group === "store") return storeMenuMessage(caps);
  return waMenuMessage(caps, from);
}

function helpMessage(): OutboundMessage {
  return {
    kind: "text",
    text:
      "Soy tu ayudante para armar la tienda. Podés mandarme fotos de tus productos y te voy guiando. También podés mandarme audios (nombre, precio, stock).\n\n" +
      "El menú tiene grupos: Productos, Tienda, WhatsApp y Ayuda.\n" +
      "Stock: menú → Productos → Stock / pausa, o pedime el listado, pausar, reactivar o cambiar cantidad (por texto o audio).\n" +
      "Precio: menú → Productos → Cambiar precio, o pedime cambiar el precio y te listo los productos (ej. «cambiar el precio de la lámpara»).\n" +
      "Foto de un PRODUCTO: menú → Productos → Cambiar foto, o pedime cambiar la foto y te listo los productos; después mandás la foto nueva y confirmamos.\n" +
      "Icono de la TIENDA (no es la foto de un producto): menú → Tienda → Icono de la tienda. Pedime por texto o audio «armar icono» / «icono de la tienda», o «subir icono» y mandá tu imagen.\n" +
      "WhatsApp de pedidos: menú → WhatsApp → WhatsApp pedidos (el número donde te escriben los clientes).\n" +
      "Si armaste la tienda en la web y querés gestionarla por WhatsApp: menú → WhatsApp → Vincular WhatsApp, después desde el celular escribí «ya tengo cuenta» y el código.\n" +
      "Escribí o dictá menú para ver opciones, o cancelar para frenar lo que estemos haciendo.",
  };
}

function askLinkCodePrompt(): OutboundMessage {
  return {
    kind: "text",
    text:
      "Dale. En la web (alfrebot → Armá en la web /asistente) abrí el menú y tocá Vincular WhatsApp: te doy un código de 6 dígitos.\n\n" +
      "Después mandame ese código acá (por ejemplo 482915). Vale 30 minutos.",
  };
}

function askContactPhonePrompt(editing: boolean): OutboundMessage {
  return {
    kind: "text",
    text: editing
      ? "Mandame el WhatsApp donde querés que te escriban los clientes (con código de área), por ejemplo 11 1234-5678. Tu número de gestión no cambia."
      : "¿A qué WhatsApp te escriben los clientes? Mandame tu celular con código de área, por ejemplo 11 1234-5678.",
  };
}

function linkFailureMessage(detail: string): string {
  switch (detail) {
    case "invalid_code":
      return "Ese código no existe o ya se usó. Generá uno nuevo en el chat web (Vincular WhatsApp).";
    case "expired":
      return "Ese código venció (valen 30 minutos). Generá uno nuevo en el chat web.";
    case "no_clerk_store":
      return "No encontré una tienda armada con esa cuenta web. Terminá el alta en /asistente y después vinculá.";
    case "conflict_both_have_products":
      return "Ese WhatsApp y esa cuenta web tienen tiendas distintas con productos. Escribime a soporte o usá un solo camino por ahora.";
    case "wa_store_has_other_clerk":
      return "Ese WhatsApp ya está vinculado a otra cuenta de email.";
    case "wa_not_valid":
      return "Para vincular tenés que escribirme desde un celular argentino (WhatsApp).";
    case "wa_identity_taken":
      return "Ese número ya tiene otra tienda. Si es tuya, escribinos.";
    default:
      return "No pude vincular ahora. Probá de nuevo o cancelá y pedime el menú.";
  }
}

async function completeChannelLinkFromWa(
  msg: InboundMessage,
  code: string,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  const waE164 = normalizeArMobileE164(msg.from);
  if (!waE164) {
    return [{ kind: "text", text: linkFailureMessage("wa_not_valid") }];
  }
  const result = await linkVerifiedWaToClerkAccount({ waE164, code });
  if (!result.linked || !result.store) {
    return [{ kind: "text", text: linkFailureMessage(result.detail) }];
  }
  const store = result.store;
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    product: undefined,
    ownerName: store.ownerName ?? draft.ownerName,
    storeName: store.name ?? draft.storeName,
    slug: store.slug ?? draft.slug,
    contactPhone: store.contactPhone ?? draft.contactPhone,
    showPhone: store.showPhone,
    checkoutMode: store.checkoutMode,
    tracksQuantity: store.tracksQuantity,
  };
  await setState("IDLE", nextDraft);
  const name = store.ownerName ? `, ${store.ownerName}` : "";
  const replies: OutboundMessage[] = [
    {
      kind: "text",
      text:
        result.detail === "already_linked"
          ? `Ya estaba vinculada tu cuenta web con este WhatsApp${name}. Seguís con la misma tienda.`
          : `Listo${name}: vinculé este WhatsApp con tu cuenta web. Es la misma tienda.`,
    },
  ];
  if (store.slug) replies.push(storeLinkReply(store));
  replies.push(menuMessage(caps, msg.from));
  return replies;
}

async function startGenerateLinkCode(
  msg: InboundMessage,
  store: Store | null,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  if (!isClerkIdentity(msg.from)) {
    return [
      {
        kind: "text",
        text: "Eso se hace desde el chat web. Si ya tenés cuenta, escribime «ya tengo cuenta» desde WhatsApp.",
      },
      menuMessage(caps, msg.from),
    ];
  }
  if (!store?.slug || store.status !== "active") {
    return [
      {
        kind: "text",
        text: "Primero terminá de armar la tienda acá en la web; después te doy el código para WhatsApp.",
      },
      menuMessage(caps, msg.from),
    ];
  }
  if (
    isWhatsAppContactPhone(store.channelIdentity) &&
    store.clerkUserId === clerkUserIdFromIdentity(msg.from)
  ) {
    return [
      {
        kind: "text",
        text: `Ya vinculaste esta cuenta con el WhatsApp ${formatPhoneDisplay(store.channelIdentity)}. Desde ese número podés gestionar la tienda.`,
      },
      menuMessage(caps, msg.from),
    ];
  }

  const created = await createChannelLinkIntent({
    clerkChannelIdentity: msg.from,
    ownerEmail: msg.ownerEmail ?? store.ownerEmail,
  });
  if ("error" in created) {
    return [
      { kind: "text", text: "No pude generar el código. Probá de nuevo en un rato." },
      menuMessage(caps, msg.from),
    ];
  }

  const bot = metaBotNumber();
  const waText = encodeURIComponent(
    `Hola! Ya tengo cuenta. Código ${created.code}`,
  );
  const waLink = `https://wa.me/${bot}?text=${waText}`;
  return [
    {
      kind: "text",
      text:
        `Tu código es *${created.code}* (vale 30 minutos).\n\n` +
        `1. Abrí WhatsApp con el celular que vas a usar para gestionar la tienda.\n` +
        `2. Escribile al bot y mandá ese código (o tocá: ${waLink}).\n\n` +
        `El WhatsApp de pedidos de los clientes no cambia: solo unimos la gestión.`,
    },
    menuMessage(caps, msg.from),
  ];
}

function storeLinkReply(store: Store): OutboundMessage {
  const contact =
    store.contactPhone ||
    (isWhatsAppContactPhone(store.channelIdentity) ? store.channelIdentity : null);
  const contactLine = contact
    ? `\nWhatsApp de pedidos: ${formatPhoneDisplay(contact)}`
    : "\nTodavía no hay WhatsApp de pedidos configurado.";
  return {
    kind: "text",
    text: `Acá está tu tienda: ${storeUrl(store.slug!)}${contactLine}\n\nSi querés cambiar el número de pedidos, tocá WhatsApp pedidos en el menú.`,
  };
}

async function startContactEditFlow(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const current =
    store.contactPhone ||
    (isWhatsAppContactPhone(store.channelIdentity) ? store.channelIdentity : null);
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    product: undefined,
    contactPhoneFlow: "edit",
  };
  if (isWhatsAppContactPhone(msg.from)) {
    return replyWithChoices(
      nextDraft,
      setState,
      "ASK_CONTACT_CHOICE",
      withOptions(
        current
          ? `Hoy los pedidos van a ${formatPhoneDisplay(current)}. ¿Seguimos con tu WhatsApp de gestión (${formatPhoneDisplay(msg.from)}) u otro número?\n\nTu número de gestión no cambia.`
          : `¿Usamos tu WhatsApp de gestión (${formatPhoneDisplay(msg.from)}) para pedidos u otro número?`,
        [
          { id: CHOICE.CONTACT_SAME, label: "Este mismo" },
          { id: CHOICE.CONTACT_OTHER, label: "Otro número" },
        ],
        caps,
      ),
    );
  }
  await setState("ASK_CONTACT_PHONE", nextDraft);
  const replies: OutboundMessage[] = [askContactPhonePrompt(true)];
  if (current) {
    replies.unshift({
      kind: "text",
      text: `Hoy figura ${formatPhoneDisplay(current)} para pedidos.`,
    });
  }
  return replies;
}

function afterContactPhoneOnboarding(
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  replies: OutboundMessage[],
): Promise<OutboundMessage[]> {
  return replyWithChoices(
    draft,
    setState,
    "ASK_STOCK_MODE",
    withOptions(
      "¿Querés llevar la cuenta de cuántos productos te quedan?\n\n• Con números: anotás las unidades de cada producto. En 0 se muestra Agotado.\n• Sin números: solo marcás Agotado o Disponible.",
      [
        { id: CHOICE.STOCK_QTY_MODE, label: "Con números" },
        { id: CHOICE.STOCK_PAUSE_MODE, label: "Sin números" },
      ],
      caps,
    ),
    replies,
  );
}

type SetState = (next: BotState, nextDraft?: ConversationDraft) => Promise<void>;

async function replyWithChoices(
  draft: ConversationDraft,
  setState: SetState,
  state: BotState,
  message: OutboundMessage,
  extra?: OutboundMessage[],
): Promise<OutboundMessage[]> {
  const { draft: nextDraft, message: msg } = withPendingChoices(draft, message);
  await setState(state, nextDraft);
  return extra ? [...extra, msg] : [msg];
}

export async function handleMessage(
  msg: InboundMessage,
  caps: ChannelCapabilities = DEFAULT_CAPS,
): Promise<OutboundMessage[]> {
  const fresh = await markProcessed(msg.messageId);
  if (!fresh) return [];

  // Audio → texto: reusa la máquina de estados (título, precio, stock, NLU).
  if (msg.media?.kind === "audio") {
    let transcript: string | null = null;
    try {
      const blob = await msg.media.fetch();
      transcript = await transcribeAudio(blob, msg.media.mime);
    } catch (err) {
      console.warn("[engine] audio fetch/transcribe failed", err);
    }
    if (!transcript) {
      return [
        {
          kind: "text",
          text: "No pude entender el audio ahora (la IA a veces se satura). Probá de nuevo en un rato o escribilo.",
        },
      ];
    }
    const rest = await handleMessageBody(
      { ...msg, text: transcript, media: undefined },
      caps,
    );
    return [{ kind: "text", text: `Te escuché: «${transcript}»` }, ...rest];
  }

  return handleMessageBody(msg, caps);
}

async function handleMessageBody(
  msg: InboundMessage,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  const existing = await getConversation(msg.from);
  let state = (existing?.state as BotState) || "NEW";
  let draft = draftOf(existing?.draft as Record<string, unknown>);

  const cmd = globalCommands(msg.text, msg.choiceId);
  if (cmd === "help") {
    return [helpMessage()];
  }
  if (cmd === "cancel") {
    draft = clearStockDraft({ ...draft, product: undefined });
    await saveConversation({
      channelIdentity: msg.from,
      channel: msg.channel,
      state: "IDLE",
      draft,
    });
    return [
      { kind: "text", text: "Listo, cancelamos eso." },
      menuMessage(caps, msg.from),
    ];
  }
  if (
    cmd === "menu" &&
    (state === "IDLE" ||
      state === "ASK_LINK_CODE" ||
      state === "PRICE_INPUT" ||
      state === "PHOTO_INPUT" ||
      state === "ICON_HUB" ||
      state === "ICON_WAIT_UPLOAD" ||
      state === "ICON_PREVIEW" ||
      state.startsWith("STOCK_") ||
      state.startsWith("PRODUCT_"))
  ) {
    draft = clearStockDraft({ ...draft, product: undefined });
    await saveConversation({
      channelIdentity: msg.from,
      channel: msg.channel,
      state: "IDLE",
      draft,
    });
    return [menuMessage(caps, msg.from)];
  }

  // Signup code from wa.me deep link
  if (msg.text) {
    const code = extractSignupCode(msg.text);
    if (code) {
      const intent = await getSignupIntent(code);
      if (intent) draft = { ...draft, signupCode: code };
    }
  }

  const replies: OutboundMessage[] = [];

  const setState: SetState = async (next, nextDraft) => {
    state = next;
    if (nextDraft) draft = nextDraft;
    await saveConversation({
      channelIdentity: msg.from,
      channel: msg.channel,
      state: next,
      draft,
    });
  };

  const choice = resolveChoiceId(msg.choiceId, msg.text, draft.pendingChoices);

  // ——— State machine ———
  if (state === "NEW") {
    // Código de vínculo primero (aunque ya haya tienda WA: puede estar uniendo Clerk).
    const earlyCode = extractChannelLinkCode(msg.text);
    if (earlyCode && isWhatsAppContactPhone(msg.from)) {
      return completeChannelLinkFromWa(
        msg,
        earlyCode,
        draft,
        setState,
        caps,
      );
    }

    // Misma dueña por el otro canal (Clerk ↔ WA vinculado) → menú, no onboarding.
    const existingStore = await getStoreForChannelIdentity(msg.from);
    if (existingStore?.status === "active" && existingStore.slug) {
      draft = {
        ...draft,
        ownerName: existingStore.ownerName ?? draft.ownerName,
        storeName: existingStore.name ?? draft.storeName,
        slug: existingStore.slug,
        contactPhone: existingStore.contactPhone ?? draft.contactPhone,
        showPhone: existingStore.showPhone,
        checkoutMode: existingStore.checkoutMode,
        tracksQuantity: existingStore.tracksQuantity,
      };
      await setState("IDLE", draft);
      const hello = existingStore.ownerName
        ? `¡Hola de nuevo, ${existingStore.ownerName}! Encontré tu tienda.`
        : "¡Hola de nuevo! Encontré tu tienda.";
      replies.push({ kind: "text", text: hello });
      replies.push(menuMessage(caps, msg.from));
      return replies;
    }

    if (
      choice === CHOICE.LINK_EXISTING ||
      (msg.text && wantsLinkExistingAccountText(msg.text))
    ) {
      if (!isWhatsAppContactPhone(msg.from)) {
        if (isClerkIdentity(msg.from)) {
          replies.push({
            kind: "text",
            text: "Estás en la web: cuando termines el alta, tocá Vincular WhatsApp en el menú para generar el código. Después lo mandás desde el celular.",
          });
        } else {
          replies.push({
            kind: "text",
            text: "Para vincular una cuenta web, escribime desde WhatsApp con tu celular.",
          });
        }
        await setState("ASK_NAME", draft);
        replies.push({
          kind: "text",
          text: "Si estás armando una tienda nueva: ¿cómo te llamás?",
        });
        return replies;
      }
      await setState("ASK_LINK_CODE", draft);
      replies.push(askLinkCodePrompt());
      return replies;
    }

    await setState("ASK_NAME", draft);
    replies.push({
      kind: "text",
      text: "¡Hola! Soy tu ayudante para armar la tienda. ¿Cómo te llamás?\n\nSi ya la armaste en la web, escribí «ya tengo cuenta».",
    });
    return replies;
  }

  if (state === "ASK_LINK_CODE") {
    if (!isWhatsAppContactPhone(msg.from)) {
      await setState("NEW", draft);
      replies.push({
        kind: "text",
        text: "El código hay que mandarlo desde WhatsApp (tu celular).",
      });
      return replies;
    }
    const code =
      extractChannelLinkCode(msg.text) ??
      msg.text?.replace(/\D/g, "").slice(0, 6) ??
      "";
    if (code.length !== 6) {
      replies.push({
        kind: "text",
        text: "Necesito el código de 6 dígitos que te mostró el chat web. O escribí cancelar.",
      });
      return replies;
    }
    return completeChannelLinkFromWa(msg, code, draft, setState, caps);
  }

  if (state === "ASK_NAME") {
    if (
      choice === CHOICE.LINK_EXISTING ||
      (msg.text && wantsLinkExistingAccountText(msg.text))
    ) {
      if (!isWhatsAppContactPhone(msg.from)) {
        replies.push({
          kind: "text",
          text: isClerkIdentity(msg.from)
            ? "Para vincular WhatsApp, tocá Vincular WhatsApp en el menú cuando tengas la tienda lista."
            : "Para vincular, escribime desde WhatsApp.",
        });
        replies.push({
          kind: "text",
          text: "Si seguís el alta: ¿cómo te llamás?",
        });
        return replies;
      }
      await setState("ASK_LINK_CODE", clearStockDraft(draft));
      replies.push(askLinkCodePrompt());
      return replies;
    }
    const earlyCode = extractChannelLinkCode(msg.text);
    if (earlyCode && isWhatsAppContactPhone(msg.from)) {
      return completeChannelLinkFromWa(
        msg,
        earlyCode,
        draft,
        setState,
        caps,
      );
    }
    const raw = msg.text?.trim();
    if (!raw) {
      replies.push({ kind: "text", text: "Decime tu nombre, así te hablo de vos." });
      return replies;
    }
    const extracted = extractPersonName(raw);
    if (!extracted.name || extracted.confidence === "none") {
      replies.push({
        kind: "text",
        text: "No entendí bien el nombre. Escribí solo cómo te llamás, por ejemplo: Norma.",
      });
      return replies;
    }
    draft = { ...draft, ownerName: extracted.name };
    const prompt =
      extracted.confidence === "high"
        ? `Encantada, ${extracted.name}. ¿Usamos ese nombre?`
        : `¿Te llamás ${extracted.name}? Si no, tocá Cambiar nombre.`;
    return replyWithChoices(
      draft,
      setState,
      "CONFIRM_NAME",
      withOptions(
        prompt,
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
  }

  if (state === "CONFIRM_NAME") {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.CHANGE || isNegative(text) || /cambiar/.test(text.toLowerCase())) {
      draft = { ...draft, ownerName: undefined };
      await setState("ASK_NAME", draft);
      replies.push({
        kind: "text",
        text: "Dale, ¿cómo te llamás? Escribí solo tu nombre.",
      });
      return replies;
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      await setState("ASK_STORE", draft);
      replies.push({
        kind: "text",
        text: `Perfecto, ${draft.ownerName}. ¿Cómo querés que se llame tu tienda?`,
      });
      return replies;
    }
    const again = extractPersonName(text);
    if (again.name && again.confidence !== "none") {
      draft = { ...draft, ownerName: again.name };
      return replyWithChoices(
        draft,
        setState,
        "CONFIRM_NAME",
        withOptions(
          `Encantada, ${again.name}. ¿Usamos ese nombre?`,
          [
            { id: CHOICE.YES, label: "Sí" },
            { id: CHOICE.CHANGE, label: "Cambiar nombre" },
          ],
          caps,
        ),
      );
    }
    return replyWithChoices(
      draft,
      setState,
      "CONFIRM_NAME",
      withOptions(
        `¿Confirmamos tu nombre: ${draft.ownerName}?`,
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
  }

  if (state === "ASK_STORE") {
    const storeName = msg.text?.trim();
    if (!storeName) {
      replies.push({ kind: "text", text: "¿Cómo se va a llamar tu tienda?" });
      return replies;
    }
    const slug = await uniqueSlug(storeName, slugExists);
    draft = { ...draft, storeName, slug };
    return replyWithChoices(
      draft,
      setState,
      "CONFIRM_SLUG",
      withOptions(
        `Tu tienda va a estar en ${appBaseUrl()}/${slug}. ¿Está bien?`,
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
  }

  if (state === "CONFIRM_SLUG") {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.CHANGE || isNegative(text) || /cambiar/.test(text.toLowerCase())) {
      await setState("ASK_STORE", draft);
      replies.push({ kind: "text", text: "Dale, ¿cómo querés que se llame tu tienda?" });
      return replies;
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      return replyWithChoices(
        draft,
        setState,
        "ASK_SHOW_PHONE",
        withOptions(
          "¿Querés que en la tienda aparezca tu número para que te escriban?",
          [
            { id: CHOICE.YES, label: "Sí" },
            { id: CHOICE.NO, label: "No" },
          ],
          caps,
        ),
      );
    }
    return replyWithChoices(
      draft,
      setState,
      "CONFIRM_SLUG",
      withOptions(
        "¿Confirmamos el nombre de la tienda?",
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
  }

  if (state === "ASK_SHOW_PHONE") {
    const text = msg.text?.trim() ?? "";
    let showPhone = true;
    if (choice === CHOICE.NO || isNegative(text)) showPhone = false;
    else if (!(choice === CHOICE.YES || isAffirmative(text))) {
      return replyWithChoices(
        draft,
        setState,
        "ASK_SHOW_PHONE",
        withOptions(
          "¿Mostramos tu número en la tienda?",
          [
            { id: CHOICE.YES, label: "Sí" },
            { id: CHOICE.NO, label: "No" },
          ],
          caps,
        ),
      );
    }

    draft = { ...draft, showPhone };
    if (!showPhone) {
      draft = { ...draft, contactPhone: undefined };
      return afterContactPhoneOnboarding(draft, setState, caps, replies);
    }

    // Simulador (o canal sin WA AR válido): siempre pedimos el WhatsApp de pedidos.
    // La key de identidad sigue siendo msg.from; contactPhone es solo para el catálogo.
    const needsExplicitContact =
      msg.channel === "simulator" || !isWhatsAppContactPhone(msg.from);
    if (needsExplicitContact) {
      draft = { ...draft, contactPhoneFlow: "onboarding" };
      await setState("ASK_CONTACT_PHONE", draft);
      replies.push(askContactPhonePrompt(false));
      return replies;
    }

    // WhatsApp real: pueden usar este mismo número u otro para atender pedidos.
    draft = { ...draft, contactPhoneFlow: "onboarding" };
    return replyWithChoices(
      draft,
      setState,
      "ASK_CONTACT_CHOICE",
      withOptions(
        `¿Los clientes te escriben a este WhatsApp (${formatPhoneDisplay(msg.from)}) o preferís otro número para atender la tienda?`,
        [
          { id: CHOICE.CONTACT_SAME, label: "Este mismo" },
          { id: CHOICE.CONTACT_OTHER, label: "Otro número" },
        ],
        caps,
      ),
      replies,
    );
  }

  if (state === "ASK_CONTACT_CHOICE") {
    const text = (msg.text?.trim() ?? "").toLowerCase();
    const flow = draft.contactPhoneFlow ?? "onboarding";

    if (
      choice === CHOICE.CONTACT_SAME ||
      choice === CHOICE.YES ||
      /este|mismo|igual/.test(text)
    ) {
      const contactPhone = normalizeArMobileE164(msg.from);
      draft = {
        ...draft,
        contactPhone: contactPhone ?? undefined,
        contactPhoneFlow: undefined,
      };
      if (contactPhone) {
        replies.push({
          kind: "text",
          text: `Dale, en la tienda va a figurar ${formatPhoneDisplay(contactPhone)}.`,
        });
      }
      // contactPhone es solo público de pedidos: no vincula Clerk↔WA.

      if (flow === "edit") {
        const updated = await upsertStore({
          channelIdentity: msg.from,
          contactPhone,
          ownerEmail: msg.ownerEmail,
          showPhone: true,
        });
        revalidateStore(updated.slug);
        await setState("IDLE", draft);
        replies.push(menuMessage(caps, msg.from));
        return replies;
      }

      return afterContactPhoneOnboarding(draft, setState, caps, replies);
    }

    if (
      choice === CHOICE.CONTACT_OTHER ||
      /otro|cambiar|diferente/.test(text)
    ) {
      draft = { ...draft, contactPhoneFlow: flow };
      await setState("ASK_CONTACT_PHONE", draft);
      replies.push(askContactPhonePrompt(flow === "edit"));
      return replies;
    }

    return replyWithChoices(
      draft,
      setState,
      "ASK_CONTACT_CHOICE",
      withOptions(
        `¿Usamos este WhatsApp (${formatPhoneDisplay(msg.from)}) para pedidos o preferís otro?`,
        [
          { id: CHOICE.CONTACT_SAME, label: "Este mismo" },
          { id: CHOICE.CONTACT_OTHER, label: "Otro número" },
        ],
        caps,
      ),
    );
  }

  if (state === "ASK_CONTACT_PHONE") {
    const raw = msg.text?.trim() ?? "";
    const contactPhone = normalizeArMobileE164(raw);
    if (!contactPhone) {
      replies.push({
        kind: "text",
        text: "No entendí el número. Probá así: 11 1234-5678 o 351 123-4567.",
      });
      return replies;
    }
    const flow = draft.contactPhoneFlow ?? "onboarding";
    draft = {
      ...draft,
      contactPhone,
      showPhone: true,
      contactPhoneFlow: undefined,
    };
    replies.push({
      kind: "text",
      text: `Perfecto, en la tienda va a figurar ${formatPhoneDisplay(contactPhone)}. Tu número de gestión no cambia.`,
    });
    // contactPhone no transfiere la tienda: el vínculo Clerk↔WA es por código (Vincular WhatsApp).

    if (flow === "edit") {
      const updated = await upsertStore({
        channelIdentity: msg.from,
        contactPhone,
        ownerEmail: msg.ownerEmail,
        showPhone: true,
      });
      revalidateStore(updated.slug);
      await setState("IDLE", draft);
      replies.push(menuMessage(caps, msg.from));
      return replies;
    }

    return afterContactPhoneOnboarding(draft, setState, caps, replies);
  }

  if (state === "ASK_STOCK_MODE") {
    const text = msg.text?.trim() ?? "";
    let tracksQuantity: boolean | null = null;
    if (
      choice === CHOICE.STOCK_QTY_MODE ||
      /cantidad|con n[uú]meros/.test(text.toLowerCase())
    ) {
      tracksQuantity = true;
    } else if (
      choice === CHOICE.STOCK_PAUSE_MODE ||
      /pausar|solo pausa|sin cantidad|sin n[uú]meros/.test(text.toLowerCase())
    ) {
      tracksQuantity = false;
    }
    if (tracksQuantity == null) {
      return replyWithChoices(
        draft,
        setState,
        "ASK_STOCK_MODE",
        withOptions(
          "¿Cómo querés marcar si hay productos?\n\n• Con números: anotás las unidades de cada producto.\n• Sin números: solo marcás Agotado o Disponible.",
          [
            { id: CHOICE.STOCK_QTY_MODE, label: "Con números" },
            { id: CHOICE.STOCK_PAUSE_MODE, label: "Sin números" },
          ],
          caps,
        ),
      );
    }

    draft = { ...draft, tracksQuantity };
    return replyWithChoices(
      draft,
      setState,
      "ASK_CHECKOUT_MODE",
      withOptions(
        "¿Cómo querés que te pidan? Por defecto cada producto tiene un botón Lo quiero que te escribe por WhatsApp. También podés armar un carrito y mandar el pedido junto (igual por WhatsApp, sin cobro online).",
        [
          { id: CHOICE.CHECKOUT_WA, label: "Lo quiero" },
          { id: CHOICE.CHECKOUT_CART, label: "Con carrito" },
        ],
        caps,
      ),
    );
  }

  if (state === "ASK_CHECKOUT_MODE") {
    const text = (msg.text?.trim() ?? "").toLowerCase();
    let checkoutMode: "whatsapp" | "cart" | null = null;
    if (
      choice === CHOICE.CHECKOUT_WA ||
      choice === CHOICE.YES ||
      /\blo quiero\b/.test(text) ||
      /whatsapp|directo|uno/.test(text)
    ) {
      checkoutMode = "whatsapp";
    } else if (
      choice === CHOICE.CHECKOUT_CART ||
      /carrito|pedido|junt/.test(text)
    ) {
      checkoutMode = "cart";
    }

    if (!checkoutMode) {
      return replyWithChoices(
        draft,
        setState,
        "ASK_CHECKOUT_MODE",
        withOptions(
          "Elegí cómo te piden en el catálogo:",
          [
            { id: CHOICE.CHECKOUT_WA, label: "Lo quiero" },
            { id: CHOICE.CHECKOUT_CART, label: "Con carrito" },
          ],
          caps,
        ),
      );
    }

    const tracksQuantity = draft.tracksQuantity ?? false;
    const contactPhone =
      draft.contactPhone ??
      (isWhatsAppContactPhone(msg.from)
        ? normalizeArMobileE164(msg.from)
        : null);
    const store = await upsertStore({
      channelIdentity: msg.from,
      contactPhone,
      ownerName: draft.ownerName,
      ownerEmail: msg.ownerEmail ?? undefined,
      name: draft.storeName,
      slug: draft.slug,
      showPhone: draft.showPhone ?? true,
      checkoutMode,
      tracksQuantity,
      isDemo: storeIsDemo(msg.from),
      clerkUserId: clerkUserIdFromIdentity(msg.from),
      status: "active",
    });
    draft = clearStockDraft({ ...draft, checkoutMode, tracksQuantity });
    revalidateStore(store.slug);
    await setState("IDLE", draft);
    const checkoutHint =
      checkoutMode === "cart"
        ? "En tu catálogo van a poder armar un pedido y mandártelo por WhatsApp."
        : "En tu catálogo cada producto tiene Lo quiero para escribirte por WhatsApp.";
    const stockHint = tracksQuantity
      ? "Podés anotar cantidades desde el menú → Productos → Stock / pausa."
      : "Podés marcar productos como Agotado desde el menú → Productos → Stock / pausa.";
    const continuityHint = isClerkIdentity(msg.from)
      ? " Los pedidos de clientes van por el WhatsApp de pedidos que cargaste."
      : msg.channel === "simulator" && isWhatsAppContactPhone(msg.from)
        ? " Cuando quieras, escribile al bot por WhatsApp desde este mismo número y seguís la conversación."
        : "";
    replies.push({
      kind: "text",
      text: `¡Listo! Tu tienda ya está en ${storeUrl(store.slug!)}. ${checkoutHint} ${stockHint}${continuityHint}\n\nMandame una foto de tu primer producto.`,
    });
    return replies;
  }

  // Ensure store exists when in idle/product/stock flows
  let store = await getStoreForChannelIdentity(msg.from);

  if (state === "IDLE") {
    const menuGroup = matchMenuGroup(msg.text, choice ?? msg.choiceId);
    if (menuGroup) {
      replies.push(groupMenuMessage(menuGroup, caps, msg.from));
      return replies;
    }
    if (choice === CHOICE.MENU_BACK || msg.choiceId === CHOICE.MENU_BACK) {
      replies.push(menuMessage(caps, msg.from));
      return replies;
    }
    if (choice === CHOICE.MENU_ADD || msg.choiceId === CHOICE.MENU_ADD) {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push({ kind: "text", text: "Mandame la foto del producto." });
      return replies;
    }
    if (choice === CHOICE.MENU_STORE || msg.choiceId === CHOICE.MENU_STORE) {
      if (store?.slug) {
        replies.push(storeLinkReply(store));
      } else {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
      }
      return replies;
    }
    if (choice === CHOICE.MENU_CONTACT || msg.choiceId === CHOICE.MENU_CONTACT) {
      if (!store) {
        replies.push({
          kind: "text",
          text: "Todavía no terminamos de armar tu tienda.",
        });
        return replies;
      }
      return startContactEditFlow(store, draft, setState, caps, msg);
    }
    if (choice === CHOICE.MENU_LINK_WA || msg.choiceId === CHOICE.MENU_LINK_WA) {
      return startGenerateLinkCode(msg, store, caps);
    }
    if (choice === CHOICE.MENU_STOCK || msg.choiceId === CHOICE.MENU_STOCK) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openStockHub(store, draft, setState, caps);
    }
    if (choice === CHOICE.MENU_PRICE || msg.choiceId === CHOICE.MENU_PRICE) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return startPriceEditFlow(store, draft, setState, caps, msg.from, undefined);
    }
    if (choice === CHOICE.MENU_PHOTO || msg.choiceId === CHOICE.MENU_PHOTO) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return startPhotoEditFlow(store, draft, setState, caps, msg.from, undefined);
    }
    if (choice === CHOICE.MENU_ICON || msg.choiceId === CHOICE.MENU_ICON) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openStoreIconHub(store, draft, setState, caps, msg.from);
    }
    if (
      choice === CHOICE.ICON_UPLOAD ||
      msg.choiceId === CHOICE.ICON_UPLOAD
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      if (msg.media?.kind === "image") {
        return applyUploadedStoreIcon(
          store,
          draft,
          setState,
          caps,
          msg.from,
          msg,
        );
      }
      return askStoreIconUpload(store, draft, setState, caps, msg.from);
    }
    if (
      choice === CHOICE.ICON_GENERATE ||
      msg.choiceId === CHOICE.ICON_GENERATE
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return startStoreIconGenerate(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg.text,
      );
    }
    if (msg.media?.kind === "image") {
      const caption = normalizeLoose(msg.text ?? "");
      if (
        store &&
        (/\b(icono|ícono)\b/.test(caption) ||
          /logo de (la )?(app|tienda)/.test(caption) ||
          /sub(ir|í|i).*(icono|ícono|logo)/.test(caption))
      ) {
        return applyUploadedStoreIcon(
          store,
          draft,
          setState,
          caps,
          msg.from,
          msg,
        );
      }
      return startProductFromImage(msg, draft, caps, setState);
    }

    if (msg.text && store?.slug && wantsStoreLinkText(msg.text)) {
      replies.push(storeLinkReply(store));
      replies.push(menuMessage(caps, msg.from));
      return replies;
    }
    if (msg.text && wantsGenerateLinkCodeText(msg.text)) {
      return startGenerateLinkCode(msg, store, caps);
    }
    if (
      msg.text &&
      wantsLinkExistingAccountText(msg.text) &&
      isWhatsAppContactPhone(msg.from)
    ) {
      await setState("ASK_LINK_CODE", clearStockDraft(draft));
      replies.push(askLinkCodePrompt());
      return replies;
    }
    if (msg.text && store && wantsContactPhoneText(msg.text)) {
      return startContactEditFlow(store, draft, setState, caps, msg);
    }

    const action = msg.text ? await interpretFreeText(msg.text) : { intent: "unknown" as const };
    if (action.intent === "menu" || action.intent === "help") {
      return action.intent === "help"
        ? [helpMessage()]
        : [menuMessage(caps, msg.from)];
    }
    if (action.intent === "create_product") {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push({ kind: "text", text: "Mandame la foto del producto." });
      return replies;
    }
    if ((action.intent === "list_stock" || action.intent === "manage_stock") && store) {
      if (action.intent === "list_stock") {
        const products = await listProductsByStore(store.id, { includeHidden: true });
        replies.push({ kind: "text", text: formatProductList(products, store) });
        replies.push(menuMessage(caps, msg.from));
        return replies;
      }
      // "pausar/reactivar X" llega a veces como manage_stock
      const spoken = await trySpokenStockConfirm(
        store,
        draft,
        setState,
        caps,
        msg.text ?? action.productHint,
      );
      if (spoken) return spoken;
      return openStockHub(store, draft, setState, caps);
    }
    if (action.intent === "set_price" && store) {
      return startPriceEditFlow(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg.text ?? action.productHint,
      );
    }
    if (action.intent === "change_photo" && store) {
      return startPhotoEditFlow(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg.text ?? action.productHint,
      );
    }
    if (action.intent === "upload_icon" && store) {
      // Imagen + choice icon_upload ya se resolvió arriba; acá pedimos la foto.
      return askStoreIconUpload(store, draft, setState, caps, msg.from);
    }
    if (action.intent === "generate_icon" && store) {
      const wantsUpload = /sub(ir|í|i)|mand(ar|á|a)|cargar|propio/.test(
        normalizeLoose(msg.text ?? ""),
      );
      if (wantsUpload) {
        return askStoreIconUpload(store, draft, setState, caps, msg.from);
      }
      // Pedidos claros de armar → generar; “icono” genérico → hub (armar o subir).
      const wantsGenerate =
        /(gener(ar|á|a)|arm(ar|á|a)|hac(er|é|e)|cre(ar|á|a)|dibuj(ar|á|a)|cambi(ar|á|a)|nuevo)/.test(
          normalizeLoose(msg.text ?? ""),
        );
      if (wantsGenerate) {
        return startStoreIconGenerate(
          store,
          draft,
          setState,
          caps,
          msg.from,
          msg.text,
        );
      }
      return openStoreIconHub(store, draft, setState, caps, msg.from);
    }
    if (action.intent === "mark_out_of_stock" && store) {
      const spoken = await trySpokenStockConfirm(
        store,
        draft,
        setState,
        caps,
        msg.text ?? action.productHint,
        "pause",
      );
      if (spoken) return spoken;
      return openStockHub(store, draft, setState, caps, [
        {
          kind: "text",
          text: "No encontré ese producto. Elegí uno y confirmamos antes de guardar.",
        },
      ]);
    }

    replies.push({
      kind: "text",
      text: "Mandame una foto para cargar un producto, o pedime el menú.",
    });
    replies.push(menuMessage(caps, msg.from));
    return replies;
  }

  if (state === "STOCK_HUB" && store) {
    if (choice === CHOICE.MENU_BACK || choice === CHOICE.MENU_HELP) {
      draft = clearStockDraft(draft);
      await setState("IDLE", draft);
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.STOCK_LIST) {
      const products = await listProductsByStore(store.id, { includeHidden: true });
      const listMsg: OutboundMessage = {
        kind: "text",
        text: formatProductList(products, store),
      };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_HUB",
        stockHubMessage(store, caps),
        [listMsg],
      );
    }
    if (choice === CHOICE.STOCK_PICK) {
      const products = await listProductsByStore(store.id, { includeHidden: true });
      if (products.length === 0) {
        return replyWithChoices(
          draft,
          setState,
          "STOCK_HUB",
          stockHubMessage(store, caps),
          [{ kind: "text", text: "Todavía no hay productos. Mandame una foto para cargar uno." }],
        );
      }
      return replyWithChoices(
        draft,
        setState,
        "STOCK_PICK",
        withOptions("¿Cuál producto?", productPickOptions(products), caps),
      );
    }
    if (choice === CHOICE.STOCK_MODE) {
      const nextMode = !store.tracksQuantity;
      draft = {
        ...clearStockDraft(draft),
        stockAction: "set_mode",
        stockModePending: nextMode,
      };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, null, store, caps),
      );
    }
    if (msg.text?.trim()) {
      if (wantsContactPhoneText(msg.text)) {
        return startContactEditFlow(store, draft, setState, caps, msg);
      }
      if (store.slug && wantsStoreLinkText(msg.text)) {
        draft = clearStockDraft(draft);
        await setState("IDLE", draft);
        return [storeLinkReply(store), menuMessage(caps, msg.from)];
      }
      return replyWithChoices(
        draft,
        setState,
        "STOCK_HUB",
        stockHubMessage(store, caps),
        [
          {
            kind: "text",
            text: "No atrapé eso. Tocá Volver al menú para Ver mi tienda o WhatsApp pedidos.",
          },
        ],
      );
    }
    return replyWithChoices(draft, setState, "STOCK_HUB", stockHubMessage(store, caps));
  }

  if (state === "STOCK_PICK" && store) {
    const productId = choice?.startsWith(CHOICE.STOCK_PROD_PREFIX)
      ? choice.slice(CHOICE.STOCK_PROD_PREFIX.length)
      : undefined;
    if (!productId) {
      const products = await listProductsByStore(store.id, { includeHidden: true });
      return replyWithChoices(
        draft,
        setState,
        "STOCK_PICK",
        withOptions("Elegí un producto de la lista:", productPickOptions(products), caps),
      );
    }
    const product = await getProduct(productId);
    if (!product || product.storeId !== store.id) {
      replies.push({ kind: "text", text: "No encontré ese producto." });
      return openStockHub(store, draft, setState, caps);
    }
    // Venimos de audio/texto "pausá X" / "cambiar precio de X" con varios matches
    if (draft.stockAction === "pause" || draft.stockAction === "resume") {
      return goToStockConfirm(
        store,
        draft,
        setState,
        caps,
        product,
        draft.stockAction,
      );
    }
    if (draft.stockAction === "set_price") {
      return continuePriceEdit(
        store,
        draft,
        setState,
        caps,
        product,
        draft.stockPricePending ?? null,
      );
    }
    if (draft.stockAction === "change_photo") {
      return continuePhotoEdit(store, draft, setState, product);
    }
    draft = { ...draft, stockProductId: product.id };
    return replyWithChoices(
      draft,
      setState,
      "STOCK_ACTIONS",
      withOptions(
        `${productStatusLine(product, store)}\n¿Qué hacemos?`,
        productActionOptions(product, store),
        caps,
      ),
    );
  }

  if (state === "STOCK_ACTIONS" && store) {
    const product = draft.stockProductId
      ? await getProduct(draft.stockProductId)
      : null;
    if (!product || product.storeId !== store.id) {
      return openStockHub(store, clearStockDraft(draft), setState, caps, [
        { kind: "text", text: "No encontré ese producto." },
      ]);
    }
    if (choice === CHOICE.CHANGE) {
      const products = await listProductsByStore(store.id, { includeHidden: true });
      draft = { ...draft, stockProductId: undefined, stockAction: undefined };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_PICK",
        withOptions("¿Cuál producto?", productPickOptions(products), caps),
      );
    }
    if (choice === CHOICE.STOCK_PAUSE) {
      draft = { ...draft, stockAction: "pause" };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, product, store, caps),
      );
    }
    if (choice === CHOICE.STOCK_RESUME) {
      if (store.tracksQuantity) {
        draft = { ...draft, stockAction: "resume" };
        await setState("STOCK_QTY", draft);
        return [
          {
            kind: "text",
            text: `¿Cuántas unidades de "${product.title}" quedan? Decime un número (puede ser 0), por texto o audio.`,
          },
        ];
      }
      draft = { ...draft, stockAction: "resume" };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, product, store, caps),
      );
    }
    if (choice === CHOICE.STOCK_SET_QTY) {
      draft = { ...draft, stockAction: "set_qty" };
      await setState("STOCK_QTY", draft);
      return [
        {
          kind: "text",
          text: `¿Cuántas unidades de "${product.title}" quedan? Decime un número, por texto o audio.`,
        },
      ];
    }
    if (choice === CHOICE.STOCK_SET_PRICE) {
      return continuePriceEdit(store, draft, setState, caps, product, null);
    }
    if (choice === CHOICE.STOCK_CHANGE_PHOTO) {
      return continuePhotoEdit(store, draft, setState, product);
    }
    if (choice === CHOICE.STOCK_HIDE) {
      draft = { ...draft, stockAction: "hide" };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, product, store, caps),
      );
    }
    if (choice === CHOICE.STOCK_SHOW) {
      draft = { ...draft, stockAction: "show" };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, product, store, caps),
      );
    }
    return replyWithChoices(
      draft,
      setState,
      "STOCK_ACTIONS",
      withOptions(
        `${productStatusLine(product, store)}\n¿Qué hacemos?`,
        productActionOptions(product, store),
        caps,
      ),
    );
  }

  if (state === "STOCK_QTY" && store) {
    const product = draft.stockProductId
      ? await getProduct(draft.stockProductId)
      : null;
    if (!product || product.storeId !== store.id) {
      return openStockHub(store, clearStockDraft(draft), setState, caps);
    }
    const qty = msg.text ? parseQuantityInput(msg.text) : null;
    if (qty == null) {
      replies.push({
        kind: "text",
        text: "Necesito un número entero (por ejemplo 0, 1 o 3).",
      });
      return replies;
    }
    draft = {
      ...draft,
      stockQtyPending: qty,
      stockAction: draft.stockAction === "resume" ? "set_qty" : draft.stockAction ?? "set_qty",
    };
    return replyWithChoices(
      draft,
      setState,
      "STOCK_CONFIRM",
      confirmStockMessage(draft, product, store, caps),
    );
  }

  if (state === "STOCK_CONFIRM" && store) {
    const text = msg.text?.trim() ?? "";
    const idleEditFlow =
      draft.stockAction === "set_price" || draft.stockAction === "change_photo";
    if (choice === CHOICE.NO || isNegative(text)) {
      if (idleEditFlow) {
        await setState("IDLE", clearStockDraft(draft));
        return [
          { kind: "text", text: "No guardé nada." },
          menuMessage(caps, msg.from),
        ];
      }
      return openStockHub(store, clearStockDraft(draft), setState, caps, [
        { kind: "text", text: "No guardé nada." },
      ]);
    }
    if (!(choice === CHOICE.YES || isAffirmative(text))) {
      const product = draft.stockProductId
        ? await getProduct(draft.stockProductId)
        : null;
      const confirmMsg = confirmStockMessage(draft, product, store, caps);
      const preview =
        draft.stockAction === "change_photo" && draft.stockPhotoUrlPending
          ? ([
              {
                kind: "image" as const,
                url: draft.stockPhotoUrlPending,
                caption: "Así quedaría la foto nueva",
              },
            ] satisfies OutboundMessage[])
          : undefined;
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmMsg,
        preview,
      );
    }

    const applied = await applyStockAction(store, draft);
    revalidateStore(store.slug);
    store = (await getStoreForChannelIdentity(msg.from)) ?? store;
    if (idleEditFlow) {
      await setState("IDLE", clearStockDraft(draft));
      return [{ kind: "text", text: applied }, menuMessage(caps, msg.from)];
    }
    return openStockHub(store, clearStockDraft(draft), setState, caps, [
      { kind: "text", text: applied },
    ]);
  }

  if (state === "ICON_HUB" && store) {
    return handleStoreIconHub(store, draft, setState, caps, msg, choice);
  }

  if (state === "ICON_WAIT_UPLOAD" && store) {
    if (msg.media?.kind === "image") {
      return applyUploadedStoreIcon(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg,
      );
    }
    if (
      choice === CHOICE.ICON_GENERATE ||
      /(gener(ar|á|a)|arm(ar|á|a)|hac(er|é|e))/.test(normalizeLoose(msg.text ?? ""))
    ) {
      return startStoreIconGenerate(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg.text,
      );
    }
    return [
      {
        kind: "text",
        text:
          "Mandame la imagen del icono de tu tienda (cuadrada queda mejor). " +
          "Eso no cambia la foto de un producto. O tocá Que lo arme el bot.",
      },
      withOptions(
        "¿Qué preferís?",
        [
          { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
          { id: CHOICE.MENU_BACK, label: "Volver al menú" },
        ],
        caps,
      ),
    ];
  }

  if (state === "ICON_PREVIEW" && store) {
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.ICON_DONE ||
      choice === CHOICE.YES ||
      isAffirmative(text)
    ) {
      await setState("IDLE", draft);
      return [
        {
          kind: "text",
          text: store.slug
            ? `Listo. Ese icono queda para tu tienda: ${storeUrl(store.slug)} (también al agregar la tienda al inicio del celular).`
            : "Listo. Ese icono queda guardado para tu tienda.",
        },
        menuMessage(caps, msg.from),
      ];
    }
    if (
      choice === CHOICE.ICON_UPLOAD ||
      /sub(ir|í|i)|mand(ar|á|a) (mi )?(icono|imagen|foto|logo)|cargar/.test(
        normalizeLoose(text),
      )
    ) {
      if (msg.media?.kind === "image") {
        return applyUploadedStoreIcon(
          store,
          draft,
          setState,
          caps,
          msg.from,
          msg,
        );
      }
      return askStoreIconUpload(store, draft, setState, caps, msg.from);
    }
    if (
      choice === CHOICE.ICON_REGEN ||
      choice === CHOICE.ICON_GENERATE ||
      choice === CHOICE.CHANGE ||
      /regener|otro|armar|generar|cambiar|nueva?/.test(normalizeLoose(text))
    ) {
      return startStoreIconGenerate(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg.text,
      );
    }
    if (msg.media?.kind === "image") {
      return applyUploadedStoreIcon(
        store,
        draft,
        setState,
        caps,
        msg.from,
        msg,
      );
    }
    replies.push({
      kind: "text",
      text:
        "Tocá Listo si te gusta. Podés pedir Generar otro o Subir mi icono (una imagen tuya). Escribí cancelar para salir.",
    });
    if (store.icon512Url) {
      replies.push({
        kind: "image",
        url: store.icon512Url,
        caption: "Tu icono actual",
      });
    }
    replies.push(
      withOptions(
        "¿Qué hacemos?",
        [
          { id: CHOICE.ICON_REGEN, label: "Generar otro" },
          { id: CHOICE.ICON_UPLOAD, label: "Subir mi icono" },
          { id: CHOICE.ICON_DONE, label: "Listo" },
        ],
        caps,
      ),
    );
    return replies;
  }

  if (state === "PHOTO_INPUT" && store) {
    const product = draft.stockProductId
      ? await getProduct(draft.stockProductId)
      : null;
    if (!product || product.storeId !== store.id) {
      await setState("IDLE", clearStockDraft(draft));
      return [
        { kind: "text", text: "No encontré ese producto." },
        menuMessage(caps, msg.from),
      ];
    }
    if (msg.media?.kind !== "image") {
      replies.push({
        kind: "text",
        text: `Necesito la foto nueva de "${product.title}". Mandamela cuando puedas (o escribí cancelar).`,
      });
      return replies;
    }
    const resolved = await resolveInboundImage(msg);
    const nextDraft: ConversationDraft = {
      ...draft,
      stockAction: "change_photo",
      stockPhotoUrlPending: resolved.imageUrl,
      stockPhotoBlobKeyPending: resolved.imageBlobKey,
    };
    return replyWithChoices(
      nextDraft,
      setState,
      "STOCK_CONFIRM",
      confirmStockMessage(nextDraft, product, store, caps),
      [
        {
          kind: "image",
          url: resolved.imageUrl,
          caption: "Así quedaría la foto nueva",
        },
      ],
    );
  }

  if (state === "PRICE_INPUT" && store) {
    const product = draft.stockProductId
      ? await getProduct(draft.stockProductId)
      : null;
    if (!product || product.storeId !== store.id) {
      await setState("IDLE", clearStockDraft(draft));
      return [
        { kind: "text", text: "No encontré ese producto." },
        menuMessage(caps, msg.from),
      ];
    }
    const price = msg.text ? parsePriceToCents(msg.text) : null;
    if (price == null) {
      replies.push({
        kind: "text",
        text: `No entendí el precio. Hoy "${product.title}" sale ${formatPriceArs(product.priceCents)}. Probá con 15 mil o 15000 (texto o audio).`,
      });
      return replies;
    }
    return continuePriceEdit(store, draft, setState, caps, product, price);
  }

  if (state === "PRODUCT_PHOTO") {
    if (msg.media?.kind === "image") {
      return startProductFromImage(msg, draft, caps, setState);
    }
    replies.push({ kind: "text", text: "Necesito la foto del producto. Mandamela cuando puedas." });
    return replies;
  }

  if (state === "PRODUCT_TITLE") {
    const title = msg.text?.trim();
    if (!title) {
      replies.push({
        kind: "text",
        text: "¿Cómo se llama el producto? Podés escribirlo o mandarme un audio.",
      });

      return replies;
    }
    const product = { ...productDraft(draft), title };
    draft = { ...draft, product };
    if (product.priceCents == null) {
      await setState("PRODUCT_PRICE", draft);
      replies.push({
        kind: "text",
        text: "¿A cómo la vendés? Podés decir 15 mil o 15000 (texto o audio).",
      });
      return replies;
    }
    return replyWithChoices(
      draft,
      setState,
      "PRODUCT_DESC",
      withOptions(
        "¿Querés contar algo del producto? Podés escribir, mandar un audio o saltar.",
        [{ id: CHOICE.SKIP, label: "Saltar" }],
        caps,
      ),
    );
  }

  if (state === "PRODUCT_PRICE") {
    const price = msg.text ? parsePriceToCents(msg.text) : null;
    if (price == null) {
      replies.push({
        kind: "text",
        text: "No entendí el precio. Probá con 15 mil o 15000 (texto o audio).",
      });
      return replies;
    }
    const product = { ...productDraft(draft), priceCents: price };
    draft = { ...draft, product };
    return replyWithChoices(
      draft,
      setState,
      "PRODUCT_DESC",
      withOptions(
        "¿Querés contar algo del producto? Podés escribir, mandar un audio o saltar.",
        [{ id: CHOICE.SKIP, label: "Saltar" }],
        caps,
      ),
    );
  }

  if (state === "PRODUCT_DESC") {
    const skip =
      choice === CHOICE.SKIP ||
      msg.choiceId === CHOICE.SKIP ||
      /^saltar$/i.test(msg.text ?? "");
    const product = {
      ...productDraft(draft),
      description: skip ? undefined : msg.text?.trim(),
      skipDesc: skip,
    };
    draft = { ...draft, product };
    await setState("PRODUCT_CONFIRM", draft);
    return productConfirmMessages(product, caps);
  }

  if (state === "PRODUCT_CONFIRM") {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.CHANGE || /cambiar/.test(text.toLowerCase())) {
      await setState("PRODUCT_TITLE", draft);
      replies.push({ kind: "text", text: "¿Cómo se llama el producto?" });
      return replies;
    }
    if (choice === CHOICE.PUBLISH || isAffirmative(text) || choice === CHOICE.YES) {
      if (!store) {
        store = await upsertStore({
          channelIdentity: msg.from,
          contactPhone:
            draft.contactPhone ??
            (isWhatsAppContactPhone(msg.from)
              ? normalizeArMobileE164(msg.from)
              : null),
          ownerName: draft.ownerName,
          ownerEmail: msg.ownerEmail ?? undefined,
          name: draft.storeName,
          slug: draft.slug,
          showPhone: draft.showPhone ?? true,
          checkoutMode: draft.checkoutMode ?? "whatsapp",
          tracksQuantity: draft.tracksQuantity ?? false,
          isDemo: storeIsDemo(msg.from),
          clerkUserId: clerkUserIdFromIdentity(msg.from),
          status: "active",
        });
      }
      const p = productDraft(draft);
      const created = await createProduct({
        storeId: store.id,
        title: p.title || "Sin título",
        description: p.description,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
        imageBlobKey: p.imageBlobKey,
        quantity: store.tracksQuantity ? 1 : null,
      });
      revalidateStore(store.slug);
      draft = { ...draft, product: undefined };
      await setState("IDLE", draft);
      const qtyHint = store.tracksQuantity
        ? " Quedó con 1 unidad (podés cambiarla en Stock / pausa)."
        : "";
      replies.push({
        kind: "text",
        text: `¡Publicado! Mirá cómo quedó: ${storeUrl(store.slug!)}.${qtyHint} ¿Cargamos otra? Mandame la foto.`,
      });
      if (created.imageUrl) {
        replies.unshift({
          kind: "image",
          url: created.imageUrl,
          caption: `${created.title} · ${formatPriceArs(created.priceCents)}`,
        });
      }
      return replies;
    }
    return productConfirmMessages(productDraft(draft), caps);
  }

  await setState("IDLE", draft);
  return [menuMessage(caps, msg.from)];
}

async function openStockHub(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  extra?: OutboundMessage[],
): Promise<OutboundMessage[]> {
  const cleaned = clearStockDraft(draft);
  return replyWithChoices(cleaned, setState, "STOCK_HUB", stockHubMessage(store, caps), extra);
}

/**
 * "cambiar el precio" / "cambiar el precio de la lámpara a 20 mil":
 * lista productos o fuzzy + pide precio / confirma.
 */
async function startPriceEditFlow(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
  rawText: string | undefined,
): Promise<OutboundMessage[]> {
  const products = await listProductsByStore(store.id, { includeHidden: true });
  if (products.length === 0) {
    await setState("IDLE", clearStockDraft(draft));
    return [
      {
        kind: "text",
        text: "Todavía no hay productos. Mandame una foto para cargar uno.",
      },
      menuMessage(caps, from),
    ];
  }

  const priceHint = rawText ? parsePriceToCents(rawText) : null;
  const matches = rawText ? findProductsByHint(products, rawText) : [];

  if (matches.length === 1) {
    return continuePriceEdit(
      store,
      draft,
      setState,
      caps,
      matches[0]!,
      priceHint,
    );
  }

  const pickFrom = matches.length > 1 ? matches : products;
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockAction: "set_price",
    stockPricePending: priceHint ?? undefined,
  };
  const prompt =
    matches.length > 1
      ? "Encontré más de uno. ¿De cuál querés cambiar el precio?"
      : "¿De cuál producto querés cambiar el precio?";
  return replyWithChoices(
    nextDraft,
    setState,
    "STOCK_PICK",
    withOptions(prompt, productPickOptions(pickFrom), caps),
  );
}

async function continuePriceEdit(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  product: Product,
  priceHint: number | null,
): Promise<OutboundMessage[]> {
  if (priceHint != null) {
    const nextDraft: ConversationDraft = {
      ...clearStockDraft(draft),
      stockProductId: product.id,
      stockAction: "set_price",
      stockPricePending: priceHint,
    };
    return replyWithChoices(
      nextDraft,
      setState,
      "STOCK_CONFIRM",
      confirmStockMessage(nextDraft, product, store, caps),
    );
  }

  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockProductId: product.id,
    stockAction: "set_price",
  };
  await setState("PRICE_INPUT", nextDraft);
  return [
    {
      kind: "text",
      text: `¿A cómo querés dejar "${product.title}"? Hoy sale ${formatPriceArs(product.priceCents)}. Decime el precio nuevo (texto o audio).`,
    },
  ];
}

async function ensureStoreIconReady(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
): Promise<OutboundMessage[] | null> {
  if (!store.slug || store.status !== "active") {
    await setState("IDLE", draft);
    return [
      {
        kind: "text",
        text: "Primero terminá de armar la tienda; después armamos el icono de la tienda.",
      },
      menuMessage(caps, from),
    ];
  }
  return null;
}

/** Hub: armar con el bot o subir imagen propia (producto ≠ icono de tienda). */
async function openStoreIconHub(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(store, draft, setState, caps, from);
  if (blocked) return blocked;

  await setState("ICON_HUB", clearStockDraft(draft));
  const replies: OutboundMessage[] = [
    {
      kind: "text",
      text:
        "Icono de la tienda (el cuadrito de la app). No es la foto de un producto.\n\n" +
        "Podés pedirme que lo arme (texto o audio: «armar icono»), o subir una imagen tuya.",
    },
  ];
  if (store.icon512Url) {
    replies.push({
      kind: "image",
      url: store.icon512Url,
      caption: "Así se ve ahora",
    });
  }
  replies.push(
    withOptions(
      "¿Qué querés hacer?",
      [
        { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
        { id: CHOICE.ICON_UPLOAD, label: "Subir mi icono" },
        { id: CHOICE.MENU_BACK, label: "Volver al menú" },
      ],
      caps,
    ),
  );
  return replies;
}

async function handleStoreIconHub(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
  choice: string | undefined,
): Promise<OutboundMessage[]> {
  const text = normalizeLoose(msg.text ?? "");
  if (msg.media?.kind === "image") {
    return applyUploadedStoreIcon(store, draft, setState, caps, msg.from, msg);
  }
  if (
    choice === CHOICE.ICON_UPLOAD ||
    /sub(ir|í|i)|mand(ar|á|a)|cargar|propio/.test(text)
  ) {
    return askStoreIconUpload(store, draft, setState, caps, msg.from);
  }
  if (
    choice === CHOICE.ICON_GENERATE ||
    choice === CHOICE.ICON_REGEN ||
    /(gener(ar|á|a)|arm(ar|á|a)|hac(er|é|e)|dibuj|bot)/.test(text)
  ) {
    return startStoreIconGenerate(
      store,
      draft,
      setState,
      caps,
      msg.from,
      msg.text,
    );
  }
  if (choice === CHOICE.ICON_DONE || choice === CHOICE.MENU_BACK) {
    await setState("IDLE", draft);
    return [menuMessage(caps, msg.from)];
  }
  return openStoreIconHub(store, draft, setState, caps, msg.from);
}

async function askStoreIconUpload(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(store, draft, setState, caps, from);
  if (blocked) return blocked;

  await setState("ICON_WAIT_UPLOAD", clearStockDraft(draft));
  return [
    {
      kind: "text",
      text:
        "Mandame la imagen del icono de tu tienda (JPG o PNG; cuadrada queda mejor).\n" +
        "Esto no cambia la foto de un producto.",
    },
    withOptions(
      "Si preferís…",
      [
        { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
        { id: CHOICE.MENU_BACK, label: "Volver al menú" },
      ],
      caps,
    ),
  ];
}

async function applyUploadedStoreIcon(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(store, draft, setState, caps, from);
  if (blocked) return blocked;
  if (msg.media?.kind !== "image") {
    return askStoreIconUpload(store, draft, setState, caps, from);
  }

  let icons;
  try {
    const blob = await msg.media.fetch();
    const bytes = Buffer.from(await blob.arrayBuffer());
    icons = await buildAndUploadStoreIconsFromImage({
      storeId: store.id,
      imageBytes: bytes,
    });
  } catch (err) {
    const timedOut = err instanceof Error && /timeout/i.test(err.message);
    console.warn("[bot] store icon upload failed", err);
    await setState("ICON_WAIT_UPLOAD", draft);
    return [
      {
        kind: "text",
        text: timedOut
          ? "Tardó demasiado preparar tu icono. Probá con una imagen más chica."
          : "No pude usar esa imagen. Probá con otra JPG o PNG (no muy pesada).",
      },
      withOptions(
        "¿Qué hacemos?",
        [
          { id: CHOICE.ICON_UPLOAD, label: "Probar otra imagen" },
          { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
          { id: CHOICE.MENU_BACK, label: "Volver al menú" },
        ],
        caps,
      ),
    ];
  }

  const updated = await updateStoreIcons(store.id, {
    icon192Url: icons.icon192Url,
    icon512Url: icons.icon512Url,
    iconAppleUrl: icons.iconAppleUrl,
    // Subida raster: limpiar SVG AI/monograma previo.
    iconSvgUrl: null,
  });
  if (updated) store = updated;
  revalidateStore(store.slug);
  await setState("ICON_PREVIEW", clearStockDraft(draft));

  return [
    {
      kind: "image",
      url: icons.icon512Url,
      caption: "Así queda tu icono con la imagen que mandaste.",
    },
    withOptions(
      "¿Lo dejamos así?",
      [
        { id: CHOICE.ICON_REGEN, label: "Generar otro" },
        { id: CHOICE.ICON_UPLOAD, label: "Subir otro" },
        { id: CHOICE.ICON_DONE, label: "Listo" },
      ],
      caps,
    ),
  ];
}

/**
 * Generar / cambiar icono PWA: Gemini SVG → PNG, o composición por
 * pedido/productos/nombre (nunca monograma de iniciales como happy path).
 */
async function startStoreIconGenerate(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
  chatHint?: string,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(store, draft, setState, caps, from);
  if (blocked) return blocked;

  const designHint = extractIconDesignHint(chatHint);
  const products = await listProductsByStore(store.id, { includeHidden: true });
  let icons;
  try {
    icons = await buildAndUploadStoreIcons({
      store,
      products,
      chatHint: designHint ?? chatHint,
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && /timeout/i.test(err.message);
    console.warn("[bot] store icon pipeline failed", err);
    await setState("IDLE", draft);
    return [
      {
        kind: "text",
        text: timedOut
          ? "Tardó demasiado armar el icono (la IA o el dibujo se trabaron). Probá de nuevo en un rato, o pedime el menú."
          : "No pude armar el icono ahora. Probá de nuevo en un rato o pedime el menú.",
      },
      menuMessage(caps, from),
    ];
  }

  const updated = await updateStoreIcons(store.id, icons);
  if (updated) {
    store = updated;
  }
  revalidateStore(store.slug);
  await setState("ICON_PREVIEW", clearStockDraft(draft));

  const usedHint = icons.designHint || designHint;
  const caption = usedHint
    ? `Armé este icono con lo que pediste (“${usedHint.slice(0, 80)}”). ¿Querés otro diferente?`
    : "En base a tus productos o al nombre de la tienda te armé este icono. ¿Querés otro diferente?";

  return [
    {
      kind: "image",
      url: icons.icon512Url,
      caption,
    },
    withOptions(
      "¿Lo dejamos así?",
      [
        { id: CHOICE.ICON_REGEN, label: "Generar otro" },
        { id: CHOICE.ICON_UPLOAD, label: "Subir mi icono" },
        { id: CHOICE.ICON_DONE, label: "Listo" },
      ],
      caps,
    ),
  ];
}

/**
 * "cambiar la foto" / "cambiar la foto de la lámpara":
 * lista productos o fuzzy + pide la foto nueva + confirmación Sí/No.
 */
async function startPhotoEditFlow(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  from: string,
  rawText: string | undefined,
): Promise<OutboundMessage[]> {
  const products = await listProductsByStore(store.id, { includeHidden: true });
  if (products.length === 0) {
    await setState("IDLE", clearStockDraft(draft));
    return [
      {
        kind: "text",
        text: "Todavía no hay productos. Mandame una foto para cargar uno.",
      },
      menuMessage(caps, from),
    ];
  }

  const matches = rawText ? findProductsByHint(products, rawText) : [];

  if (matches.length === 1) {
    return continuePhotoEdit(store, draft, setState, matches[0]!);
  }

  const pickFrom = matches.length > 1 ? matches : products;
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockAction: "change_photo",
  };
  const prompt =
    matches.length > 1
      ? "Encontré más de uno. ¿De cuál querés cambiar la foto?"
      : "¿De cuál producto querés cambiar la foto?";
  return replyWithChoices(
    nextDraft,
    setState,
    "STOCK_PICK",
    withOptions(prompt, productPickOptions(pickFrom), caps),
  );
}

async function continuePhotoEdit(
  _store: Store,
  draft: ConversationDraft,
  setState: SetState,
  product: Product,
): Promise<OutboundMessage[]> {
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockProductId: product.id,
    stockAction: "change_photo",
  };
  await setState("PHOTO_INPUT", nextDraft);
  return [
    {
      kind: "text",
      text: `Mandá la foto nueva de "${product.title}". Cuando la reciba te pido confirmación antes de guardar.`,
    },
  ];
}

async function resolveInboundImage(
  msg: InboundMessage,
): Promise<{ imageUrl: string; imageBlobKey?: string }> {
  if (msg.media?.url && !msg.media.url.startsWith("data:")) {
    return { imageUrl: msg.media.url };
  }
  if (!msg.media) {
    return { imageUrl: "/api/placeholder?name=producto" };
  }
  try {
    const blob = await msg.media.fetch();
    if (msg.media.url?.startsWith("data:")) {
      const uploaded = await uploadDataUrl(
        msg.media.url,
        `product-${Date.now()}.jpg`,
      );
      return { imageUrl: uploaded.url, imageBlobKey: uploaded.pathname };
    }
    const uploaded = await uploadProductImage(
      blob,
      `product-${Date.now()}.jpg`,
      msg.media.mime || "image/jpeg",
    );
    return { imageUrl: uploaded.url, imageBlobKey: uploaded.pathname };
  } catch (err) {
    console.warn("[bot] image upload failed, using placeholder", err);
    return { imageUrl: "/api/placeholder?name=producto" };
  }
}

/**
 * Audio/texto libre tipo "pausá la lata de cerveza":
 * matchea producto y pasa a confirmación (Sí/No) sin pasar por el hub.
 */
async function trySpokenStockConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  rawText: string | undefined,
  forcedAction?: "pause" | "resume",
): Promise<OutboundMessage[] | null> {
  if (!rawText?.trim()) return null;
  const stockAction =
    forcedAction ?? detectStockActionFromText(rawText) ?? null;
  if (!stockAction) return null;

  const products = await listProductsByStore(store.id, { includeHidden: true });
  const matches = findProductsByHint(products, rawText);
  if (matches.length === 0) return null;

  if (matches.length > 1) {
    const nextDraft: ConversationDraft = {
      ...clearStockDraft(draft),
      stockAction,
    };
    return replyWithChoices(
      nextDraft,
      setState,
      "STOCK_PICK",
      withOptions(
        stockAction === "pause"
          ? "Encontré más de uno. ¿Cuál querés pausar?"
          : "Encontré más de uno. ¿Cuál querés reactivar?",
        productPickOptions(matches),
        caps,
      ),
      [
        {
          kind: "text",
          text: `Te entendí: querés ${stockAction === "pause" ? "pausar" : "reactivar"} un producto.`,
        },
      ],
    );
  }

  const product = matches[0]!;
  return goToStockConfirm(store, draft, setState, caps, product, stockAction);
}

async function goToStockConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  product: Product,
  stockAction: "pause" | "resume",
): Promise<OutboundMessage[]> {
  // Reactivar con cantidades → pedir número (igual que el hub)
  if (stockAction === "resume" && store.tracksQuantity) {
    const nextDraft: ConversationDraft = {
      ...clearStockDraft(draft),
      stockProductId: product.id,
      stockAction: "resume",
    };
    await setState("STOCK_QTY", nextDraft);
    return [
      {
        kind: "text",
        text: `¿Cuántas unidades de "${product.title}" quedan? Decime un número (puede ser 0), por texto o audio.`,
      },
    ];
  }

  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockProductId: product.id,
    stockAction,
  };
  return replyWithChoices(
    nextDraft,
    setState,
    "STOCK_CONFIRM",
    confirmStockMessage(nextDraft, product, store, caps),
  );
}

async function applyStockAction(store: Store, draft: ConversationDraft): Promise<string> {
  if (draft.stockAction === "set_mode") {
    const tracksQuantity = Boolean(draft.stockModePending);
    await upsertStore({
      channelIdentity: store.channelIdentity,
      tracksQuantity,
    });
    return tracksQuantity
      ? "Listo: ahora llevás cantidades. Podés ponerle número a cada producto."
      : "Listo: ahora solo pausás. Los productos agotados se ven como Agotado.";
  }

  const product = draft.stockProductId
    ? await getProduct(draft.stockProductId)
    : null;
  if (!product || product.storeId !== store.id) {
    return "No encontré el producto.";
  }

  if (draft.stockAction === "pause") {
    await updateProduct(product.id, {
      inStock: false,
      ...(store.tracksQuantity ? { quantity: 0 } : {}),
    });
    return `Marqué "${product.title}" como agotado.`;
  }
  if (draft.stockAction === "resume") {
    await updateProduct(product.id, { inStock: true });
    return `Reactivé "${product.title}".`;
  }
  if (draft.stockAction === "set_qty") {
    const qty = draft.stockQtyPending ?? 0;
    await updateProduct(product.id, { quantity: qty });
    return qty === 0
      ? `"${product.title}" quedó en 0 → se ve Agotado.`
      : `Guardé ${qty} unidades de "${product.title}".`;
  }
  if (draft.stockAction === "hide") {
    await updateProduct(product.id, { hidden: true });
    return `Oculté "${product.title}" de la tienda (no se borró).`;
  }
  if (draft.stockAction === "show") {
    await updateProduct(product.id, { hidden: false });
    return `Volví a mostrar "${product.title}" en la tienda.`;
  }
  if (draft.stockAction === "set_price") {
    const price = draft.stockPricePending;
    if (price == null) return "No entendí el precio nuevo.";
    await updateProduct(product.id, { priceCents: price });
    return `Listo, "${product.title}" ahora sale ${formatPriceArs(price)}.`;
  }
  if (draft.stockAction === "change_photo") {
    const imageUrl = draft.stockPhotoUrlPending;
    if (!imageUrl) return "No recibí la foto nueva.";
    await updateProduct(product.id, {
      imageUrl,
      imageBlobKey: draft.stockPhotoBlobKeyPending ?? null,
    });
    return `Listo, actualicé la foto de "${product.title}".`;
  }
  return "Listo.";
}

async function startProductFromImage(
  msg: InboundMessage,
  draft: ConversationDraft,
  caps: ChannelCapabilities,
  setState: (s: BotState, d?: ConversationDraft) => Promise<void>,
): Promise<OutboundMessage[]> {
  const { imageUrl, imageBlobKey } = await resolveInboundImage(msg);

  const hints = msg.text ? parseCaptionHints(msg.text) : {};
  const product: ProductDraft = {
    imageUrl,
    imageBlobKey,
    title: hints.title,
    priceCents: hints.priceCents,
  };
  const nextDraft = { ...draft, product };

  if (!product.title) {
    await setState("PRODUCT_TITLE", nextDraft);
    return [
      {
        kind: "text",
        text: "¿Cómo se llama el producto? Podés escribirlo o mandarme un audio.",
      },
    ];
  }
  if (product.priceCents == null) {
    await setState("PRODUCT_PRICE", nextDraft);
    return [
      {
        kind: "text",
        text: "¿A cómo la vendés? Podés decir 15 mil o 15000 (texto o audio).",
      },
    ];
  }
  const { draft: withChoices, message } = withPendingChoices(
    nextDraft,
    withOptions(
      "¿Querés contar algo del producto? Podés escribir, mandar un audio o saltar.",

      [{ id: CHOICE.SKIP, label: "Saltar" }],
      caps,
    ),
  );
  await setState("PRODUCT_DESC", withChoices);
  return [message];
}

function productConfirmMessages(
  product: ProductDraft,
  caps: ChannelCapabilities,
): OutboundMessage[] {
  const caption = `${product.title ?? "Producto"} · ${formatPriceArs(product.priceCents ?? null)}${
    product.description ? `\n${product.description}` : ""
  }`;
  const options = [
    { id: CHOICE.PUBLISH, label: "Publicar" },
    { id: CHOICE.CHANGE, label: "Cambiar algo" },
  ];
  if (product.imageUrl) {
    return imageWithOptions(product.imageUrl, caption, options, caps);
  }
  return [withOptions(`Así quedaría:\n${caption}`, options, caps)];
}

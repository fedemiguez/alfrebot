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
import { appBaseUrl } from "@/lib/env";
import { isClerkIdentity } from "@/lib/clerk";
import {
  formatPhoneDisplay,
  isWhatsAppContactPhone,
  normalizeArMobileE164,
} from "@/lib/phone";

function storeIsDemo(from: string): boolean {
  if (isClerkIdentity(from)) return false;
  return !isWhatsAppContactPhone(from);
}

function clerkUserIdFromFrom(from: string): string | null {
  return isClerkIdentity(from) ? from.slice("clerk:".length) : null;
}
import {
  createProduct,
  getConversation,
  getProduct,
  getSignupIntent,
  getStoreByPhone,
  listProductsByStore,
  markProcessed,
  saveConversation,
  slugExists,
  updateProduct,
  upsertStore,
  type ConversationDraft,
  type ProductDraft,
} from "@/lib/db/repos";
import type { Store } from "@/lib/db/schema";

export type BotState =
  | "NEW"
  | "ASK_NAME"
  | "CONFIRM_NAME"
  | "ASK_STORE"
  | "CONFIRM_SLUG"
  | "ASK_SHOW_PHONE"
  | "ASK_CONTACT_CHOICE"
  | "ASK_CONTACT_PHONE"
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
  | "STOCK_CONFIRM";

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
  return (
    /\b(whats?app|contacto|pedidos?)\b/.test(t) ||
    /numero (de )?(pedidos?|whats?app|contacto)/.test(t) ||
    /cambiar (el )?numero/.test(t)
  );
}

function wantsStoreLinkText(text: string): boolean {
  const t = normalizeLoose(text);
  return (
    /\b(ver (mi )?tienda|mi tienda|link( de)?( la)? tienda|catalogo|mi link)\b/.test(
      t,
    ) || t === "tienda"
  );
}

function menuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "¿Qué querés hacer?",
    [
      { id: CHOICE.MENU_ADD, label: "Cargar producto" },
      { id: CHOICE.MENU_STORE, label: "Ver mi tienda" },
      { id: CHOICE.MENU_STOCK, label: "Stock / pausa" },
      { id: CHOICE.MENU_CONTACT, label: "WhatsApp pedidos" },
      { id: CHOICE.MENU_HELP, label: "Ayuda" },
    ],
    caps,
  );
}

function helpMessage(): OutboundMessage {
  return {
    kind: "text",
    text:
      "Soy tu ayudante para armar la tienda. Podés mandarme fotos de tus productos y te voy guiando. También podés mandarme audios (nombre, precio, stock).\n\n" +
      "Stock: menú → Stock / pausa, o pedime el listado, pausar, reactivar o cambiar cantidad (por texto o audio).\n" +
      "WhatsApp de pedidos: el número donde te escriben los clientes (puede ser distinto al que usás para gestionar la tienda).\n" +
      "Escribí o dictá menú para ver opciones, o cancelar para frenar lo que estemos haciendo.",
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

function storeLinkReply(store: Store): OutboundMessage {
  const contact =
    store.contactPhone ||
    (isWhatsAppContactPhone(store.phone) ? store.phone : null);
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
    (isWhatsAppContactPhone(store.phone) ? store.phone : null);
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
      phone: msg.from,
      channel: msg.channel,
      state: "IDLE",
      draft,
    });
    return [
      { kind: "text", text: "Listo, cancelamos eso." },
      menuMessage(caps),
    ];
  }
  if (
    cmd === "menu" &&
    (state === "IDLE" ||
      state.startsWith("STOCK_") ||
      state.startsWith("PRODUCT_"))
  ) {
    draft = clearStockDraft({ ...draft, product: undefined });
    await saveConversation({
      phone: msg.from,
      channel: msg.channel,
      state: "IDLE",
      draft,
    });
    return [menuMessage(caps)];
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
      phone: msg.from,
      channel: msg.channel,
      state: next,
      draft,
    });
  };

  const choice = resolveChoiceId(msg.choiceId, msg.text, draft.pendingChoices);

  // ——— State machine ———
  if (state === "NEW") {
    await setState("ASK_NAME", draft);
    replies.push({
      kind: "text",
      text: "¡Hola! Soy tu ayudante para armar la tienda. ¿Cómo te llamás?",
    });
    return replies;
  }

  if (state === "ASK_NAME") {
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

      if (flow === "edit") {
        const updated = await upsertStore({
          phone: msg.from,
          contactPhone,
          showPhone: true,
        });
        revalidateStore(updated.slug);
        await setState("IDLE", draft);
        replies.push(menuMessage(caps));
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

    if (flow === "edit") {
      const updated = await upsertStore({
        phone: msg.from,
        contactPhone,
        showPhone: true,
      });
      revalidateStore(updated.slug);
      await setState("IDLE", draft);
      replies.push(menuMessage(caps));
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
      phone: msg.from,
      contactPhone,
      ownerName: draft.ownerName,
      ownerEmail: msg.ownerEmail ?? undefined,
      name: draft.storeName,
      slug: draft.slug,
      showPhone: draft.showPhone ?? true,
      checkoutMode,
      tracksQuantity,
      isDemo: storeIsDemo(msg.from),
      clerkUserId: clerkUserIdFromFrom(msg.from),
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
      ? "Podés anotar cantidades desde el menú → Stock / pausa."
      : "Podés marcar productos como Agotado desde el menú → Stock / pausa.";
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
  let store = await getStoreByPhone(msg.from);

  if (state === "IDLE") {
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
    if (choice === CHOICE.MENU_STOCK || msg.choiceId === CHOICE.MENU_STOCK) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openStockHub(store, draft, setState, caps);
    }
    if (msg.media?.kind === "image") {
      return startProductFromImage(msg, draft, caps, setState);
    }

    if (msg.text && store?.slug && wantsStoreLinkText(msg.text)) {
      replies.push(storeLinkReply(store));
      replies.push(menuMessage(caps));
      return replies;
    }
    if (msg.text && store && wantsContactPhoneText(msg.text)) {
      return startContactEditFlow(store, draft, setState, caps, msg);
    }

    const action = msg.text ? await interpretFreeText(msg.text) : { intent: "unknown" as const };
    if (action.intent === "menu" || action.intent === "help") {
      return action.intent === "help" ? [helpMessage()] : [menuMessage(caps)];
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
        replies.push(menuMessage(caps));
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
      const products = await listProductsByStore(store.id);
      const price = action.priceHint ? parsePriceToCents(action.priceHint) : null;
      if (products.length === 1 && price != null) {
        await updateProduct(products[0]!.id, { priceCents: price });
        revalidateStore(store.slug);
        replies.push({
          kind: "text",
          text: `Listo, ${products[0]!.title} ahora sale ${formatPriceArs(price)}.`,
        });
        return replies;
      }
      replies.push(menuMessage(caps));
      replies.unshift({
        kind: "text",
        text: "Para cambiar el precio decime cuál producto, o usá el menú.",
      });
      return replies;
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
    replies.push(menuMessage(caps));
    return replies;
  }

  if (state === "STOCK_HUB" && store) {
    if (choice === CHOICE.MENU_BACK || choice === CHOICE.MENU_HELP) {
      draft = clearStockDraft(draft);
      await setState("IDLE", draft);
      return [menuMessage(caps)];
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
        return [storeLinkReply(store), menuMessage(caps)];
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
    // Venimos de audio/texto "pausá X" con varios matches → ya sabemos la acción
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
    if (choice === CHOICE.NO || isNegative(text)) {
      return openStockHub(store, clearStockDraft(draft), setState, caps, [
        { kind: "text", text: "No guardé nada." },
      ]);
    }
    if (!(choice === CHOICE.YES || isAffirmative(text))) {
      const product = draft.stockProductId
        ? await getProduct(draft.stockProductId)
        : null;
      return replyWithChoices(
        draft,
        setState,
        "STOCK_CONFIRM",
        confirmStockMessage(draft, product, store, caps),
      );
    }

    const applied = await applyStockAction(store, draft);
    revalidateStore(store.slug);
    store = (await getStoreByPhone(msg.from)) ?? store;
    return openStockHub(store, clearStockDraft(draft), setState, caps, [
      { kind: "text", text: applied },
    ]);
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
          phone: msg.from,
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
          clerkUserId: clerkUserIdFromFrom(msg.from),
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
  return [menuMessage(caps)];
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
      phone: store.phone,
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
  return "Listo.";
}

async function startProductFromImage(
  msg: InboundMessage,
  draft: ConversationDraft,
  caps: ChannelCapabilities,
  setState: (s: BotState, d?: ConversationDraft) => Promise<void>,
): Promise<OutboundMessage[]> {
  let imageUrl: string | undefined;
  let imageBlobKey: string | undefined;

  if (msg.media?.url && !msg.media.url.startsWith("data:")) {
    imageUrl = msg.media.url;
  } else if (msg.media) {
    try {
      const blob = await msg.media.fetch();
      if (msg.media.url?.startsWith("data:")) {
        const uploaded = await uploadDataUrl(msg.media.url, `piece-${Date.now()}.jpg`);
        imageUrl = uploaded.url;
        imageBlobKey = uploaded.pathname;
      } else {
        const uploaded = await uploadProductImage(
          blob,
          `piece-${Date.now()}.jpg`,
          msg.media.mime || "image/jpeg",
        );
        imageUrl = uploaded.url;
        imageBlobKey = uploaded.pathname;
      }
    } catch (err) {
      console.warn("[bot] image upload failed, using placeholder", err);
      imageUrl = "/api/placeholder?name=producto";
    }
  }

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
  const caption = `${product.title ?? "Pieza"} · ${formatPriceArs(product.priceCents ?? null)}${
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

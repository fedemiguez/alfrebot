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
  formatProductList,
  parseQuantityInput,
  productActionOptions,
  productPickOptions,
  productStatusLine,
  resolveChoiceId,
  stockHubMessage,
  withPendingChoices,
} from "@/lib/bot/stock";
import { uploadDataUrl, uploadProductImage } from "@/lib/blob";
import { appBaseUrl } from "@/lib/env";
import {
  formatPhoneDisplay,
  isWhatsAppContactPhone,
  normalizeArMobileE164,
} from "@/lib/phone";
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
  if (choiceId === CHOICE.MENU_HELP || choiceId === "help") return "help";
  if (choiceId === CHOICE.MENU_ADD) return null;
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (t === "menu" || t === "menú") return "menu";
  if (t === "ayuda" || t === "help") return "help";
  if (t === "cancelar") return "cancel";
  return null;
}

function menuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "¿Qué querés hacer?",
    [
      { id: CHOICE.MENU_ADD, label: "Cargar pieza" },
      { id: CHOICE.MENU_STORE, label: "Ver mi tienda" },
      { id: CHOICE.MENU_STOCK, label: "Stock / pausa" },
      { id: CHOICE.MENU_HELP, label: "Ayuda" },
    ],
    caps,
  );
}

function helpMessage(): OutboundMessage {
  return {
    kind: "text",
    text:
      "Soy tu ayudante para armar la tienda. Podés mandarme fotos de tus piezas y te voy guiando.\n\n" +
      "Stock: escribí menú → Stock / pausa, o pedime el listado, pausar, reactivar o cambiar cantidad.\n" +
      "Escribí menú para ver opciones, o cancelar para frenar lo que estemos haciendo.",
  };
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
  if (cmd === "menu" && (state === "IDLE" || state.startsWith("STOCK_"))) {
    draft = clearStockDraft(draft);
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
    // Si quieren mostrar número pero el canal no es un WA AR válido (p.ej. simulador +0…),
    // pedimos el celular real para Lo quiero / pie de tienda.
    if (showPhone && !isWhatsAppContactPhone(msg.from)) {
      await setState("ASK_CONTACT_PHONE", draft);
      replies.push({
        kind: "text",
        text: "¿A qué WhatsApp te escriben los clientes? Mandame tu celular con código de área, por ejemplo 11 1234-5678.",
      });
      return replies;
    }
    if (showPhone && isWhatsAppContactPhone(msg.from)) {
      draft = {
        ...draft,
        contactPhone: normalizeArMobileE164(msg.from) ?? undefined,
      };
    }
    return replyWithChoices(
      draft,
      setState,
      "ASK_STOCK_MODE",
      withOptions(
        "¿Cómo querés manejar el stock?\n\n• Llevar cantidades: vas anotando cuántas unidades quedan de cada pieza.\n• Solo pausar: marcás agotado / volvió, sin números.",
        [
          { id: CHOICE.STOCK_QTY_MODE, label: "Llevar cantidades" },
          { id: CHOICE.STOCK_PAUSE_MODE, label: "Solo pausar" },
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
    draft = { ...draft, contactPhone, showPhone: true };
    replies.push({
      kind: "text",
      text: `Perfecto, en la tienda va a figurar ${formatPhoneDisplay(contactPhone)}.`,
    });
    return replyWithChoices(
      draft,
      setState,
      "ASK_STOCK_MODE",
      withOptions(
        "¿Cómo querés manejar el stock?\n\n• Llevar cantidades: vas anotando cuántas unidades quedan de cada pieza.\n• Solo pausar: marcás agotado / volvió, sin números.",
        [
          { id: CHOICE.STOCK_QTY_MODE, label: "Llevar cantidades" },
          { id: CHOICE.STOCK_PAUSE_MODE, label: "Solo pausar" },
        ],
        caps,
      ),
    );
  }

  if (state === "ASK_STOCK_MODE") {
    const text = msg.text?.trim() ?? "";
    let tracksQuantity: boolean | null = null;
    if (choice === CHOICE.STOCK_QTY_MODE || /cantidad/.test(text.toLowerCase())) {
      tracksQuantity = true;
    } else if (
      choice === CHOICE.STOCK_PAUSE_MODE ||
      /pausar|solo pausa|sin cantidad/.test(text.toLowerCase())
    ) {
      tracksQuantity = false;
    }
    if (tracksQuantity == null) {
      return replyWithChoices(
        draft,
        setState,
        "ASK_STOCK_MODE",
        withOptions(
          "Elegí cómo manejar el stock:",
          [
            { id: CHOICE.STOCK_QTY_MODE, label: "Llevar cantidades" },
            { id: CHOICE.STOCK_PAUSE_MODE, label: "Solo pausar" },
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
        "¿Cómo querés que te pidan? Por defecto cada pieza tiene un botón Lo quiero que te escribe por WhatsApp. También podés armar un carrito y mandar el pedido junto (igual por WhatsApp, sin cobro online).",
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
      name: draft.storeName,
      slug: draft.slug,
      showPhone: draft.showPhone ?? true,
      checkoutMode,
      tracksQuantity,
      isDemo: msg.channel === "simulator",
      status: "active",
    });
    draft = clearStockDraft({ ...draft, checkoutMode, tracksQuantity });
    revalidateStore(store.slug);
    await setState("IDLE", draft);
    const checkoutHint =
      checkoutMode === "cart"
        ? "En tu catálogo van a poder armar un pedido y mandártelo por WhatsApp."
        : "En tu catálogo cada pieza tiene Lo quiero para escribirte por WhatsApp.";
    const stockHint = tracksQuantity
      ? "Podés anotar cantidades desde el menú → Stock / pausa."
      : "Podés pausar piezas (Agotado) desde el menú → Stock / pausa.";
    replies.push({
      kind: "text",
      text: `¡Listo! Tu tienda ya está en ${storeUrl(store.slug!)}. ${checkoutHint} ${stockHint}\n\nMandame una foto de tu primera pieza.`,
    });
    return replies;
  }

  // Ensure store exists when in idle/product/stock flows
  let store = await getStoreByPhone(msg.from);

  if (state === "IDLE") {
    if (choice === CHOICE.MENU_ADD || msg.choiceId === CHOICE.MENU_ADD) {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push({ kind: "text", text: "Mandame la foto de la pieza." });
      return replies;
    }
    if (choice === CHOICE.MENU_STORE || msg.choiceId === CHOICE.MENU_STORE) {
      if (store?.slug) {
        replies.push({
          kind: "text",
          text: `Acá está tu tienda: ${storeUrl(store.slug)}`,
        });
      } else {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
      }
      return replies;
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

    const action = msg.text ? await interpretFreeText(msg.text) : { intent: "unknown" as const };
    if (action.intent === "menu" || action.intent === "help") {
      return action.intent === "help" ? [helpMessage()] : [menuMessage(caps)];
    }
    if (action.intent === "create_product") {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push({ kind: "text", text: "Mandame la foto de la pieza." });
      return replies;
    }
    if ((action.intent === "list_stock" || action.intent === "manage_stock") && store) {
      if (action.intent === "list_stock") {
        const products = await listProductsByStore(store.id, { includeHidden: true });
        replies.push({ kind: "text", text: formatProductList(products, store) });
        replies.push(menuMessage(caps));
        return replies;
      }
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
        text: "Para cambiar el precio decime cuál pieza, o usá el menú.",
      });
      return replies;
    }
    if (action.intent === "mark_out_of_stock" && store) {
      return openStockHub(store, draft, setState, caps, [
        {
          kind: "text",
          text: "Para marcar agotado elegí la pieza y confirmamos antes de guardar.",
        },
      ]);
    }

    replies.push({
      kind: "text",
      text: "Mandame una foto para cargar una pieza, o pedime el menú.",
    });
    replies.push(menuMessage(caps));
    return replies;
  }

  if (state === "STOCK_HUB" && store) {
    if (choice === CHOICE.MENU_HELP) {
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
          [{ kind: "text", text: "Todavía no hay piezas. Mandame una foto para cargar una." }],
        );
      }
      return replyWithChoices(
        draft,
        setState,
        "STOCK_PICK",
        withOptions("¿Cuál pieza?", productPickOptions(products), caps),
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
        withOptions("Elegí una pieza de la lista:", productPickOptions(products), caps),
      );
    }
    const product = await getProduct(productId);
    if (!product || product.storeId !== store.id) {
      replies.push({ kind: "text", text: "No encontré esa pieza." });
      return openStockHub(store, draft, setState, caps);
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
        { kind: "text", text: "No encontré esa pieza." },
      ]);
    }
    if (choice === CHOICE.CHANGE) {
      const products = await listProductsByStore(store.id, { includeHidden: true });
      draft = { ...draft, stockProductId: undefined, stockAction: undefined };
      return replyWithChoices(
        draft,
        setState,
        "STOCK_PICK",
        withOptions("¿Cuál pieza?", productPickOptions(products), caps),
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
            text: `¿Cuántas unidades de "${product.title}" quedan? Escribí un número (puede ser 0).`,
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
          text: `¿Cuántas unidades de "${product.title}" quedan? Escribí un número.`,
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
    replies.push({ kind: "text", text: "Necesito la foto de la pieza. Mandamela cuando puedas." });
    return replies;
  }

  if (state === "PRODUCT_TITLE") {
    const title = msg.text?.trim();
    if (!title) {
      replies.push({ kind: "text", text: "¿Cómo se llama la pieza?" });
      return replies;
    }
    const product = { ...productDraft(draft), title };
    draft = { ...draft, product };
    if (product.priceCents == null) {
      await setState("PRODUCT_PRICE", draft);
      replies.push({ kind: "text", text: "¿A cómo la vendés? Podés decir 15 mil o 15000." });
      return replies;
    }
    return replyWithChoices(
      draft,
      setState,
      "PRODUCT_DESC",
      withOptions(
        "¿Querés contar algo de la pieza? Podés escribir o saltar.",
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
        text: "No entendí el precio. Probá con 15 mil o 15000.",
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
        "¿Querés contar algo de la pieza? Podés escribir o saltar.",
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
      replies.push({ kind: "text", text: "¿Cómo se llama la pieza?" });
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
          name: draft.storeName,
          slug: draft.slug,
          showPhone: draft.showPhone ?? true,
          checkoutMode: draft.checkoutMode ?? "whatsapp",
          tracksQuantity: draft.tracksQuantity ?? false,
          isDemo: msg.channel === "simulator",
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

async function applyStockAction(store: Store, draft: ConversationDraft): Promise<string> {
  if (draft.stockAction === "set_mode") {
    const tracksQuantity = Boolean(draft.stockModePending);
    await upsertStore({
      phone: store.phone,
      tracksQuantity,
    });
    return tracksQuantity
      ? "Listo: ahora llevás cantidades. Podés ponerle número a cada pieza."
      : "Listo: ahora solo pausás. Las piezas agotadas se ven como Agotado.";
  }

  const product = draft.stockProductId
    ? await getProduct(draft.stockProductId)
    : null;
  if (!product || product.storeId !== store.id) {
    return "No encontré la pieza.";
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
      imageUrl = "/api/placeholder?name=pieza";
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
    return [{ kind: "text", text: "¿Cómo se llama la pieza?" }];
  }
  if (product.priceCents == null) {
    await setState("PRODUCT_PRICE", nextDraft);
    return [
      {
        kind: "text",
        text: "¿A cómo la vendés? Podés decir 15 mil o 15000.",
      },
    ];
  }
  const { draft: withChoices, message } = withPendingChoices(
    nextDraft,
    withOptions(
      "¿Querés contar algo de la pieza? Podés escribir o saltar.",
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

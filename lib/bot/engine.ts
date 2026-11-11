import { revalidateTag } from "next/cache";
import type { ChannelCapabilities, InboundMessage, OutboundMessage } from "@/lib/channels/types";
import { CHOICE, imageWithOptions, withOptions } from "@/lib/bot/render";
import {
  extractSignupCode,
  formatPriceArs,
  interpretFreeText,
  isAffirmative,
  isNegative,
  parseCaptionHints,
  parsePriceToCents,
} from "@/lib/bot/nlu";
import { uniqueSlug } from "@/lib/bot/slug";
import { uploadDataUrl, uploadProductImage } from "@/lib/blob";
import { appBaseUrl } from "@/lib/env";
import {
  createProduct,
  getConversation,
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

export type BotState =
  | "NEW"
  | "ASK_NAME"
  | "ASK_STORE"
  | "CONFIRM_SLUG"
  | "ASK_SHOW_PHONE"
  | "IDLE"
  | "PRODUCT_PHOTO"
  | "PRODUCT_TITLE"
  | "PRODUCT_PRICE"
  | "PRODUCT_DESC"
  | "PRODUCT_CONFIRM";

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
      { id: CHOICE.MENU_HELP, label: "Ayuda" },
    ],
    caps,
  );
}

function helpMessage(): OutboundMessage {
  return {
    kind: "text",
    text: "Soy tu ayudante para armar la tienda. Podés mandarme fotos de tus piezas y te voy guiando. Escribí menú cuando quieras ver opciones, o cancelar para frenar lo que estemos haciendo.",
  };
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
    draft = { ...draft, product: undefined };
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
  if (cmd === "menu" && state === "IDLE") {
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

  const setState = async (next: BotState, nextDraft?: ConversationDraft) => {
    state = next;
    if (nextDraft) draft = nextDraft;
    await saveConversation({
      phone: msg.from,
      channel: msg.channel,
      state: next,
      draft,
    });
  };

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
    const name = msg.text?.trim();
    if (!name) {
      replies.push({ kind: "text", text: "Decime tu nombre, así te hablo de vos." });
      return replies;
    }
    draft = { ...draft, ownerName: name };
    await setState("ASK_STORE", draft);
    replies.push({
      kind: "text",
      text: `Encantada, ${name}. ¿Cómo querés que se llame tu tienda?`,
    });
    return replies;
  }

  if (state === "ASK_STORE") {
    const storeName = msg.text?.trim();
    if (!storeName) {
      replies.push({ kind: "text", text: "¿Cómo se va a llamar tu tienda?" });
      return replies;
    }
    const slug = await uniqueSlug(storeName, slugExists);
    draft = { ...draft, storeName, slug };
    await setState("CONFIRM_SLUG", draft);
    replies.push(
      withOptions(
        `Tu tienda va a estar en ${appBaseUrl()}/${slug}. ¿Está bien?`,
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
    return replies;
  }

  if (state === "CONFIRM_SLUG") {
    const choice = msg.choiceId;
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.CHANGE || isNegative(text) || /cambiar/.test(text.toLowerCase())) {
      await setState("ASK_STORE", draft);
      replies.push({ kind: "text", text: "Dale, ¿cómo querés que se llame tu tienda?" });
      return replies;
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      await setState("ASK_SHOW_PHONE", draft);
      replies.push(
        withOptions(
          "¿Querés que en la tienda aparezca tu número para que te escriban?",
          [
            { id: CHOICE.YES, label: "Sí" },
            { id: CHOICE.NO, label: "No" },
          ],
          caps,
        ),
      );
      return replies;
    }
    replies.push(
      withOptions(
        "¿Confirmamos el nombre de la tienda?",
        [
          { id: CHOICE.YES, label: "Sí" },
          { id: CHOICE.CHANGE, label: "Cambiar nombre" },
        ],
        caps,
      ),
    );
    return replies;
  }

  if (state === "ASK_SHOW_PHONE") {
    const choice = msg.choiceId;
    const text = msg.text?.trim() ?? "";
    let showPhone = true;
    if (choice === CHOICE.NO || isNegative(text)) showPhone = false;
    else if (!(choice === CHOICE.YES || isAffirmative(text))) {
      replies.push(
        withOptions(
          "¿Mostramos tu número en la tienda?",
          [
            { id: CHOICE.YES, label: "Sí" },
            { id: CHOICE.NO, label: "No" },
          ],
          caps,
        ),
      );
      return replies;
    }

    const store = await upsertStore({
      phone: msg.from,
      ownerName: draft.ownerName,
      name: draft.storeName,
      slug: draft.slug,
      showPhone,
      isDemo: msg.channel === "simulator",
      status: "active",
    });
    draft = { ...draft, showPhone };
    revalidateStore(store.slug);
    await setState("IDLE", draft);
    replies.push({
      kind: "text",
      text: `¡Listo! Tu tienda ya está en ${storeUrl(store.slug!)}. Mandame una foto de tu primera pieza.`,
    });
    return replies;
  }

  // Ensure store exists when in idle/product flows
  let store = await getStoreByPhone(msg.from);

  if (state === "IDLE") {
    if (msg.choiceId === CHOICE.MENU_ADD) {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push({ kind: "text", text: "Mandame la foto de la pieza." });
      return replies;
    }
    if (msg.choiceId === CHOICE.MENU_STORE) {
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
      const products = await listProductsByStore(store.id);
      if (products.length === 1) {
        await updateProduct(products[0]!.id, { inStock: false });
        revalidateStore(store.slug);
        replies.push({
          kind: "text",
          text: `Marqué ${products[0]!.title} como agotado.`,
        });
        return replies;
      }
    }

    replies.push({
      kind: "text",
      text: "Mandame una foto para cargar una pieza, o pedime el menú.",
    });
    replies.push(menuMessage(caps));
    return replies;
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
    await setState("PRODUCT_DESC", draft);
    replies.push(
      withOptions(
        "¿Querés contar algo de la pieza? Podés escribir o saltar.",
        [{ id: CHOICE.SKIP, label: "Saltar" }],
        caps,
      ),
    );
    return replies;
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
    await setState("PRODUCT_DESC", draft);
    replies.push(
      withOptions(
        "¿Querés contar algo de la pieza? Podés escribir o saltar.",
        [{ id: CHOICE.SKIP, label: "Saltar" }],
        caps,
      ),
    );
    return replies;
  }

  if (state === "PRODUCT_DESC") {
    const skip = msg.choiceId === CHOICE.SKIP || /^saltar$/i.test(msg.text ?? "");
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
    const choice = msg.choiceId;
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
          ownerName: draft.ownerName,
          name: draft.storeName,
          slug: draft.slug,
          showPhone: draft.showPhone ?? true,
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
      });
      revalidateStore(store.slug);
      draft = { ...draft, product: undefined };
      await setState("IDLE", draft);
      replies.push({
        kind: "text",
        text: `¡Publicado! Mirá cómo quedó: ${storeUrl(store.slug!)}. ¿Cargamos otra? Mandame la foto.`,
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
  await setState("PRODUCT_DESC", nextDraft);
  return [
    withOptions(
      "¿Querés contar algo de la pieza? Podés escribir o saltar.",
      [{ id: CHOICE.SKIP, label: "Saltar" }],
      caps,
    ),
  ];
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

import { revalidateTag } from "next/cache";
import type {
  ChannelCapabilities,
  InboundMessage,
  Option,
  OutboundMessage,
} from "@/lib/channels/types";
import {
  CHOICE,
  imageWithOptions,
  withCancelEscape,
  withOptions,
} from "@/lib/bot/render";
import {
  describeSetupPlan,
  extractPersonName,
  extractSignupCode,
  formatPriceArs,
  interpretFreeText,
  isAffirmative,
  isLogoutIntent,
  isNegative,
  isStoreCreateIntentPhrase,
  isUsableStoreName,
  mergeSetupPlan,
  parseCaptionHints,
  parsePriceToCents,
  parseSetupPlan,
} from "@/lib/bot/nlu";
import type { PendingSetupPlan } from "@/lib/db/repos";
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
  fetchClerkProfileImageBytes,
  resolveClerkProfileImageUrl,
} from "@/lib/clerk";
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
  updateStoreAccentColor,
  updateStoreBusinessKind,
  updateStoreIcons,
  updateStoreOpenNow,
  updateStoreTheme,
  updateStoreWelcomeMessage,
  upsertStore,
  type ConversationDraft,
  type ProductDraft,
} from "@/lib/db/repos";
import type { Store } from "@/lib/db/schema";
import { suggestProductMeta } from "@/lib/suggest-product-meta";
import {
  ACCENT_SWATCHES,
  matchAccentFromText,
  normalizeAccentHex,
  resolveAccentHex,
  swatchByHex,
  swatchById,
  wantsAccentColorText,
  type AccentSwatch,
} from "@/lib/store-accent";
import {
  BUSINESS_KINDS,
  kindById,
  matchBusinessKindFromText,
  normalizeBusinessKind,
  resolveBusinessKind,
  wantsBusinessKindText,
  type BusinessKindOption,
} from "@/lib/store-business-kind";
import {
  STORE_THEMES,
  matchThemeFromText,
  normalizeStoreTheme,
  resolveStoreTheme,
  themeById,
  wantsStoreThemeText,
  type StoreThemeOption,
} from "@/lib/store-theme";
import {
  WELCOME_MESSAGE_MAX,
  extractWelcomeFromText,
  normalizeWelcomeMessage,
  wantsClearWelcomeText,
  wantsWelcomeMessageText,
} from "@/lib/store-welcome";
import {
  buildAndUploadStoreIcons,
  buildAndUploadStoreIconsFromImage,
  extractIconDesignHint,
} from "@/lib/store-icon";
import {
  welcomeAskNameMessage,
  helpGeneralMessage,
  welcomeBackMessage,
  welcomeMainMessage,
} from "@/lib/bot/welcome-copy";

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
  /** Solo chat web (simulator + Clerk): confirmar cerrar sesión. */
  | "ASK_LOGOUT"
  | "IDLE"
  | "PRODUCT_PHOTO"
  | "PRODUCT_TITLE"
  | "PRODUCT_PRICE"
  | "PRODUCT_DESC"
  | "PRODUCT_CATEGORY_CONFIRM"
  | "PRODUCT_CATEGORY_EDIT"
  | "PRODUCT_MATERIAL_CONFIRM"
  | "PRODUCT_MATERIAL_EDIT"
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
  | "ICON_PREVIEW"
  | "PERSONALIZE_HUB"
  | "ACCENT_PICK"
  | "ACCENT_CONFIRM"
  | "THEME_PICK"
  | "THEME_CONFIRM"
  | "KIND_PICK"
  | "KIND_CONFIRM"
  | "WELCOME_INPUT"
  | "WELCOME_CONFIRM"
  | "OPEN_NOW_PICK";

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
    accentColorPending: undefined,
    accentLabelPending: undefined,
    businessKindPending: undefined,
    businessKindLabelPending: undefined,
    themePending: undefined,
    themeLabelPending: undefined,
    welcomeMessagePending: undefined,
  };
}

function absorbSetupPlan(
  draft: ConversationDraft,
  text: string | undefined,
): ConversationDraft {
  if (!text?.trim()) return draft;
  const parsed = parseSetupPlan(text);
  if (!parsed) return draft;
  const parsedStoreName =
    parsed.storeName && isUsableStoreName(parsed.storeName)
      ? parsed.storeName
      : undefined;
  const pending = mergeSetupPlan(draft.pendingSetupPlan, {
    ...parsed,
    storeName: parsedStoreName,
  });
  return {
    ...draft,
    pendingSetupPlan: pending,
    ownerName: draft.ownerName ?? parsed.ownerName,
    storeName: draft.storeName ?? parsedStoreName,
  };
}

/** Quita nombres de tienda tomados de saludos / frases de intención. */
function scrubUnusableStoreName(draft: ConversationDraft): ConversationDraft {
  let next = draft;
  if (next.storeName && !isUsableStoreName(next.storeName)) {
    next = { ...next, storeName: undefined, slug: undefined };
  }
  if (
    next.pendingSetupPlan?.storeName &&
    !isUsableStoreName(next.pendingSetupPlan.storeName)
  ) {
    next = {
      ...next,
      pendingSetupPlan: {
        ...next.pendingSetupPlan,
        storeName: undefined,
      },
    };
  }
  return next;
}

function takeNextQueuedProductTitle(
  draft: ConversationDraft,
): { draft: ConversationDraft; title?: string } {
  const titles = draft.pendingSetupPlan?.productTitles;
  if (!titles?.length) return { draft };
  const [title, ...rest] = titles;
  const pendingSetupPlan: PendingSetupPlan | undefined =
    rest.length > 0 ||
    draft.pendingSetupPlan?.iconMode ||
    draft.pendingSetupPlan?.storeName ||
    draft.pendingSetupPlan?.accentColor ||
    draft.pendingSetupPlan?.businessKind ||
    draft.pendingSetupPlan?.theme ||
    draft.pendingSetupPlan?.welcomeMessage !== undefined
      ? {
          ...draft.pendingSetupPlan,
          productTitles: rest.length > 0 ? rest : undefined,
        }
      : undefined;
  return {
    draft: { ...draft, pendingSetupPlan },
    title,
  };
}

type DraftSetState = (
  next: BotState,
  nextDraft?: ConversationDraft,
) => Promise<void>;

/**
 * Tras el alta (IDLE): aplica logo / cola de productos del plan multi-intent.
 */
async function flushPendingSetupPlan(
  store: Store,
  draft: ConversationDraft,
  setState: DraftSetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
  baseReplies: OutboundMessage[],
): Promise<OutboundMessage[]> {
  const plan = draft.pendingSetupPlan;
  if (!plan) return baseReplies;

  const replies = [...baseReplies];
  const summary = describeSetupPlan(plan);
  if (summary) {
    replies.push({
      kind: "text",
      text: `Anoté lo que me pediste: ${summary}.`,
    });
  }

  let workingPlan: PendingSetupPlan = { ...plan };
  let nextDraft: ConversationDraft = { ...draft, pendingSetupPlan: workingPlan };

  if (workingPlan.accentColor) {
    const hex = normalizeAccentHex(workingPlan.accentColor);
    if (hex) {
      const updated = await updateStoreAccentColor(store.id, hex);
      if (updated) store = updated;
      revalidateStore(store.slug);
      const label =
        workingPlan.accentLabel || swatchByHex(hex)?.label || hex;
      replies.push({
        kind: "text",
        text: `¡Listo! Ya puse el color **${label}** en los botones y detalles de tu página.\n${store.slug ? storeUrl(store.slug) : ""}\n\n¿Querés cambiar algo más?`.trim(),
      });
    }
    workingPlan = {
      ...workingPlan,
      accentColor: undefined,
      accentLabel: undefined,
    };
    nextDraft = { ...nextDraft, pendingSetupPlan: workingPlan };
  }

  if (workingPlan.businessKind) {
    const kind = normalizeBusinessKind(workingPlan.businessKind);
    if (kind) {
      const updated = await updateStoreBusinessKind(store.id, kind);
      if (updated) store = updated;
      revalidateStore(store.slug);
      const label =
        workingPlan.businessKindLabel || kindById(kind)?.label || kind;
      replies.push({
        kind: "text",
        text: `¡Listo! Tu negocio quedó como **${label}**. Las fotos llevan el marco y el fondo unos dibujitos de ese tipo.\n${store.slug ? storeUrl(store.slug) : ""}\n\n¿Querés cambiar algo más?`.trim(),
      });
    }
    workingPlan = {
      ...workingPlan,
      businessKind: undefined,
      businessKindLabel: undefined,
    };
    nextDraft = { ...nextDraft, pendingSetupPlan: workingPlan };
  }

  if (workingPlan.theme) {
    const theme = normalizeStoreTheme(workingPlan.theme);
    if (theme) {
      const updated = await updateStoreTheme(store.id, theme);
      if (updated) store = updated;
      revalidateStore(store.slug);
      const label =
        workingPlan.themeLabel || themeById(theme)?.label || theme;
      replies.push({
        kind: "text",
        text: `¡Listo! Ya cambié el estilo de fondo a **${label}**.\n${store.slug ? storeUrl(store.slug) : ""}\n\n¿Querés cambiar algo más?`.trim(),
      });
    }
    workingPlan = {
      ...workingPlan,
      theme: undefined,
      themeLabel: undefined,
    };
    nextDraft = { ...nextDraft, pendingSetupPlan: workingPlan };
  }

  if (workingPlan.welcomeMessage !== undefined) {
    const welcome = normalizeWelcomeMessage(workingPlan.welcomeMessage);
    const updated = await updateStoreWelcomeMessage(store.id, welcome);
    if (updated) store = updated;
    revalidateStore(store.slug);
    replies.push({
      kind: "text",
      text: welcome
        ? `¡Listo! Ya puse el saludo «${welcome}» en tu página.\n${store.slug ? storeUrl(store.slug) : ""}\n\n¿Querés cambiar algo más?`.trim()
        : `¡Listo! Saqué el saludo de tu página.\n${store.slug ? storeUrl(store.slug) : ""}\n\n¿Querés cambiar algo más?`.trim(),
    });
    workingPlan = {
      ...workingPlan,
      welcomeMessage: undefined,
    };
    nextDraft = { ...nextDraft, pendingSetupPlan: workingPlan };
  }

  if (
    !workingPlan.iconMode &&
    !(workingPlan.productTitles?.length)
  ) {
    await setState("IDLE", { ...nextDraft, pendingSetupPlan: undefined });
    return replies;
  }

  if (workingPlan.iconMode === "upload") {
    nextDraft = {
      ...nextDraft,
      pendingSetupPlan: {
        ...workingPlan,
        iconMode: undefined,
        iconHint: undefined,
      },
    };
    const uploadReplies = await askStoreIconUpload(
      store,
      nextDraft,
      setState,
      caps,
      msg,
    );
    return [...replies, ...uploadReplies];
  }

  if (workingPlan.iconMode === "generate") {
    const hintText = workingPlan.iconHint
      ? `armar icono ${workingPlan.iconHint}`
      : "armar icono";
    nextDraft = {
      ...nextDraft,
      pendingSetupPlan: {
        ...workingPlan,
        iconMode: undefined,
        iconHint: undefined,
      },
    };
    // Icono primero; la cola de productos queda en el draft para después.
    const iconReplies = await startStoreIconGenerate(
      store,
      nextDraft,
      setState,
      caps,
      msg,
      hintText,
    );
    if (workingPlan.productTitles?.length) {
      const list = workingPlan.productTitles.join(", ");
      const defer = workingPlan.deferPhotos
        ? " Cuando quieras mandame la foto de cada uno (podés poner el nombre en el texto)."
        : " Mandame la foto del primero cuando puedas.";
      replies.push({
        kind: "text",
        text: `Productos en cola: ${list}.${defer}`,
      });
    }
    return [...replies, ...iconReplies];
  }

  if (workingPlan.productTitles?.length) {
    const list = workingPlan.productTitles.join(", ");
    const first = workingPlan.productTitles[0];
    replies.push({
      kind: "text",
      text: workingPlan.deferPhotos
        ? `Dejé en cola: ${list}. Cuando quieras, mandame la foto (si podés, escribí el nombre; si no, uso «${first}»).`
        : `Empecemos por «${first}». Mandame la foto (o escribí el nombre en el mensaje con la foto).`,
    });
    await setState("IDLE", nextDraft);
    return replies;
  }

  await setState("IDLE", { ...nextDraft, pendingSetupPlan: undefined });
  return replies;
}

function globalCommands(text?: string, choiceId?: string): "menu" | "help" | "cancel" | null {
  if (choiceId === CHOICE.MENU_CANCEL) return "cancel";
  if (choiceId === CHOICE.MENU_BACK) return "menu";
  if (choiceId === CHOICE.MENU_HELP || choiceId === "help") return "help";
  if (choiceId === CHOICE.MENU_ADD) return null;
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (t === "menu" || t === "menú" || t === "volver" || /^volver al men/.test(t)) {
    return "menu";
  }
  if (t === "ayuda" || t === "help") return "help";
  // "salir" cancela flujos en WhatsApp; en chat web se maneja como logout antes.
  if (t === "cancelar" || t === "salir") return "cancel";
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
  // No matchear “mi tienda es de ropa…” (personalización / multi-intent).
  if (/\b(ver (mi )?tienda|link( de)?( la)? tienda|catalogo|mi link)\b/.test(t)) {
    return true;
  }
  return (
    /^mi tienda[.!?]*$/.test(t) ||
    /^mi tienda\s+(por\s+favor|pls|please)[.!?]*$/.test(t)
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
  return withOptions(
    "¿Qué querés hacer?\n\nElegí del menú o mandame un audio 🎤 contándome.",
    options,
    caps,
  );
}

function productsMenuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "Productos — ¿qué necesitás?\n\nTambién podés decirmelo por audio 🎤.",
    [
      { id: CHOICE.MENU_ADD, label: "Cargar producto" },
      { id: CHOICE.MENU_PRICE, label: "Cambiar precio" },
      { id: CHOICE.MENU_PHOTO, label: "Cambiar foto" },
      { id: CHOICE.MENU_STOCK, label: "Disponible o agotado" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function storeMenuMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "Tienda — ¿qué necesitás?\n\nTambién podés decirmelo por audio 🎤.",
    [
      { id: CHOICE.MENU_ICON, label: "Foto o logo" },
      { id: CHOICE.MENU_PERSONALIZE, label: "Colores y estilo" },
      { id: CHOICE.MENU_STORE, label: "Ver mi tienda" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function personalizeHubMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "Colores y estilo — ¿qué cambiamos?\n\nTambién podés decirmelo por audio 🎤.",
    [
      { id: CHOICE.PERSONALIZE_COLOR, label: "Color" },
      { id: CHOICE.PERSONALIZE_THEME, label: "Estilo" },
      { id: CHOICE.PERSONALIZE_KIND, label: "Tipo de negocio" },
      { id: CHOICE.PERSONALIZE_WELCOME, label: "Saludo a clientes" },
      { id: CHOICE.PERSONALIZE_OPEN_NOW, label: "Abierto o cerrado" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function openNowPickMessage(
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const nowLine = store.openNow
    ? "Ahora: el cartelito dice Abierto."
    : "Ahora: el cartelito dice Cerrado.";
  return withOptions(
    `¿Querés el cartelito de Abierto o Cerrado en tu página?\n(Solo se ve; no usa horarios.)\n${nowLine}`,
    [
      { id: CHOICE.OPEN_NOW_YES, label: "Abierto" },
      { id: CHOICE.OPEN_NOW_NO, label: "Cerrado" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function accentPickMessage(
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const current = resolveAccentHex(store.accentColor);
  const currentLabel = swatchByHex(current)?.label ?? current;
  const options: Option[] = ACCENT_SWATCHES.map((s) => ({
    id: `${CHOICE.ACCENT_PREFIX}${s.id}`,
    label: s.label,
  }));
  options.push({ id: CHOICE.MENU_BACK, label: "Volver al menú" });
  return withOptions(
    `Elegí un color para los botones y detalles de tu página.\nAhora: ${currentLabel}.\n\nTambién podés decirme el color por audio 🎤.`,
    options,
    caps,
  );
}

function accentConfirmMessage(
  swatch: Pick<AccentSwatch, "label" | "hex">,
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const link = store.slug ? `\nVista: ${storeUrl(store.slug)}` : "";
  return withOptions(
    `¿Dejamos el color «${swatch.label}»?\nLos botones y precios de tu página van a usar ese color.${link}`,
    [
      { id: CHOICE.YES, label: "Sí, guardar" },
      { id: CHOICE.NO, label: "Otro color" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function kindPickMessage(
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const current = resolveBusinessKind(store.businessKind);
  const currentLabel = current
    ? (kindById(current)?.label ?? current)
    : "Todavía sin tipo de negocio";
  const options: Option[] = BUSINESS_KINDS.map((k) => ({
    id: `${CHOICE.KIND_PREFIX}${k.id}`,
    label: k.label,
  }));
  options.push({ id: CHOICE.MENU_BACK, label: "Volver al menú" });
  return withOptions(
    `¿De qué es tu negocio?\nEso pone un marco en las fotos y un fondo con dibujitos suaves.\nAhora: ${currentLabel}.\n\nTambién podés decirmelo por audio 🎤.`,
    options,
    caps,
  );
}

function kindConfirmMessage(
  kind: Pick<BusinessKindOption, "label" | "id">,
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const link = store.slug ? `\nVista: ${storeUrl(store.slug)}` : "";
  return withOptions(
    `¿Dejamos el tipo «${kind.label}»?\nLas fotos llevan el marco ${kind.label.toLowerCase()} y el fondo unos dibujitos de ese tipo de negocio.${link}`,
    [
      { id: CHOICE.YES, label: "Sí, guardar" },
      { id: CHOICE.NO, label: "Otro tipo" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function themePickMessage(
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const current = resolveStoreTheme(store.theme);
  const currentLabel = current
    ? (themeById(current)?.label ?? current)
    : "Por defecto (look actual)";
  const options: Option[] = STORE_THEMES.map((t) => ({
    id: `${CHOICE.THEME_PREFIX}${t.id}`,
    label: t.label,
  }));
  options.push({ id: CHOICE.MENU_BACK, label: "Volver al menú" });
  return withOptions(
    `Elegí un estilo de fondo para tu página (el color que ya elegiste se mantiene).\nAhora: ${currentLabel}.\n\nTambién podés decirmelo por audio 🎤.`,
    options,
    caps,
  );
}

function themeConfirmMessage(
  theme: Pick<StoreThemeOption, "label" | "id" | "blurb">,
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const link = store.slug ? `\nVista: ${storeUrl(store.slug)}` : "";
  return withOptions(
    `¿Dejamos el estilo «${theme.label}»?\n${theme.blurb}.${link}`,
    [
      { id: CHOICE.YES, label: "Sí, guardar" },
      { id: CHOICE.NO, label: "Otro estilo" },
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ],
    caps,
  );
}

function welcomeAskMessage(
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const current = normalizeWelcomeMessage(store.welcomeMessage);
  const nowLine = current
    ? `Ahora: «${current}».`
    : "Ahora no tenés saludo.";
  const options: Option[] = [
    { id: CHOICE.MENU_BACK, label: "Volver al menú" },
  ];
  if (current) {
    options.unshift({ id: CHOICE.WELCOME_CLEAR, label: "Sin saludo" });
  }
  return withOptions(
    `Escribí o dictá por audio 🎤 el saludo que ven tus clientes debajo del nombre (máx. ${WELCOME_MESSAGE_MAX} caracteres).\nEj.: "Envíos a todo el país" o "Retiro en taller".\n${nowLine}`,
    options,
    caps,
  );
}

function welcomeConfirmMessage(
  phrase: string | null,
  store: Store,
  caps: ChannelCapabilities,
): OutboundMessage {
  const link = store.slug ? `\nVista: ${storeUrl(store.slug)}` : "";
  const body = phrase
    ? `¿Dejamos el saludo «${phrase}» debajo del nombre?${link}`
    : `¿Sacamos el saludo que ven tus clientes?${link}`;
  return withOptions(
    body,
    [
      { id: CHOICE.YES, label: "Sí, guardar" },
      { id: CHOICE.NO, label: "Otro saludo" },
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
    options.push({ id: CHOICE.MENU_LINK_WA, label: "Manejar desde acá" });
  }
  options.push({ id: CHOICE.MENU_BACK, label: "Volver al menú" });
  return withOptions(
    "WhatsApp — ¿qué necesitás?\n\nTambién podés decirmelo por audio 🎤.",
    options,
    caps,
  );
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
    text: helpGeneralMessage(),
  };
}

function askLinkCodePrompt(caps: ChannelCapabilities): OutboundMessage {
  return withCancelEscape(
    '¿Ya armaste tu tienda en la computadora y querés manejarla desde acá? ¡Re fácil!\n\n' +
      'Escribime "Ya tengo cuenta" seguido del código de 6 dígitos que te apareció en la pantalla, y las conecto al instante.\n\n' +
      "El código vale 30 minutos. Si no lo tenés, en la web abrí el menú de WhatsApp y tocá Manejar desde acá.",
    caps,
  );
}

function askContactPhonePrompt(
  editing: boolean,
  caps: ChannelCapabilities,
): OutboundMessage {
  return withCancelEscape(
    editing
      ? "Mandame el WhatsApp donde querés que te escriban los clientes (con código de área), por ejemplo 11 1234-5678. Tu número de gestión no cambia."
      : "¿A qué WhatsApp te escriben los clientes? Mandame tu celular con código de área, por ejemplo 11 1234-5678.",
    caps,
  );
}

function linkFailureMessage(detail: string): string {
  switch (detail) {
    case "invalid_code":
      return "Ese código no existe o ya se usó.\n\nGenerá uno nuevo en el chat web (Manejar desde acá). Si preferís, **Cancelar** te saca sin tocar tu tienda.";
    case "expired":
      return "Ese código venció (valen 30 minutos).\n\nGenerá uno nuevo en el chat web. **Cancelar** te saca sin borrar nada.";
    case "no_clerk_store":
      return "Todavía no veo una tienda armada con esa cuenta web.\n\nTerminá el alta en la web y después pedime el código otra vez. O **Cancelar** para volver.";
    case "conflict_both_have_products":
      return "Ese WhatsApp y esa cuenta web tienen tiendas distintas con productos.\n\nUsá un solo camino por ahora, o escribime a soporte. **Cancelar** no borra nada.";
    case "wa_store_has_other_clerk":
      return "Ese WhatsApp ya está unido a otra cuenta de email.\n\nSi necesitás ayuda, escribinos. **Cancelar** te saca sin cambios.";
    case "wa_not_valid":
      return "Para unir la tienda tenés que escribirme desde un celular argentino (WhatsApp).\n\n**Cancelar** te saca sin borrar nada.";
    case "wa_identity_taken":
      return "Ese número ya tiene otra tienda. Si es tuya, escribinos.\n\n**Cancelar** te saca sin tocar nada.";
    default:
      return "No pude unir la cuenta ahora.\n\nProbá de nuevo, o **Cancelar** y pedime el menú — no se borra tu tienda.";
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
      {
        kind: "text",
        text: "No pude generar el código ahora.\n\nProbá de nuevo en un rato, o **Cancelar** para volver al menú.",
      },
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
  const replies: OutboundMessage[] = [askContactPhonePrompt(true, caps)];
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
          text: "No te escuché bien.\n\nMandame otro audio 🎤 o escribilo.",
        },
      ];
    }
    const rest = await handleMessageBody(
      { ...msg, text: transcript, media: undefined },
      caps,
    );
    const heard =
      transcript.length > 120 ? `${transcript.slice(0, 117)}…` : transcript;
    return [{ kind: "text", text: `Te escuché: **${heard}**` }, ...rest];
  }

  return handleMessageBody(msg, caps);
}

function logoutConfirmMessage(caps: ChannelCapabilities): OutboundMessage {
  return withOptions(
    "¿Querés cerrar la sesión de este chat?",
    [
      { id: CHOICE.YES, label: "Sí, cerrar sesión" },
      { id: CHOICE.NO, label: "No, seguir" },
    ],
    caps,
    { includeCancel: false },
  );
}

async function handleMessageBody(
  msg: InboundMessage,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  const existing = await getConversation(msg.from);
  let state = (existing?.state as BotState) || "NEW";
  let draft = draftOf(existing?.draft as Record<string, unknown>);

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

  // Cerrar sesión: solo chat web con identidad Clerk. Meta/WhatsApp: no-op de logout.
  const webClerkLogout =
    msg.channel === "simulator" && isClerkIdentity(msg.from);

  if (webClerkLogout && state === "ASK_LOGOUT") {
    const choice = resolveChoiceId(msg.choiceId, msg.text, draft.pendingChoices);
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.YES ||
      isAffirmative(text) ||
      /^si[,!.\s]+cerrar/.test(normalizeLoose(text))
    ) {
      draft = clearStockDraft({ ...draft, product: undefined });
      await setState("IDLE", draft);
      return [
        {
          kind: "sign_out",
          text: "Listo. Cerré tu sesión. Cuando quieras, volvé a entrar al chat.",
        },
      ];
    }
    if (
      choice === CHOICE.NO ||
      choice === CHOICE.MENU_CANCEL ||
      isNegative(text)
    ) {
      draft = clearStockDraft(draft);
      await setState("IDLE", draft);
      return [
        {
          kind: "text",
          text: "Dale, seguimos. No cerré la sesión.",
        },
        menuMessage(caps, msg.from),
      ];
    }
    return replyWithChoices(
      draft,
      setState,
      "ASK_LOGOUT",
      logoutConfirmMessage(caps),
    );
  }

  if (webClerkLogout && isLogoutIntent(msg.text)) {
    return replyWithChoices(
      draft,
      setState,
      "ASK_LOGOUT",
      logoutConfirmMessage(caps),
    );
  }

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
      state === "PERSONALIZE_HUB" ||
      state === "ACCENT_PICK" ||
      state === "ACCENT_CONFIRM" ||
      state === "THEME_PICK" ||
      state === "THEME_CONFIRM" ||
      state === "KIND_PICK" ||
      state === "KIND_CONFIRM" ||
      state === "WELCOME_INPUT" ||
      state === "WELCOME_CONFIRM" ||
      state === "OPEN_NOW_PICK" ||
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
      replies.push({
        kind: "text",
        text: welcomeBackMessage(existingStore.ownerName),
      });
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
            text: "Estás en la web: cuando termines el alta, en el menú de WhatsApp tocá Manejar desde acá para generar el código. Después lo mandás desde el celular.",
          });
        } else {
          replies.push({
            kind: "text",
            text: "Para unir tu cuenta web, escribime desde WhatsApp con tu celular.",
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
      replies.push(askLinkCodePrompt(caps));
      return replies;
    }

    await setState("ASK_NAME", draft);
    replies.push({
      kind: "text",
      text: welcomeMainMessage({ closing: "onboarding" }),
    });
    replies.push({
      kind: "text",
      text: welcomeAskNameMessage(),
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
      replies.push(
        withCancelEscape(
          "Necesito el código de 6 dígitos que te mostró el chat web. O escribí cancelar.",
          caps,
        ),
      );
      return replies;
    }
    return completeChannelLinkFromWa(msg, code, draft, setState, caps);
  }

  if (state === "ASK_NAME") {
    draft = absorbSetupPlan(draft, msg.text);
    if (
      choice === CHOICE.LINK_EXISTING ||
      (msg.text && wantsLinkExistingAccountText(msg.text))
    ) {
      if (!isWhatsAppContactPhone(msg.from)) {
        replies.push({
          kind: "text",
          text: isClerkIdentity(msg.from)
            ? "Para manejar la tienda desde el celular, tocá Manejar desde acá en el menú de WhatsApp cuando tengas la tienda lista."
            : "Para unir la cuenta, escribime desde WhatsApp.",
        });
        replies.push({
          kind: "text",
          text: "Si seguís el alta: ¿cómo te llamás?",
        });
        return replies;
      }
      await setState("ASK_LINK_CODE", clearStockDraft(draft));
      replies.push(askLinkCodePrompt(caps));
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
    // Re-entrada desde el chat v2 («Seguir en este chat») u hola / intención suelta.
    if (
      /^(hola|buenas)[\s!.]*$/i.test(raw) ||
      isStoreCreateIntentPhrase(raw)
    ) {
      replies.push({
        kind: "text",
        text: "Dale, ¿cómo te llamás?",
      });
      return replies;
    }
    const extracted = extractPersonName(raw);
    const planName = draft.pendingSetupPlan?.ownerName;
    const name = extracted.name ?? planName;
    if (!name || (extracted.confidence === "none" && !planName)) {
      // Multi-intent sin nombre claro: guardamos el plan y pedimos solo el nombre.
      if (draft.pendingSetupPlan) {
        replies.push({
          kind: "text",
          text: `Anoté el plan (${describeSetupPlan(draft.pendingSetupPlan)}). ¿Cómo te llamás?`,
        });
        await setState("ASK_NAME", draft);
        return replies;
      }
      replies.push({
        kind: "text",
        text: "No te entendí bien el nombre.\n\nDecime solo cómo te llamás, por ejemplo: Norma. También podés mandarme un audio 🎤.",
      });
      return replies;
    }
    const confidence =
      extracted.name && extracted.confidence !== "none"
        ? extracted.confidence
        : planName
          ? "high"
          : "low";
    draft = { ...draft, ownerName: name };
    const planNote = draft.pendingSetupPlan
      ? `\n\nTambién anoté: ${describeSetupPlan(draft.pendingSetupPlan)}.`
      : "";
    const prompt =
      confidence === "high"
        ? `Encantado, ${name}. ¿Usamos ese nombre?${planNote}` // masculino (alfrebot)
        : `¿Te llamás ${name}? Si no, tocá Cambiar nombre.${planNote}`;
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
      draft = scrubUnusableStoreName(draft);
      const plannedStore = draft.pendingSetupPlan?.storeName ?? draft.storeName;
      if (plannedStore && isUsableStoreName(plannedStore)) {
        const slug = await uniqueSlug(plannedStore, slugExists);
        draft = { ...draft, storeName: plannedStore, slug };
        return replyWithChoices(
          draft,
          setState,
          "CONFIRM_SLUG",
          withOptions(
            `Perfecto, ${draft.ownerName}. Tu tienda va a estar en ${appBaseUrl()}/${slug} («${plannedStore}»). ¿Está bien?`,
            [
              { id: CHOICE.YES, label: "Sí" },
              { id: CHOICE.CHANGE, label: "Cambiar nombre" },
            ],
            caps,
          ),
        );
      }
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
          `Encantado, ${again.name}. ¿Usamos ese nombre?`,
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
    draft = scrubUnusableStoreName(absorbSetupPlan(draft, msg.text));
    const text = msg.text?.trim() ?? "";
    // Si el mensaje era un plan largo con «se llama X», usar solo ese nombre.
    const fromPlan =
      draft.pendingSetupPlan?.storeName &&
      isUsableStoreName(draft.pendingSetupPlan.storeName)
        ? draft.pendingSetupPlan.storeName
        : undefined;
    const fromDraft =
      draft.storeName && isUsableStoreName(draft.storeName)
        ? draft.storeName
        : undefined;
    // Nunca usar saludos / «quiero crear mi tienda…» como nombre.
    const fromText =
      text &&
      !isStoreCreateIntentPhrase(text) &&
      isUsableStoreName(text) &&
      // Plan multi-intent sin nombre explícito: no tomar el blob entero.
      !(msg.text && parseSetupPlan(msg.text) && !fromPlan)
        ? text
        : undefined;
    const resolvedName = fromPlan ?? fromDraft ?? fromText;
    if (!resolvedName) {
      const planNote =
        draft.pendingSetupPlan && describeSetupPlan(draft.pendingSetupPlan)
          ? `\n\nAnoté: ${describeSetupPlan(draft.pendingSetupPlan)}.`
          : "";
      await setState("ASK_STORE", draft);
      replies.push({
        kind: "text",
        text: `¿Cómo querés que se llame tu tienda?${planNote} Decime solo el nombre (ej. Cerámicas de Norma).`,
      });
      return replies;
    }
    const slug = await uniqueSlug(resolvedName, slugExists);
    draft = { ...draft, storeName: resolvedName, slug };
    const planNote =
      draft.pendingSetupPlan && describeSetupPlan(draft.pendingSetupPlan)
        ? `\n\nAnoté también: ${describeSetupPlan(draft.pendingSetupPlan)}.`
        : "";
    return replyWithChoices(
      draft,
      setState,
      "CONFIRM_SLUG",
      withOptions(
        `Tu tienda va a estar en ${appBaseUrl()}/${slug}. ¿Está bien?${planNote}`,
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
      replies.push(askContactPhonePrompt(false, caps));
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
      replies.push(askContactPhonePrompt(flow === "edit", caps));
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
        text: "No te entendí el número.\n\nProbá así: 11 1234-5678 o 351 123-4567. También podés mandarme un audio 🎤.",
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
          { id: CHOICE.CHECKOUT_WA, label: "Sin carrito" },
          { id: CHOICE.CHECKOUT_CART, label: "Con carrito" },
        ],
        caps,
        { includeCancel: false },
      ),
    );
  }

  if (state === "ASK_CHECKOUT_MODE") {
    const text = (msg.text?.trim() ?? "").toLowerCase();
    let checkoutMode: "whatsapp" | "cart" | null = null;
    if (
      choice === CHOICE.CHECKOUT_WA ||
      choice === CHOICE.YES ||
      /\bsin carrito\b/.test(text) ||
      /\blo quiero\b/.test(text) ||
      /whatsapp|directo|uno/.test(text)
    ) {
      checkoutMode = "whatsapp";
    } else if (
      choice === CHOICE.CHECKOUT_CART ||
      /\bcon carrito\b/.test(text) ||
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
            { id: CHOICE.CHECKOUT_WA, label: "Sin carrito" },
            { id: CHOICE.CHECKOUT_CART, label: "Con carrito" },
          ],
          caps,
          { includeCancel: false },
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
      ? "Cuando quieras avisar cuántas unidades te quedan, pedime por audio o desde Productos."
      : "Cuando se te agote algo, pedime avisarlo por audio o desde Productos.";
    const continuityHint = isClerkIdentity(msg.from)
      ? "Los pedidos de clientes van por el WhatsApp de pedidos que cargaste."
      : msg.channel === "simulator" && isWhatsAppContactPhone(msg.from)
        ? "Cuando quieras, escribile al bot por WhatsApp desde este mismo número y seguís la conversación."
        : "";
    const hasPlan =
      Boolean(draft.pendingSetupPlan?.iconMode) ||
      Boolean(draft.pendingSetupPlan?.productTitles?.length) ||
      Boolean(draft.pendingSetupPlan?.accentColor) ||
      Boolean(draft.pendingSetupPlan?.businessKind) ||
      Boolean(draft.pendingSetupPlan?.theme) ||
      draft.pendingSetupPlan?.welcomeMessage !== undefined;
    const continuityBlock = continuityHint ? `\n\n${continuityHint}` : "";
    replies.push({
      kind: "text",
      text: hasPlan
        ? `¡Listo! 🎉 Tu tienda ya está en ${storeUrl(store.slug!)}.\n\n${checkoutHint}\n\n${stockHint}${continuityBlock}`
        : `¡Listo! 🎉 Tu tienda ya está en ${storeUrl(store.slug!)}.\n\n${checkoutHint}\n\n${stockHint}${continuityBlock}\n\n¿Empezamos? Mandame la foto de tu primer producto o contame por audio qué vendés.`,
    });
    if (hasPlan) {
      return flushPendingSetupPlan(
        store,
        draft,
        setState,
        caps,
        msg,
        replies,
      );
    }
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
      replies.push(
        withCancelEscape("Mandame la foto del producto.", caps),
      );
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
      return openStoreIconHub(store, draft, setState, caps, msg);
    }
    if (
      choice === CHOICE.MENU_PERSONALIZE ||
      msg.choiceId === CHOICE.MENU_PERSONALIZE
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openPersonalizeHub(draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_COLOR ||
      msg.choiceId === CHOICE.PERSONALIZE_COLOR
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openAccentPick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_THEME ||
      msg.choiceId === CHOICE.PERSONALIZE_THEME
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openThemePick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_KIND ||
      msg.choiceId === CHOICE.PERSONALIZE_KIND
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openKindPick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_WELCOME ||
      msg.choiceId === CHOICE.PERSONALIZE_WELCOME
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openWelcomeAsk(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_OPEN_NOW ||
      msg.choiceId === CHOICE.PERSONALIZE_OPEN_NOW
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return openOpenNowPick(store, draft, setState, caps);
    }
    if (
      (choice?.startsWith(CHOICE.ACCENT_PREFIX) ||
        msg.choiceId?.startsWith(CHOICE.ACCENT_PREFIX)) &&
      store
    ) {
      const id = (choice ?? msg.choiceId ?? "").slice(CHOICE.ACCENT_PREFIX.length);
      const swatch = swatchById(id);
      if (swatch) {
        return startAccentConfirm(store, draft, setState, caps, swatch);
      }
    }
    if (
      (choice?.startsWith(CHOICE.THEME_PREFIX) ||
        msg.choiceId?.startsWith(CHOICE.THEME_PREFIX)) &&
      store
    ) {
      const id = (choice ?? msg.choiceId ?? "").slice(CHOICE.THEME_PREFIX.length);
      const theme = themeById(id);
      if (theme) {
        return startThemeConfirm(store, draft, setState, caps, theme);
      }
    }
    if (
      (choice?.startsWith(CHOICE.KIND_PREFIX) ||
        msg.choiceId?.startsWith(CHOICE.KIND_PREFIX)) &&
      store
    ) {
      const id = (choice ?? msg.choiceId ?? "").slice(CHOICE.KIND_PREFIX.length);
      const kind = kindById(id);
      if (kind) {
        return startKindConfirm(store, draft, setState, caps, kind);
      }
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
        return applyUploadedStoreIcon(store, draft, setState, caps, msg);
      }
      return askStoreIconUpload(store, draft, setState, caps, msg);
    }
    if (
      choice === CHOICE.ICON_FROM_PROFILE ||
      msg.choiceId === CHOICE.ICON_FROM_PROFILE
    ) {
      if (!store) {
        replies.push({ kind: "text", text: "Todavía no terminamos de armar tu tienda." });
        return replies;
      }
      return applyProfileStoreIcon(store, draft, setState, caps, msg);
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
        msg,
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
        return applyUploadedStoreIcon(store, draft, setState, caps, msg);
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
      replies.push(askLinkCodePrompt(caps));
      return replies;
    }
    if (msg.text && store && wantsContactPhoneText(msg.text)) {
      return startContactEditFlow(store, draft, setState, caps, msg);
    }

    // Multi-intent en IDLE: logo + color + rubro + tema + frase + productos.
    // No renombrar una tienda ya creada desde frases de chat / intención.
    if (msg.text && store) {
      const idlePlan = parseSetupPlan(msg.text);
      if (
        idlePlan &&
        (idlePlan.iconMode ||
          idlePlan.accentColor ||
          idlePlan.businessKind ||
          idlePlan.theme ||
          idlePlan.welcomeMessage !== undefined ||
          (idlePlan.productTitles?.length ?? 0) > 0)
      ) {
        const idleWithoutRename = { ...idlePlan, storeName: undefined };
        draft = {
          ...draft,
          pendingSetupPlan: mergeSetupPlan(
            draft.pendingSetupPlan,
            idleWithoutRename,
          ),
        };
        return flushPendingSetupPlan(store, draft, setState, caps, msg, []);
      }
    }

    const action = msg.text ? await interpretFreeText(msg.text) : { intent: "unknown" as const };
    if (action.intent === "menu" || action.intent === "help") {
      return action.intent === "help"
        ? [helpMessage()]
        : [menuMessage(caps, msg.from)];
    }
    if (action.intent === "create_product") {
      await setState("PRODUCT_PHOTO", { ...draft, product: {} });
      replies.push(
        withCancelEscape("Mandame la foto del producto.", caps),
      );
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
    if (action.intent === "profile_icon" && store) {
      return applyProfileStoreIcon(store, draft, setState, caps, msg);
    }
    if (action.intent === "upload_icon" && store) {
      // Imagen + choice icon_upload ya se resolvió arriba; acá pedimos la foto.
      return askStoreIconUpload(store, draft, setState, caps, msg);
    }
    if (action.intent === "generate_icon" && store) {
      const wantsProfile =
        /foto de (google|cuenta|perfil)|usar mi foto/.test(
          normalizeLoose(msg.text ?? ""),
        );
      if (wantsProfile) {
        return applyProfileStoreIcon(store, draft, setState, caps, msg);
      }
      const wantsUpload = /sub(ir|í|i)|mand(ar|á|a)|cargar|propio/.test(
        normalizeLoose(msg.text ?? ""),
      );
      if (wantsUpload) {
        return askStoreIconUpload(store, draft, setState, caps, msg);
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
          msg,
          msg.text,
        );
      }
      return openStoreIconHub(store, draft, setState, caps, msg);
    }
    if (action.intent === "set_accent_color" && store) {
      const fromHint = action.accentHint
        ? swatchByHex(action.accentHint) ??
          (normalizeAccentHex(action.accentHint)
            ? {
                id: "custom",
                label: action.accentHint,
                hex: normalizeAccentHex(action.accentHint)!,
                aliases: [] as string[],
              }
            : null)
        : null;
      const swatch = fromHint ?? matchAccentFromText(msg.text ?? "");
      if (swatch) {
        return startAccentConfirm(store, draft, setState, caps, swatch);
      }
      return openAccentPick(store, draft, setState, caps);
    }
    if (action.intent === "set_business_kind" && store) {
      const fromHint = action.businessKindHint
        ? kindById(action.businessKindHint)
        : null;
      const kind = fromHint ?? matchBusinessKindFromText(msg.text ?? "");
      if (kind) {
        return startKindConfirm(store, draft, setState, caps, kind);
      }
      return openKindPick(store, draft, setState, caps);
    }
    if (action.intent === "set_store_theme" && store) {
      const fromHint = action.themeHint ? themeById(action.themeHint) : null;
      const theme = fromHint ?? matchThemeFromText(msg.text ?? "");
      if (theme) {
        return startThemeConfirm(store, draft, setState, caps, theme);
      }
      return openThemePick(store, draft, setState, caps);
    }
    if (action.intent === "set_welcome_message" && store) {
      if (wantsClearWelcomeText(msg.text ?? "") || action.welcomeHint === "") {
        return startWelcomeConfirm(store, draft, setState, caps, null);
      }
      const phrase =
        normalizeWelcomeMessage(action.welcomeHint) ??
        extractWelcomeFromText(msg.text ?? "");
      if (phrase) {
        return startWelcomeConfirm(store, draft, setState, caps, phrase);
      }
      return openWelcomeAsk(store, draft, setState, caps);
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
          text: "No encontré ese producto.\n\nDecime **Ver mis productos** o elegí uno de la lista. **Cancelar** te saca sin borrar nada.",
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
            text: "No te entendí.\n\nTocá **Volver al menú** o decime **Cancelar** — no se borra nada. También podés mandarme un audio 🎤.",
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
      replies.push({
        kind: "text",
        text: "No encontré ese producto.\n\nDecime **Ver mis productos** o **Cancelar** para volver — no se borra nada.",
      });
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
      return continuePhotoEdit(store, draft, setState, product, caps);
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
        {
          kind: "text",
          text: "No encontré ese producto.\n\nDecime **Ver mis productos** o **Cancelar** para volver — no se borra nada.",
        },
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
          withCancelEscape(
            `¿Cuántas unidades de "${product.title}" quedan?\n\nDecime un número por audio 🎤 o escrito (puede ser 0).`,
            caps,
          ),
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
        withCancelEscape(
          `¿Cuántas unidades de "${product.title}" quedan?\n\nDecime un número por audio 🎤 o escrito.`,
          caps,
        ),
      ];
    }
    if (choice === CHOICE.STOCK_SET_PRICE) {
      return continuePriceEdit(store, draft, setState, caps, product, null);
    }
    if (choice === CHOICE.STOCK_CHANGE_PHOTO) {
      return continuePhotoEdit(store, draft, setState, product, caps);
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
      replies.push(
        withCancelEscape(
          "Necesito un número entero (por ejemplo 0, 1 o 3).",
          caps,
        ),
      );
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
      return applyUploadedStoreIcon(store, draft, setState, caps, msg);
    }
    if (
      choice === CHOICE.ICON_FROM_PROFILE ||
      /usar mi foto|foto de (google|cuenta|perfil)/.test(
        normalizeLoose(msg.text ?? ""),
      )
    ) {
      return applyProfileStoreIcon(store, draft, setState, caps, msg);
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
        msg,
        msg.text,
      );
    }
    const waitOpts: Option[] = [
      { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
      ...(await profileIconOption(msg, store)),
      { id: CHOICE.MENU_BACK, label: "Volver al menú" },
    ];
    return [
      {
        kind: "text",
        text:
          "Mandame la imagen del icono de tu tienda (cuadrada queda mejor). " +
          "Eso no cambia la foto de un producto. O tocá Que lo arme el bot.",
      },
      withOptions("¿Qué preferís?", waitOpts, caps),
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
            ? `¡Listo! Ya quedó la foto o logo de tu negocio.\n${storeUrl(store.slug)}\n(También al agregar la tienda al inicio del celular.)\n\n¿Querés cambiar algo más?`
            : "¡Listo! Ya quedó la foto o logo de tu negocio.\n\n¿Querés cambiar algo más?",
        },
        menuMessage(caps, msg.from),
      ];
    }
    if (
      choice === CHOICE.ICON_FROM_PROFILE ||
      /usar mi foto|foto de (google|cuenta|perfil)/.test(normalizeLoose(text))
    ) {
      return applyProfileStoreIcon(store, draft, setState, caps, msg);
    }
    if (
      choice === CHOICE.ICON_UPLOAD ||
      /sub(ir|í|i)|mand(ar|á|a) (mi )?(icono|imagen|foto|logo)|cargar/.test(
        normalizeLoose(text),
      )
    ) {
      if (msg.media?.kind === "image") {
        return applyUploadedStoreIcon(store, draft, setState, caps, msg);
      }
      return askStoreIconUpload(store, draft, setState, caps, msg);
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
        msg,
        msg.text,
      );
    }
    if (msg.media?.kind === "image") {
      return applyUploadedStoreIcon(store, draft, setState, caps, msg);
    }
    const previewOpts: Option[] = [
      { id: CHOICE.ICON_REGEN, label: "Generar otro" },
      { id: CHOICE.ICON_UPLOAD, label: "Subir mi imagen" },
      ...(await profileIconOption(msg, store)),
      { id: CHOICE.ICON_DONE, label: "Listo" },
    ];
    replies.push({
      kind: "text",
      text:
        "Tocá Listo si te gusta. Podés pedir Generar otro, Subir mi imagen o Usar mi foto de Google. Escribí cancelar para salir.",
    });
    if (store.icon512Url) {
      replies.push({
        kind: "image",
        url: store.icon512Url,
        caption: "Tu logo actual",
      });
    }
    replies.push(withOptions("¿Qué hacemos?", previewOpts, caps));
    return replies;
  }

  if (state === "PERSONALIZE_HUB" && store) {
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (
      choice === CHOICE.PERSONALIZE_COLOR ||
      /color|acento|paleta|verde|azul|rojo/.test(normalizeLoose(msg.text ?? ""))
    ) {
      if (wantsAccentColorText(msg.text ?? "") || matchAccentFromText(msg.text ?? "")) {
        const swatch = matchAccentFromText(msg.text ?? "");
        if (swatch) {
          return startAccentConfirm(store, draft, setState, caps, swatch);
        }
      }
      return openAccentPick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_THEME ||
      /tema|estilo|fondo|oscuro|crema|claro/.test(normalizeLoose(msg.text ?? ""))
    ) {
      if (
        wantsStoreThemeText(msg.text ?? "") ||
        matchThemeFromText(msg.text ?? "")
      ) {
        const theme = matchThemeFromText(msg.text ?? "");
        if (theme) {
          return startThemeConfirm(store, draft, setState, caps, theme);
        }
      }
      return openThemePick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_KIND ||
      /rubro|ceramica|cerámica|comida|ropa|artesanal|vendo/.test(
        normalizeLoose(msg.text ?? ""),
      )
    ) {
      if (
        wantsBusinessKindText(msg.text ?? "") ||
        matchBusinessKindFromText(msg.text ?? "")
      ) {
        const kind = matchBusinessKindFromText(msg.text ?? "");
        if (kind) {
          return startKindConfirm(store, draft, setState, caps, kind);
        }
      }
      return openKindPick(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_WELCOME ||
      /frase|bienvenida|dec[ií] que|envio|envío|retiro/.test(
        normalizeLoose(msg.text ?? ""),
      )
    ) {
      if (wantsClearWelcomeText(msg.text ?? "")) {
        return startWelcomeConfirm(store, draft, setState, caps, null);
      }
      const phrase = extractWelcomeFromText(msg.text ?? "");
      if (phrase) {
        return startWelcomeConfirm(store, draft, setState, caps, phrase);
      }
      return openWelcomeAsk(store, draft, setState, caps);
    }
    if (
      choice === CHOICE.PERSONALIZE_OPEN_NOW ||
      /abierto ahora|estamos abiertos|marcar abierto|marcar cerrado/.test(
        normalizeLoose(msg.text ?? ""),
      )
    ) {
      return openOpenNowPick(store, draft, setState, caps);
    }
    return openPersonalizeHub(draft, setState, caps);
  }

  if (state === "ACCENT_PICK" && store) {
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice?.startsWith(CHOICE.ACCENT_PREFIX)) {
      const swatch = swatchById(choice.slice(CHOICE.ACCENT_PREFIX.length));
      if (swatch) {
        return startAccentConfirm(store, draft, setState, caps, swatch);
      }
    }
    const fromText = matchAccentFromText(msg.text ?? "");
    if (fromText) {
      return startAccentConfirm(store, draft, setState, caps, fromText);
    }
    return [
      {
        kind: "text",
        text: "No te entendí ese color.\n\nElegí uno de la lista, escribí el nombre (ej. verde) o mandame un audio 🎤.",
      },
      accentPickMessage(store, caps),
    ];
  }

  if (state === "ACCENT_CONFIRM" && store) {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.NO || isNegative(text) || /otro/.test(normalizeLoose(text))) {
      return openAccentPick(store, clearStockDraft(draft), setState, caps);
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      const hex = normalizeAccentHex(draft.accentColorPending);
      if (!hex) {
        return openAccentPick(store, clearStockDraft(draft), setState, caps);
      }
      const updated = await updateStoreAccentColor(store.id, hex);
      revalidateStore(store.slug);
      const label =
        draft.accentLabelPending || swatchByHex(hex)?.label || hex;
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: updated?.slug
            ? `¡Listo! Ya puse el color **${label}** en tu página.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
            : `¡Listo! Ya puse el color **${label}** en tu página.\n\n¿Querés cambiar algo más?`,
        },
        menuMessage(caps, msg.from),
      ];
    }
    const pending = draft.accentColorPending
      ? {
          label: draft.accentLabelPending || draft.accentColorPending,
          hex: draft.accentColorPending,
        }
      : null;
    if (!pending) {
      return openAccentPick(store, clearStockDraft(draft), setState, caps);
    }
    return [
      accentConfirmMessage(pending, store, caps),
    ];
  }

  if (state === "KIND_PICK" && store) {
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice?.startsWith(CHOICE.KIND_PREFIX)) {
      const kind = kindById(choice.slice(CHOICE.KIND_PREFIX.length));
      if (kind) {
        return startKindConfirm(store, draft, setState, caps, kind);
      }
    }
    const fromText = matchBusinessKindFromText(msg.text ?? "");
    if (fromText) {
      return startKindConfirm(store, draft, setState, caps, fromText);
    }
    return [
      {
        kind: "text",
        text: "No te entendí el tipo de negocio.\n\nElegí Artesanal, Comida o Ropa (o escribí «cerámica», «comida», «ropa»). También podés mandarme un audio 🎤.",
      },
      kindPickMessage(store, caps),
    ];
  }

  if (state === "KIND_CONFIRM" && store) {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.NO || isNegative(text) || /otro/.test(normalizeLoose(text))) {
      return openKindPick(store, clearStockDraft(draft), setState, caps);
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      const kind = normalizeBusinessKind(draft.businessKindPending);
      if (!kind) {
        return openKindPick(store, clearStockDraft(draft), setState, caps);
      }
      const updated = await updateStoreBusinessKind(store.id, kind);
      revalidateStore(store.slug);
      const label =
        draft.businessKindLabelPending || kindById(kind)?.label || kind;
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: updated?.slug
            ? `¡Listo! Tu negocio quedó como **${label}**. Mirá el marco en las fotos: ${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
            : `¡Listo! Tu negocio quedó como **${label}**.\n\n¿Querés cambiar algo más?`,
        },
        menuMessage(caps, msg.from),
      ];
    }
    const pendingId = normalizeBusinessKind(draft.businessKindPending);
    if (!pendingId) {
      return openKindPick(store, clearStockDraft(draft), setState, caps);
    }
    return [
      kindConfirmMessage(
        {
          id: pendingId,
          label: draft.businessKindLabelPending || kindById(pendingId)?.label || pendingId,
        },
        store,
        caps,
      ),
    ];
  }

  if (state === "THEME_PICK" && store) {
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice?.startsWith(CHOICE.THEME_PREFIX)) {
      const theme = themeById(choice.slice(CHOICE.THEME_PREFIX.length));
      if (theme) {
        return startThemeConfirm(store, draft, setState, caps, theme);
      }
    }
    const fromText = matchThemeFromText(msg.text ?? "");
    if (fromText) {
      return startThemeConfirm(store, draft, setState, caps, fromText);
    }
    return [
      {
        kind: "text",
        text: "No te entendí ese estilo.\n\nElegí Claro WA, Crema artesanal u Oscuro suave. También podés mandarme un audio 🎤.",
      },
      themePickMessage(store, caps),
    ];
  }

  if (state === "THEME_CONFIRM" && store) {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.NO || isNegative(text) || /otro/.test(normalizeLoose(text))) {
      return openThemePick(store, clearStockDraft(draft), setState, caps);
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      const theme = normalizeStoreTheme(draft.themePending);
      if (!theme) {
        return openThemePick(store, clearStockDraft(draft), setState, caps);
      }
      const updated = await updateStoreTheme(store.id, theme);
      revalidateStore(store.slug);
      const label =
        draft.themeLabelPending || themeById(theme)?.label || theme;
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: updated?.slug
            ? `¡Listo! Ya cambié el estilo a **${label}**.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
            : `¡Listo! Ya cambié el estilo a **${label}**.\n\n¿Querés cambiar algo más?`,
        },
        menuMessage(caps, msg.from),
      ];
    }
    const pendingId = normalizeStoreTheme(draft.themePending);
    if (!pendingId) {
      return openThemePick(store, clearStockDraft(draft), setState, caps);
    }
    const opt = themeById(pendingId)!;
    return [
      themeConfirmMessage(
        {
          id: pendingId,
          label: draft.themeLabelPending || opt.label,
          blurb: opt.blurb,
        },
        store,
        caps,
      ),
    ];
  }

  if (state === "WELCOME_INPUT" && store) {
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.WELCOME_CLEAR || wantsClearWelcomeText(msg.text ?? "")) {
      return startWelcomeConfirm(store, draft, setState, caps, null);
    }
    const raw = msg.text?.trim() ?? "";
    if (!raw) {
      return [
        {
          kind: "text",
          text: "Escribí la frase, o tocá Sin frase / Cancelar.",
        },
        welcomeAskMessage(store, caps),
      ];
    }
    const extracted =
      extractWelcomeFromText(raw) ?? normalizeWelcomeMessage(raw);
    if (!extracted) {
      return [
        {
          kind: "text",
          text: "No te entendí el saludo.\n\nProbá algo corto, tipo «Envíos a todo el país». También podés mandarme un audio 🎤.",
        },
        welcomeAskMessage(store, caps),
      ];
    }
    return startWelcomeConfirm(store, draft, setState, caps, extracted);
  }

  if (state === "WELCOME_CONFIRM" && store) {
    const text = msg.text?.trim() ?? "";
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    if (choice === CHOICE.NO || isNegative(text) || /otro/.test(normalizeLoose(text))) {
      return openWelcomeAsk(store, clearStockDraft(draft), setState, caps);
    }
    if (choice === CHOICE.YES || isAffirmative(text)) {
      // string vacío = borrar; texto = guardar.
      if (typeof draft.welcomeMessagePending !== "string") {
        return openWelcomeAsk(store, clearStockDraft(draft), setState, caps);
      }
      const welcome = normalizeWelcomeMessage(draft.welcomeMessagePending);
      const updated = await updateStoreWelcomeMessage(store.id, welcome);
      revalidateStore(store.slug);
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: welcome
            ? updated?.slug
              ? `¡Listo! Ya puse el saludo en tu página.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
              : "¡Listo! Ya puse el saludo en tu página.\n\n¿Querés cambiar algo más?"
            : updated?.slug
              ? `¡Listo! Saqué el saludo de tu página.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
              : "¡Listo! Saqué el saludo de tu página.\n\n¿Querés cambiar algo más?",
        },
        menuMessage(caps, msg.from),
      ];
    }
    if (typeof draft.welcomeMessagePending !== "string") {
      return openWelcomeAsk(store, clearStockDraft(draft), setState, caps);
    }
    return [
      welcomeConfirmMessage(
        normalizeWelcomeMessage(draft.welcomeMessagePending),
        store,
        caps,
      ),
    ];
  }

  if (state === "OPEN_NOW_PICK" && store) {
    const text = normalizeLoose(msg.text ?? "");
    if (choice === CHOICE.MENU_BACK) {
      await setState("IDLE", clearStockDraft(draft));
      return [menuMessage(caps, msg.from)];
    }
    const wantOpen =
      choice === CHOICE.OPEN_NOW_YES ||
      /^(abierto|abrir|si|sí)$/.test(text) ||
      /estamos abiertos|marcar abierto/.test(text);
    const wantClosed =
      choice === CHOICE.OPEN_NOW_NO ||
      /^(cerrado|cerrar|no)$/.test(text) ||
      /marcar cerrado|estamos cerrados/.test(text);
    if (wantOpen || wantClosed) {
      const openNow = wantOpen;
      const updated = await updateStoreOpenNow(store.id, openNow);
      revalidateStore(store.slug);
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: openNow
            ? updated?.slug
              ? `¡Listo! El cartelito ahora dice **Abierto**.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
              : "¡Listo! El cartelito ahora dice **Abierto**.\n\n¿Querés cambiar algo más?"
            : updated?.slug
              ? `¡Listo! El cartelito ahora dice **Cerrado**.\n${storeUrl(updated.slug)}\n\n¿Querés cambiar algo más?`
              : "¡Listo! El cartelito ahora dice **Cerrado**.\n\n¿Querés cambiar algo más?",
        },
        menuMessage(caps, msg.from),
      ];
    }
    return [openNowPickMessage(store, caps)];
  }

  if (state === "PHOTO_INPUT" && store) {
    const product = draft.stockProductId
      ? await getProduct(draft.stockProductId)
      : null;
    if (!product || product.storeId !== store.id) {
      await setState("IDLE", clearStockDraft(draft));
      return [
        {
          kind: "text",
          text: "No encontré ese producto.\n\nDecime **Ver mis productos** o **Cancelar** para volver — no se borra nada.",
        },
        menuMessage(caps, msg.from),
      ];
    }
    if (msg.media?.kind !== "image") {
      replies.push(
        withCancelEscape(
          `Necesito la foto nueva de "${product.title}". Mandamela cuando puedas (o escribí cancelar).`,
          caps,
        ),
      );
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
        {
          kind: "text",
          text: "No encontré ese producto.\n\nDecime **Ver mis productos** o **Cancelar** para volver — no se borra nada.",
        },
        menuMessage(caps, msg.from),
      ];
    }
    const price = msg.text ? parsePriceToCents(msg.text) : null;
    if (price == null) {
      replies.push(
        withCancelEscape(
          `No te entendí el precio. Hoy "${product.title}" sale ${formatPriceArs(product.priceCents)}.\n\nProbá con 15 mil o 15000 (texto o audio 🎤). **Cancelar** te saca sin cambiar nada.`,
          caps,
        ),
      );
      return replies;
    }
    return continuePriceEdit(store, draft, setState, caps, product, price);
  }

  if (state === "PRODUCT_PHOTO") {
    if (msg.media?.kind === "image") {
      return startProductFromImage(msg, draft, caps, setState);
    }
    replies.push(
      withCancelEscape(
        "Necesito la foto del producto. Mandamela cuando puedas.",
        caps,
      ),
    );
    return replies;
  }

  if (state === "PRODUCT_TITLE") {
    const title = msg.text?.trim();
    if (!title) {
      replies.push(
        withCancelEscape(
          '¿Cómo se llama el producto?\n\nDecilo por audio 🎤 o escribilo. Por ejemplo: "Taza de cerámica".',
          caps,
        ),
      );

      return replies;
    }
    const product = {
      ...productDraft(draft),
      title,
      category: undefined,
      material: undefined,
      categorySuggested: undefined,
      materialSuggested: undefined,
      categoryConfirmed: false,
      materialConfirmed: false,
    };
    draft = { ...draft, product };
    if (product.priceCents == null) {
      await setState("PRODUCT_PRICE", draft);
      replies.push(
        withCancelEscape(
          '¿A cómo la vendés?\n\nDecime el precio por audio 🎤 o escrito. Por ejemplo: "quince mil" o 15000.',
          caps,
        ),
      );
      return replies;
    }
    return replyWithChoices(
      draft,
      setState,
      "PRODUCT_DESC",
      withOptions(
        "¿Querés contar algo del producto?\n\nPodés hablarme 🎤, escribirlo o saltar.",
        [{ id: CHOICE.SKIP, label: "Saltar" }],
        caps,
      ),
    );
  }

  if (state === "PRODUCT_PRICE") {
    const price = msg.text ? parsePriceToCents(msg.text) : null;
    if (price == null) {
      replies.push(
        withCancelEscape(
          "No te entendí el precio.\n\nProbá con 15 mil o 15000 (texto o audio 🎤). **Cancelar** te saca sin guardar nada.",
          caps,
        ),
      );
      return replies;
    }
    const product = { ...productDraft(draft), priceCents: price };
    draft = { ...draft, product };
    return replyWithChoices(
      draft,
      setState,
      "PRODUCT_DESC",
      withOptions(
        "¿Querés contar algo del producto?\n\nPodés hablarme 🎤, escribirlo o saltar.",
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
    return beginProductCategoryFlow(store, draft, setState, caps);
  }

  if (state === "PRODUCT_CATEGORY_CONFIRM") {
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.META_USE ||
      choice === CHOICE.YES ||
      isAffirmative(text) ||
      /^usar$/i.test(text)
    ) {
      const p = productDraft(draft);
      const next = {
        ...p,
        category: p.categorySuggested?.trim() || null,
        categoryConfirmed: true,
      };
      return beginProductMaterialFlow(
        store,
        { ...draft, product: next },
        setState,
        caps,
      );
    }
    if (
      choice === CHOICE.META_EDIT ||
      choice === CHOICE.CHANGE ||
      /^cambiar$/i.test(text)
    ) {
      return replyWithChoices(
        draft,
        setState,
        "PRODUCT_CATEGORY_EDIT",
        withOptions(
          "Escribí la categoría que quieras (ej. Tazas, Abrigos, Pastas):",
          [{ id: CHOICE.META_SKIP, label: "Saltar" }],
          caps,
        ),
      );
    }
    if (choice === CHOICE.META_SKIP || /^saltar$/i.test(text)) {
      const next = {
        ...productDraft(draft),
        category: null,
        categoryConfirmed: true,
      };
      return beginProductMaterialFlow(
        store,
        { ...draft, product: next },
        setState,
        caps,
      );
    }
    if (text) {
      const next = {
        ...productDraft(draft),
        category: text,
        categoryConfirmed: true,
      };
      return beginProductMaterialFlow(
        store,
        { ...draft, product: next },
        setState,
        caps,
      );
    }
    return [
      categoryConfirmMessage(productDraft(draft).categorySuggested, caps),
    ];
  }

  if (state === "PRODUCT_CATEGORY_EDIT") {
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.META_SKIP ||
      choice === CHOICE.SKIP ||
      /^saltar$/i.test(text)
    ) {
      const next = {
        ...productDraft(draft),
        category: null,
        categoryConfirmed: true,
      };
      return beginProductMaterialFlow(
        store,
        { ...draft, product: next },
        setState,
        caps,
      );
    }
    if (!text) {
      return replyWithChoices(
        draft,
        setState,
        "PRODUCT_CATEGORY_EDIT",
        withOptions(
          "Escribí la categoría (ej. Tazas) o tocá Saltar.",
          [{ id: CHOICE.META_SKIP, label: "Saltar" }],
          caps,
        ),
      );
    }
    const next = {
      ...productDraft(draft),
      category: text,
      categoryConfirmed: true,
    };
    return beginProductMaterialFlow(
      store,
      { ...draft, product: next },
      setState,
      caps,
    );
  }

  if (state === "PRODUCT_MATERIAL_CONFIRM") {
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.META_USE ||
      choice === CHOICE.YES ||
      isAffirmative(text) ||
      /^usar$/i.test(text)
    ) {
      const p = productDraft(draft);
      const next = {
        ...p,
        material: p.materialSuggested?.trim() || null,
        materialConfirmed: true,
      };
      return goToProductConfirm({ ...draft, product: next }, setState, caps);
    }
    if (
      choice === CHOICE.META_EDIT ||
      choice === CHOICE.CHANGE ||
      /^cambiar$/i.test(text)
    ) {
      return replyWithChoices(
        draft,
        setState,
        "PRODUCT_MATERIAL_EDIT",
        withOptions(
          "Escribí el material (ej. Cerámica esmaltada, Madera, Lana):",
          [{ id: CHOICE.META_SKIP, label: "Saltar" }],
          caps,
        ),
      );
    }
    if (choice === CHOICE.META_SKIP || /^saltar$/i.test(text)) {
      const next = {
        ...productDraft(draft),
        material: null,
        materialConfirmed: true,
      };
      return goToProductConfirm({ ...draft, product: next }, setState, caps);
    }
    if (text) {
      const next = {
        ...productDraft(draft),
        material: text,
        materialConfirmed: true,
      };
      return goToProductConfirm({ ...draft, product: next }, setState, caps);
    }
    return [
      materialConfirmMessage(productDraft(draft).materialSuggested, caps),
    ];
  }

  if (state === "PRODUCT_MATERIAL_EDIT") {
    const text = msg.text?.trim() ?? "";
    if (
      choice === CHOICE.META_SKIP ||
      choice === CHOICE.SKIP ||
      /^saltar$/i.test(text)
    ) {
      const next = {
        ...productDraft(draft),
        material: null,
        materialConfirmed: true,
      };
      return goToProductConfirm({ ...draft, product: next }, setState, caps);
    }
    if (!text) {
      return replyWithChoices(
        draft,
        setState,
        "PRODUCT_MATERIAL_EDIT",
        withOptions(
          "Escribí el material (ej. Cerámica) o tocá Saltar.",
          [{ id: CHOICE.META_SKIP, label: "Saltar" }],
          caps,
        ),
      );
    }
    const next = {
      ...productDraft(draft),
      material: text,
      materialConfirmed: true,
    };
    return goToProductConfirm({ ...draft, product: next }, setState, caps);
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
        category: p.category ?? null,
        material: p.material ?? null,
        quantity: store.tracksQuantity ? 1 : null,
      });
      revalidateStore(store.slug);
      draft = { ...draft, product: undefined };
      await setState("IDLE", draft);
      const qtyHint = store.tracksQuantity
        ? " Quedó con 1 unidad (podés cambiarla por audio o desde Productos)."
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
    withCancelEscape(
      `¿A cómo querés dejar "${product.title}"?\nHoy sale ${formatPriceArs(product.priceCents)}.\n\nDecime el precio nuevo por audio 🎤 o escrito.`,
      caps,
    ),
  ];
}

async function openPersonalizeHub(
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("PERSONALIZE_HUB", clearStockDraft(draft));
  return [personalizeHubMessage(caps)];
}

async function openAccentPick(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("ACCENT_PICK", clearStockDraft(draft));
  return [accentPickMessage(store, caps)];
}

async function startAccentConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  swatch: Pick<AccentSwatch, "label" | "hex">,
): Promise<OutboundMessage[]> {
  const hex = normalizeAccentHex(swatch.hex) ?? swatch.hex.toLowerCase();
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    accentColorPending: hex,
    accentLabelPending: swatch.label,
  };
  await setState("ACCENT_CONFIRM", nextDraft);
  return [accentConfirmMessage({ label: swatch.label, hex }, store, caps)];
}

async function openKindPick(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("KIND_PICK", clearStockDraft(draft));
  return [kindPickMessage(store, caps)];
}

async function startKindConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  kind: Pick<BusinessKindOption, "label" | "id">,
): Promise<OutboundMessage[]> {
  const id = normalizeBusinessKind(kind.id) ?? kind.id;
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    businessKindPending: id,
    businessKindLabelPending: kind.label,
  };
  await setState("KIND_CONFIRM", nextDraft);
  return [kindConfirmMessage({ id: id as BusinessKindOption["id"], label: kind.label }, store, caps)];
}

async function openThemePick(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("THEME_PICK", clearStockDraft(draft));
  return [themePickMessage(store, caps)];
}

async function startThemeConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  theme: StoreThemeOption,
): Promise<OutboundMessage[]> {
  const id = normalizeStoreTheme(theme.id) ?? theme.id;
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    themePending: id,
    themeLabelPending: theme.label,
  };
  await setState("THEME_CONFIRM", nextDraft);
  return [
    themeConfirmMessage(
      { id: id as StoreThemeOption["id"], label: theme.label, blurb: theme.blurb },
      store,
      caps,
    ),
  ];
}

async function openWelcomeAsk(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("WELCOME_INPUT", clearStockDraft(draft));
  return [welcomeAskMessage(store, caps)];
}

async function openOpenNowPick(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("OPEN_NOW_PICK", clearStockDraft(draft));
  return [openNowPickMessage(store, caps)];
}

async function startWelcomeConfirm(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  phrase: string | null,
): Promise<OutboundMessage[]> {
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    welcomeMessagePending: phrase ?? "",
  };
  await setState("WELCOME_CONFIRM", nextDraft);
  return [welcomeConfirmMessage(phrase, store, caps)];
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
        text: "Primero terminá de armar la tienda; después ponemos la foto o logo del negocio.",
      },
      menuMessage(caps, from),
    ];
  }
  return null;
}

const PROFILE_ICON_LABEL = "Usar mi foto de Google";

async function profileIconOption(
  msg: InboundMessage,
  store: Store,
): Promise<Option[]> {
  const url = await resolveClerkProfileImageUrl({
    hint: msg.ownerImageUrl,
    channelIdentity: msg.from,
    clerkUserId: store.clerkUserId,
  });
  if (!url) return [];
  return [{ id: CHOICE.ICON_FROM_PROFILE, label: PROFILE_ICON_LABEL }];
}

async function iconPreviewOptions(
  msg: InboundMessage,
  store: Store,
  uploadLabel = "Subir mi imagen",
): Promise<Option[]> {
  return [
    { id: CHOICE.ICON_REGEN, label: "Generar otro" },
    { id: CHOICE.ICON_UPLOAD, label: uploadLabel },
    ...(await profileIconOption(msg, store)),
    { id: CHOICE.ICON_DONE, label: "Listo" },
  ];
}

/** Hub: armar con el bot, subir imagen o usar foto de cuenta (producto ≠ icono). */
async function openStoreIconHub(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(
    store,
    draft,
    setState,
    caps,
    msg.from,
  );
  if (blocked) return blocked;

  await setState("ICON_HUB", clearStockDraft(draft));
  const profileOpt = await profileIconOption(msg, store);
  const replies: OutboundMessage[] = [
    {
      kind: "text",
      text:
        "¿Qué imagen querés cambiar?\n\n" +
        "1️⃣ La foto de un producto que vendés (eso va por Productos).\n\n" +
        "2️⃣ La foto principal (logo) de tu negocio — el cuadrito de la app.\n\n" +
        "Acá armamos el logo: podés pedirme que lo dibuje por audio 🎤, subir tu imagen" +
        (profileOpt.length
          ? ", o usar tu foto de Google/cuenta."
          : ".") +
        "\n\nSi te equivocás, decí Cancelar: no se borra tu tienda.",
    },
  ];
  if (store.icon512Url) {
    replies.push({
      kind: "image",
      url: store.icon512Url,
      caption: "Así se ve ahora tu logo",
    });
  }
  replies.push(
    withOptions(
      "¿Cómo armamos el logo de tu negocio?",
      [
        { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
        { id: CHOICE.ICON_UPLOAD, label: "Subir mi imagen" },
        ...profileOpt,
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
    return applyUploadedStoreIcon(store, draft, setState, caps, msg);
  }
  if (
    choice === CHOICE.ICON_FROM_PROFILE ||
    /usar mi foto|foto de (google|cuenta|perfil)/.test(text)
  ) {
    return applyProfileStoreIcon(store, draft, setState, caps, msg);
  }
  if (
    choice === CHOICE.ICON_UPLOAD ||
    /sub(ir|í|i)|mand(ar|á|a)|cargar|propio/.test(text)
  ) {
    return askStoreIconUpload(store, draft, setState, caps, msg);
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
      msg,
      msg.text,
    );
  }
  if (choice === CHOICE.ICON_DONE || choice === CHOICE.MENU_BACK) {
    await setState("IDLE", draft);
    return [menuMessage(caps, msg.from)];
  }
  return openStoreIconHub(store, draft, setState, caps, msg);
}

async function askStoreIconUpload(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(
    store,
    draft,
    setState,
    caps,
    msg.from,
  );
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
        ...(await profileIconOption(msg, store)),
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
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(
    store,
    draft,
    setState,
    caps,
    msg.from,
  );
  if (blocked) return blocked;
  if (msg.media?.kind !== "image") {
    return askStoreIconUpload(store, draft, setState, caps, msg);
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
          ? "Tardó demasiado preparar tu foto del negocio. Probá con una imagen más chica."
          : "No pude usar esa imagen.\n\nProbá con otra JPG o PNG (no muy pesada), o **Volver al menú**.",
      },
      withOptions(
        "¿Qué hacemos?",
        [
          { id: CHOICE.ICON_UPLOAD, label: "Probar otra imagen" },
          { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
          ...(await profileIconOption(msg, store)),
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
      caption: "Así queda la foto de tu negocio con la imagen que mandaste.",
    },
    withOptions(
      "¿Lo dejamos así?",
      await iconPreviewOptions(msg, store, "Subir otro"),
      caps,
    ),
  ];
}

/**
 * Foto de perfil Clerk/Google → mismos PNG 192/512/180 que la subida manual.
 */
async function applyProfileStoreIcon(
  store: Store,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
  msg: InboundMessage,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(
    store,
    draft,
    setState,
    caps,
    msg.from,
  );
  if (blocked) return blocked;

  const imageUrl = await resolveClerkProfileImageUrl({
    hint: msg.ownerImageUrl,
    channelIdentity: msg.from,
    clerkUserId: store.clerkUserId,
  });
  if (!imageUrl) {
    return [
      {
        kind: "text",
        text:
          "Para usar tu foto de cuenta necesitás entrar con Google (u otra cuenta que tenga foto de perfil).",
      },
      withOptions(
        "¿Qué querés hacer?",
        [
          { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
          { id: CHOICE.ICON_UPLOAD, label: "Subir mi imagen" },
          { id: CHOICE.MENU_BACK, label: "Volver al menú" },
        ],
        caps,
      ),
    ];
  }

  let icons;
  try {
    const bytes = await fetchClerkProfileImageBytes(imageUrl);
    icons = await buildAndUploadStoreIconsFromImage({
      storeId: store.id,
      imageBytes: bytes,
    });
  } catch (err) {
    const timedOut = err instanceof Error && /timeout/i.test(err.message);
    console.warn("[bot] store icon from profile failed", err);
    await setState("ICON_HUB", clearStockDraft(draft));
    return [
      {
        kind: "text",
        text: timedOut
          ? "Tardó demasiado bajar tu foto de cuenta. Probá de nuevo en un rato."
          : "No pude usar tu foto de cuenta ahora.\n\nProbá subir una imagen, que lo arme el bot, o **Volver al menú**.",
      },
      withOptions(
        "¿Qué hacemos?",
        [
          { id: CHOICE.ICON_GENERATE, label: "Que lo arme el bot" },
          { id: CHOICE.ICON_UPLOAD, label: "Subir mi imagen" },
          { id: CHOICE.ICON_FROM_PROFILE, label: PROFILE_ICON_LABEL },
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
    iconSvgUrl: null,
  });
  if (updated) store = updated;
  revalidateStore(store.slug);
  await setState("ICON_PREVIEW", clearStockDraft(draft));

  return [
    {
      kind: "image",
      url: icons.icon512Url,
      caption: "Así queda la foto de tu negocio con tu foto de cuenta.",
    },
    withOptions(
      "¿Lo dejamos así?",
      await iconPreviewOptions(msg, store, "Subir otro"),
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
  msg: InboundMessage,
  chatHint?: string,
): Promise<OutboundMessage[]> {
  const blocked = await ensureStoreIconReady(
    store,
    draft,
    setState,
    caps,
    msg.from,
  );
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
          ? "Tardó demasiado armar la foto del negocio. Probá de nuevo en un rato, o pedime el menú."
          : "No pude armar la foto del negocio ahora.\n\nProbá de nuevo en un rato, o pedime el menú.",
      },
      menuMessage(caps, msg.from),
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
    ? `Armé esta foto del negocio con lo que pediste (“${usedHint.slice(0, 80)}”). ¿Querés otra diferente?`
    : "En base a tus productos o al nombre de la tienda te armé esta foto del negocio. ¿Querés otra diferente?";

  return [
    {
      kind: "image",
      url: icons.icon512Url,
      caption,
    },
    withOptions(
      "¿Lo dejamos así?",
      await iconPreviewOptions(msg, store),
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
    return continuePhotoEdit(store, draft, setState, matches[0]!, caps);
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
  caps: ChannelCapabilities = DEFAULT_CAPS,
): Promise<OutboundMessage[]> {
  const nextDraft: ConversationDraft = {
    ...clearStockDraft(draft),
    stockProductId: product.id,
    stockAction: "change_photo",
  };
  await setState("PHOTO_INPUT", nextDraft);
  return [
    withCancelEscape(
      `Mandá la foto nueva de "${product.title}". Cuando la reciba te pido confirmación antes de guardar.`,
      caps,
    ),
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
        text: `¿Cuántas unidades de "${product.title}" quedan?\n\nDecime un número por audio 🎤 o escrito (puede ser 0).`,
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
      ? "¡Listo! Ahora llevás cantidades con números por producto.\n\n¿Querés cambiar algo más?"
      : "¡Listo! Ahora solo marcás Agotado o Disponible.\n\n¿Querés cambiar algo más?";
  }

  const product = draft.stockProductId
    ? await getProduct(draft.stockProductId)
    : null;
  if (!product || product.storeId !== store.id) {
    return "No encontré ese producto.\n\nDecime **Ver mis productos** o **Cancelar** para volver — no se borra nada.";
  }

  if (draft.stockAction === "pause") {
    await updateProduct(product.id, {
      inStock: false,
      ...(store.tracksQuantity ? { quantity: 0 } : {}),
    });
    return `¡Listo! Avisé que "${product.title}" no queda.\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "resume") {
    await updateProduct(product.id, { inStock: true });
    return `¡Listo! "${product.title}" volvió a estar a la venta.\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "set_qty") {
    const qty = draft.stockQtyPending ?? 0;
    await updateProduct(product.id, { quantity: qty });
    return qty === 0
      ? `¡Listo! "${product.title}" quedó en 0 y se ve como Agotado.\n\n¿Querés cambiar algo más?`
      : `¡Listo! Guardé ${qty} unidades de "${product.title}".\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "hide") {
    await updateProduct(product.id, { hidden: true });
    return `¡Listo! Oculté "${product.title}" de la tienda (no se borró).\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "show") {
    await updateProduct(product.id, { hidden: false });
    return `¡Listo! Volví a mostrar "${product.title}" en la tienda.\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "set_price") {
    const price = draft.stockPricePending;
    if (price == null) {
      return "No te entendí el precio nuevo.\n\nProbá con 15 mil o 15000, o mandame un audio 🎤.";
    }
    await updateProduct(product.id, { priceCents: price });
    return `¡Listo! Ya cambié el precio de "${product.title}" a ${formatPriceArs(price)}.\n\n¿Querés cambiar algo más?`;
  }
  if (draft.stockAction === "change_photo") {
    const imageUrl = draft.stockPhotoUrlPending;
    if (!imageUrl) {
      return "No recibí la foto nueva.\n\nMandame otra, o **Cancelar** para volver — no se borra nada.";
    }
    await updateProduct(product.id, {
      imageUrl,
      imageBlobKey: draft.stockPhotoBlobKeyPending ?? null,
    });
    return `¡Listo! Ya actualicé la foto de "${product.title}".\n\n¿Querés cambiar algo más?`;
  }
  return "¡Listo!\n\n¿Querés cambiar algo más?";
}

async function startProductFromImage(
  msg: InboundMessage,
  draft: ConversationDraft,
  caps: ChannelCapabilities,
  setState: (s: BotState, d?: ConversationDraft) => Promise<void>,
): Promise<OutboundMessage[]> {
  const { imageUrl, imageBlobKey } = await resolveInboundImage(msg);

  const hints = msg.text ? parseCaptionHints(msg.text) : {};
  let workingDraft = draft;
  let queuedTitle: string | undefined;
  if (!hints.title) {
    const taken = takeNextQueuedProductTitle(workingDraft);
    workingDraft = taken.draft;
    queuedTitle = taken.title;
  }
  const product: ProductDraft = {
    imageUrl,
    imageBlobKey,
    title: hints.title ?? queuedTitle,
    priceCents: hints.priceCents,
  };
  const nextDraft = { ...workingDraft, product };

  if (!product.title) {
    await setState("PRODUCT_TITLE", nextDraft);
    return [
      withCancelEscape(
        '¿Cómo se llama el producto?\n\nDecilo por audio 🎤 o escribilo. Por ejemplo: "Taza de cerámica".',
        caps,
      ),
    ];
  }
  if (product.priceCents == null) {
    await setState("PRODUCT_PRICE", nextDraft);
    return [
      withCancelEscape(
        '¿A cómo la vendés?\n\nDecime el precio por audio 🎤 o escrito. Por ejemplo: "quince mil" o 15000.',
        caps,
      ),
    ];
  }
  const { draft: withChoices, message } = withPendingChoices(
    nextDraft,
    withOptions(
      "¿Querés contar algo del producto?\n\nPodés hablarme 🎤, escribirlo o saltar.",

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
  const metaLines: string[] = [];
  if (product.category?.trim()) {
    metaLines.push(`Categoría: ${product.category.trim()}`);
  }
  if (product.material?.trim()) {
    metaLines.push(`Material: ${product.material.trim()}`);
  }
  const caption = `${product.title ?? "Producto"} · ${formatPriceArs(product.priceCents ?? null)}${
    product.description ? `\n${product.description}` : ""
  }${metaLines.length ? `\n${metaLines.join(" · ")}` : ""}`;
  const options = [
    { id: CHOICE.PUBLISH, label: "Publicar" },
    { id: CHOICE.CHANGE, label: "Cambiar algo" },
  ];
  if (product.imageUrl) {
    return imageWithOptions(product.imageUrl, caption, options, caps);
  }
  return [withOptions(`Así quedaría:\n${caption}`, options, caps)];
}

function categoryConfirmMessage(
  suggested: string | null | undefined,
  caps: ChannelCapabilities,
): OutboundMessage {
  const label = suggested?.trim();
  if (!label) {
    return withOptions(
      "¿Querés ponerle una categoría? Aparece en los filtros de tu página.",
      [
        { id: CHOICE.META_EDIT, label: "Escribir" },
        { id: CHOICE.META_SKIP, label: "Saltar" },
      ],
      caps,
    );
  }
  return withOptions(
    `Según el título, sugerí la categoría «${label}». ¿La usamos?`,
    [
      { id: CHOICE.META_USE, label: "Usar" },
      { id: CHOICE.META_EDIT, label: "Cambiar" },
    ],
    caps,
  );
}

function materialConfirmMessage(
  suggested: string | null | undefined,
  caps: ChannelCapabilities,
): OutboundMessage {
  const label = suggested?.trim();
  if (!label) {
    return withOptions(
      "¿Querés indicar el material de la pieza? Se muestra como una etiqueta en tu página.",
      [
        { id: CHOICE.META_EDIT, label: "Escribir" },
        { id: CHOICE.META_SKIP, label: "Saltar" },
      ],
      caps,
    );
  }
  return withOptions(
    `Para esta pieza artesanal sugerí el material «${label}». ¿Lo usamos?`,
    [
      { id: CHOICE.META_USE, label: "Usar" },
      { id: CHOICE.META_EDIT, label: "Cambiar" },
    ],
    caps,
  );
}

async function goToProductConfirm(
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  await setState("PRODUCT_CONFIRM", draft);
  return productConfirmMessages(productDraft(draft), caps);
}

/**
 * Tras la descripción: sugerir categoría (AI + heurística) y pedir Usar/Cambiar.
 */
async function beginProductCategoryFlow(
  store: Store | null,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  const p = productDraft(draft);
  if (p.categoryConfirmed) {
    return beginProductMaterialFlow(store, draft, setState, caps);
  }

  const suggestion = await suggestProductMeta({
    title: p.title || "",
    description: p.description,
    businessKind: store?.businessKind,
  });

  const nextProduct: ProductDraft = {
    ...p,
    categorySuggested: suggestion.category,
    materialSuggested: suggestion.material,
  };
  const nextDraft = { ...draft, product: nextProduct };

  return replyWithChoices(
    nextDraft,
    setState,
    "PRODUCT_CATEGORY_CONFIRM",
    categoryConfirmMessage(suggestion.category, caps),
  );
}

/**
 * Tras categoría: si rubro artesanal, sugerir material; si no, ir a confirmar publicación.
 */
async function beginProductMaterialFlow(
  store: Store | null,
  draft: ConversationDraft,
  setState: SetState,
  caps: ChannelCapabilities,
): Promise<OutboundMessage[]> {
  const kind = resolveBusinessKind(store?.businessKind);
  if (kind !== "artesanal") {
    const cleared = {
      ...productDraft(draft),
      material: null,
      materialConfirmed: true,
    };
    return goToProductConfirm({ ...draft, product: cleared }, setState, caps);
  }

  const p = productDraft(draft);
  if (p.materialConfirmed) {
    return goToProductConfirm(draft, setState, caps);
  }

  let materialSuggested = p.materialSuggested ?? null;
  if (materialSuggested == null) {
    const suggestion = await suggestProductMeta({
      title: p.title || "",
      description: p.description,
      businessKind: store?.businessKind,
    });
    materialSuggested = suggestion.material;
  }

  const nextDraft = {
    ...draft,
    product: { ...p, materialSuggested },
  };

  return replyWithChoices(
    nextDraft,
    setState,
    "PRODUCT_MATERIAL_CONFIRM",
    materialConfirmMessage(materialSuggested, caps),
  );
}

import { and, asc, desc, eq } from "drizzle-orm";
import {
  clerkUserIdFromIdentity,
  isClerkIdentity,
} from "@/lib/channel-identity";
import { getDb, hasDatabaseUrl } from "@/lib/db/index";
import { getMemoryDb, newId, now } from "@/lib/db/memory";
import {
  channelLinkIntents,
  conversations,
  processedMessages,
  products,
  signupIntents,
  stores,
  type ChannelLinkIntent,
  type Conversation,
  type Product,
  type SignupIntent,
  type Store,
} from "@/lib/db/schema";
import { isWhatsAppContactPhone } from "@/lib/phone";

export type ProductDraft = {
  title?: string;
  description?: string;
  priceCents?: number | null;
  imageUrl?: string;
  imageBlobKey?: string;
  skipDesc?: boolean;
};

export type ConversationDraft = {
  ownerName?: string;
  storeName?: string;
  slug?: string;
  showPhone?: boolean;
  contactPhone?: string;
  /** onboarding → sigue el alta; edit → vuelve a IDLE tras guardar. */
  contactPhoneFlow?: "onboarding" | "edit";
  checkoutMode?: "whatsapp" | "cart";
  tracksQuantity?: boolean;
  signupCode?: string;
  product?: ProductDraft;
  editProductId?: string;
  /** Ids de opciones del último listado (para responder con número). */
  pendingChoices?: string[];
  /** Producto seleccionado en flujo de stock / precio. */
  stockProductId?: string;
  /** Acción pendiente de stock/precio/foto a confirmar. */
  stockAction?:
    | "pause"
    | "resume"
    | "set_qty"
    | "hide"
    | "show"
    | "set_mode"
    | "set_price"
    | "change_photo";
  /** Cantidad pendiente de confirmar. */
  stockQtyPending?: number;
  /** Precio pendiente de confirmar (centavos). */
  stockPricePending?: number;
  /** URL de foto nueva pendiente de confirmar. */
  stockPhotoUrlPending?: string;
  /** Blob key de foto nueva pendiente de confirmar. */
  stockPhotoBlobKeyPending?: string;
  /** Modo de stock pendiente (true = cantidades). */
  stockModePending?: boolean;
  [key: string]: unknown;
};

function touchStore(store: Store): Store {
  return { ...store, updatedAt: now() };
}

export async function getStoreByChannelIdentity(
  channelIdentity: string,
): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    for (const s of getMemoryDb().stores.values()) {
      if (s.channelIdentity === channelIdentity) return s;
    }
    return null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.channelIdentity, channelIdentity))
    .limit(1);
  return rows[0] ?? null;
}

/** @deprecated Usar getStoreByChannelIdentity */
export async function getStoreByPhone(phone: string): Promise<Store | null> {
  return getStoreByChannelIdentity(phone);
}

export async function getStoreByClerkUserId(
  clerkUserId: string,
): Promise<Store | null> {
  if (!clerkUserId) return null;
  if (!hasDatabaseUrl()) {
    for (const s of getMemoryDb().stores.values()) {
      if (s.clerkUserId === clerkUserId) return s;
    }
    return null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resuelve la tienda para un `msg.from`:
 * 1) match exacto de `channel_identity`
 * 2) si es `clerk:{id}`, match por `clerk_user_id` (vínculo con tienda WA)
 */
export async function getStoreForChannelIdentity(
  from: string,
): Promise<Store | null> {
  const direct = await getStoreByChannelIdentity(from);
  if (direct) return direct;
  const clerkUserId = clerkUserIdFromIdentity(from);
  if (clerkUserId) return getStoreByClerkUserId(clerkUserId);
  return null;
}

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    for (const s of getMemoryDb().stores.values()) {
      if (s.slug === slug) return s;
    }
    return null;
  }
  const db = getDb();
  const rows = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getStoreById(id: string): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().stores.get(id) ?? null;
  }
  const db = getDb();
  const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Lista tenants/tiendas (un registro por identidad de canal) para el panel admin. */
export async function listStores(): Promise<Store[]> {
  if (!hasDatabaseUrl()) {
    return [...getMemoryDb().stores.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  const db = getDb();
  return db.select().from(stores).orderBy(desc(stores.createdAt));
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().products.delete(id);
  }
  const db = getDb();
  const rows = await db.delete(products).where(eq(products.id, id)).returning();
  return rows.length > 0;
}

/**
 * Borra una tienda solo si es demo (simulador). Incluye sus productos.
 * Las tiendas reales no se eliminan desde el MVP del panel.
 */
export async function deleteDemoStore(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await getStoreById(id);
  if (!store) return { ok: false, error: "Tienda no encontrada" };
  if (!store.isDemo) {
    return { ok: false, error: "Solo se pueden borrar tiendas demo" };
  }

  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    for (const [pid, product] of mem.products) {
      if (product.storeId === id) mem.products.delete(pid);
    }
    mem.stores.delete(id);
    return { ok: true };
  }

  const db = getDb();
  await db.delete(products).where(eq(products.storeId, id));
  await db.delete(stores).where(eq(stores.id, id));
  return { ok: true };
}

export async function slugExists(slug: string): Promise<boolean> {
  return Boolean(await getStoreBySlug(slug));
}

export async function upsertStore(input: {
  channelIdentity: string;
  contactPhone?: string | null;
  clerkUserId?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  name?: string | null;
  slug?: string | null;
  showPhone?: boolean;
  checkoutMode?: "whatsapp" | "cart";
  tracksQuantity?: boolean;
  isDemo?: boolean;
  status?: string;
}): Promise<Store> {
  const clerkUserId =
    input.clerkUserId ?? clerkUserIdFromIdentity(input.channelIdentity);
  const existing =
    (await getStoreByChannelIdentity(input.channelIdentity)) ??
    (clerkUserId ? await getStoreByClerkUserId(clerkUserId) : null);

  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    if (existing) {
      const updated = touchStore({
        ...existing,
        // No pisar la identidad canónica (p.ej. WA) si llegamos por clerk:…
        contactPhone:
          input.contactPhone !== undefined
            ? input.contactPhone
            : existing.contactPhone,
        clerkUserId: clerkUserId ?? existing.clerkUserId,
        ownerEmail: input.ownerEmail ?? existing.ownerEmail,
        ownerName: input.ownerName ?? existing.ownerName,
        name: input.name ?? existing.name,
        slug: input.slug ?? existing.slug,
        showPhone: input.showPhone ?? existing.showPhone,
        checkoutMode: input.checkoutMode ?? existing.checkoutMode,
        tracksQuantity: input.tracksQuantity ?? existing.tracksQuantity,
        isDemo: input.isDemo ?? existing.isDemo,
        status: input.status ?? existing.status,
      });
      mem.stores.set(updated.id, updated);
      return updated;
    }
    const created: Store = {
      id: newId(),
      channelIdentity: input.channelIdentity,
      contactPhone: input.contactPhone ?? null,
      clerkUserId: clerkUserId ?? null,
      ownerEmail: input.ownerEmail ?? null,
      ownerName: input.ownerName ?? null,
      name: input.name ?? null,
      slug: input.slug ?? null,
      showPhone: input.showPhone ?? true,
      checkoutMode: input.checkoutMode ?? "whatsapp",
      tracksQuantity: input.tracksQuantity ?? false,
      icon192Url: null,
      icon512Url: null,
      iconAppleUrl: null,
      iconSvgUrl: null,
      isDemo: input.isDemo ?? false,
      status: input.status ?? "onboarding",
      createdAt: now(),
      updatedAt: now(),
    };
    mem.stores.set(created.id, created);
    return created;
  }

  const db = getDb();
  if (existing) {
    const rows = await db
      .update(stores)
      .set({
        contactPhone:
          input.contactPhone !== undefined
            ? input.contactPhone
            : existing.contactPhone,
        clerkUserId: clerkUserId ?? existing.clerkUserId,
        ownerEmail: input.ownerEmail ?? existing.ownerEmail,
        ownerName: input.ownerName ?? existing.ownerName,
        name: input.name ?? existing.name,
        slug: input.slug ?? existing.slug,
        showPhone: input.showPhone ?? existing.showPhone,
        checkoutMode: input.checkoutMode ?? existing.checkoutMode,
        tracksQuantity: input.tracksQuantity ?? existing.tracksQuantity,
        isDemo: input.isDemo ?? existing.isDemo,
        status: input.status ?? existing.status,
        updatedAt: now(),
      })
      .where(eq(stores.id, existing.id))
      .returning();
    return rows[0]!;
  }
  const rows = await db
    .insert(stores)
    .values({
      channelIdentity: input.channelIdentity,
      contactPhone: input.contactPhone ?? null,
      clerkUserId: clerkUserId ?? null,
      ownerEmail: input.ownerEmail ?? null,
      ownerName: input.ownerName ?? null,
      name: input.name ?? null,
      slug: input.slug ?? null,
      showPhone: input.showPhone ?? true,
      checkoutMode: input.checkoutMode ?? "whatsapp",
      tracksQuantity: input.tracksQuantity ?? false,
      isDemo: input.isDemo ?? false,
      status: input.status ?? "onboarding",
    })
    .returning();
  return rows[0]!;
}

async function countProductsForStore(storeId: string): Promise<number> {
  if (!hasDatabaseUrl()) {
    let n = 0;
    for (const p of getMemoryDb().products.values()) {
      if (p.storeId === storeId) n += 1;
    }
    return n;
  }
  const db = getDb();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.storeId, storeId));
  return rows.length;
}

/** Borra un stub de tienda (sin productos) — p.ej. huérfano clerk: tras vincular. */
async function deleteEmptyStore(storeId: string): Promise<boolean> {
  if ((await countProductsForStore(storeId)) > 0) return false;
  if (!hasDatabaseUrl()) {
    return getMemoryDb().stores.delete(storeId);
  }
  const db = getDb();
  const rows = await db.delete(stores).where(eq(stores.id, storeId)).returning();
  return rows.length > 0;
}

const CHANNEL_LINK_TTL_MS = 30 * 60 * 1000;

function randomLinkCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

/** Borra códigos previos del mismo Clerk (un vínculo activo a la vez). */
async function deleteChannelLinkIntentsForClerk(clerkUserId: string): Promise<void> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    for (const [code, intent] of mem.channelLinkIntents) {
      if (intent.clerkUserId === clerkUserId) mem.channelLinkIntents.delete(code);
    }
    return;
  }
  const db = getDb();
  await db
    .delete(channelLinkIntents)
    .where(eq(channelLinkIntents.clerkUserId, clerkUserId));
}

export async function createChannelLinkIntent(input: {
  clerkChannelIdentity: string;
  ownerEmail?: string | null;
}): Promise<{ code: string } | { error: string }> {
  const clerkUserId = clerkUserIdFromIdentity(input.clerkChannelIdentity);
  if (!clerkUserId || !isClerkIdentity(input.clerkChannelIdentity)) {
    return { error: "not_clerk" };
  }
  await deleteChannelLinkIntentsForClerk(clerkUserId);
  const code = randomLinkCode();
  const row: ChannelLinkIntent = {
    code,
    clerkUserId,
    clerkChannelIdentity: input.clerkChannelIdentity,
    ownerEmail: input.ownerEmail ?? null,
    createdAt: now(),
  };
  if (!hasDatabaseUrl()) {
    getMemoryDb().channelLinkIntents.set(code, row);
    return { code };
  }
  const db = getDb();
  await db.insert(channelLinkIntents).values(row);
  return { code };
}

export async function getChannelLinkIntent(
  code: string,
): Promise<ChannelLinkIntent | null> {
  const normalized = code.replace(/\D/g, "").slice(0, 6);
  if (normalized.length !== 6) return null;
  if (!hasDatabaseUrl()) {
    return getMemoryDb().channelLinkIntents.get(normalized) ?? null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(channelLinkIntents)
    .where(eq(channelLinkIntents.code, normalized))
    .limit(1);
  return rows[0] ?? null;
}

async function deleteChannelLinkIntent(code: string): Promise<void> {
  if (!hasDatabaseUrl()) {
    getMemoryDb().channelLinkIntents.delete(code);
    return;
  }
  const db = getDb();
  await db.delete(channelLinkIntents).where(eq(channelLinkIntents.code, code));
}

async function updateStoreIdentities(
  storeId: string,
  patch: {
    channelIdentity: string;
    clerkUserId: string;
    ownerEmail?: string | null;
    contactPhone?: string | null;
  },
): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.stores.get(storeId);
    if (!current) return null;
    const updated = touchStore({
      ...current,
      channelIdentity: patch.channelIdentity,
      clerkUserId: patch.clerkUserId,
      ownerEmail:
        patch.ownerEmail !== undefined ? patch.ownerEmail : current.ownerEmail,
      contactPhone:
        patch.contactPhone !== undefined
          ? patch.contactPhone
          : current.contactPhone,
    });
    mem.stores.set(storeId, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(stores)
    .set({
      channelIdentity: patch.channelIdentity,
      clerkUserId: patch.clerkUserId,
      ownerEmail: patch.ownerEmail,
      contactPhone: patch.contactPhone,
      updatedAt: now(),
    })
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Vincula un WhatsApp verificado (`waE164` = `msg.from` de Meta) a la cuenta Clerk
 * del código generado en `/asistente`. No usar el WhatsApp de pedidos como prueba.
 */
export async function linkVerifiedWaToClerkAccount(input: {
  waE164: string;
  code: string;
}): Promise<{ store: Store | null; linked: boolean; detail: string }> {
  if (!isWhatsAppContactPhone(input.waE164)) {
    return { store: null, linked: false, detail: "wa_not_valid" };
  }

  const intent = await getChannelLinkIntent(input.code);
  if (!intent) {
    return { store: null, linked: false, detail: "invalid_code" };
  }
  if (Date.now() - intent.createdAt.getTime() > CHANNEL_LINK_TTL_MS) {
    await deleteChannelLinkIntent(intent.code);
    return { store: null, linked: false, detail: "expired" };
  }

  const clerkUserId = intent.clerkUserId;
  const clerkStore =
    (await getStoreByChannelIdentity(intent.clerkChannelIdentity)) ??
    (await getStoreByClerkUserId(clerkUserId));
  const waStore = await getStoreByChannelIdentity(input.waE164);

  if (
    clerkStore &&
    isWhatsAppContactPhone(clerkStore.channelIdentity) &&
    clerkStore.channelIdentity === input.waE164 &&
    clerkStore.clerkUserId === clerkUserId
  ) {
    await deleteChannelLinkIntent(intent.code);
    return { store: clerkStore, linked: true, detail: "already_linked" };
  }
  if (waStore?.clerkUserId === clerkUserId) {
    await deleteChannelLinkIntent(intent.code);
    return { store: waStore, linked: true, detail: "already_linked" };
  }

  if (!clerkStore) {
    return { store: null, linked: false, detail: "no_clerk_store" };
  }

  if (waStore && waStore.id !== clerkStore.id) {
    const waCount = await countProductsForStore(waStore.id);
    const clerkCount = await countProductsForStore(clerkStore.id);
    if (waCount > 0 && clerkCount > 0) {
      return { store: null, linked: false, detail: "conflict_both_have_products" };
    }
    if (waStore.clerkUserId && waStore.clerkUserId !== clerkUserId) {
      return { store: waStore, linked: false, detail: "wa_store_has_other_clerk" };
    }
    if (waCount > 0 && clerkCount === 0) {
      const linked = await upsertStore({
        channelIdentity: waStore.channelIdentity,
        clerkUserId,
        ownerEmail: intent.ownerEmail ?? waStore.ownerEmail,
        contactPhone: waStore.contactPhone ?? input.waE164,
        showPhone: true,
      });
      await deleteEmptyStore(clerkStore.id);
      await deleteChannelLinkIntent(intent.code);
      return { store: linked, linked: true, detail: "linked_into_wa" };
    }
    await deleteEmptyStore(waStore.id);
  }

  const taken = await getStoreByChannelIdentity(input.waE164);
  if (taken && taken.id !== clerkStore.id) {
    return { store: null, linked: false, detail: "wa_identity_taken" };
  }

  const updated = await updateStoreIdentities(clerkStore.id, {
    channelIdentity: input.waE164,
    clerkUserId,
    ownerEmail: intent.ownerEmail ?? clerkStore.ownerEmail,
    contactPhone: clerkStore.contactPhone ?? input.waE164,
  });
  await deleteChannelLinkIntent(intent.code);
  return {
    store: updated,
    linked: Boolean(updated),
    detail: updated ? "migrated_clerk_to_wa" : "update_failed",
  };
}

/**
 * @deprecated El vínculo Clerk↔WA ya no se dispara por contact_phone.
 * Preferir `createChannelLinkIntent` + `linkVerifiedWaToClerkAccount`.
 */
export async function linkClerkToWaStore(input: {
  clerkChannelIdentity: string;
  ownerEmail?: string | null;
  waE164: string;
}): Promise<{ store: Store | null; linked: boolean; detail: string }> {
  const clerkUserId = clerkUserIdFromIdentity(input.clerkChannelIdentity);
  if (!clerkUserId || !isClerkIdentity(input.clerkChannelIdentity)) {
    return { store: null, linked: false, detail: "not_clerk" };
  }

  const waStore = await getStoreByChannelIdentity(input.waE164);
  if (!waStore) {
    return { store: null, linked: false, detail: "no_wa_store" };
  }
  if (waStore.clerkUserId && waStore.clerkUserId !== clerkUserId) {
    return { store: waStore, linked: false, detail: "wa_store_has_other_clerk" };
  }

  const linked = await upsertStore({
    channelIdentity: waStore.channelIdentity,
    clerkUserId,
    ownerEmail: input.ownerEmail ?? waStore.ownerEmail,
    contactPhone: input.waE164,
    showPhone: true,
  });

  const stub = await getStoreByChannelIdentity(input.clerkChannelIdentity);
  if (stub && stub.id !== linked.id) {
    await deleteEmptyStore(stub.id);
  }

  return { store: linked, linked: true, detail: "linked" };
}

export async function updateStoreCheckoutMode(
  storeId: string,
  checkoutMode: "whatsapp" | "cart",
): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.stores.get(storeId);
    if (!current) return null;
    const updated = touchStore({ ...current, checkoutMode });
    mem.stores.set(storeId, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(stores)
    .set({ checkoutMode, updatedAt: now() })
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0] ?? null;
}

export async function updateStoreShowPhone(
  storeId: string,
  showPhone: boolean,
): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.stores.get(storeId);
    if (!current) return null;
    const updated = touchStore({ ...current, showPhone });
    mem.stores.set(storeId, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(stores)
    .set({ showPhone, updatedAt: now() })
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0] ?? null;
}

export async function updateStoreContactPhone(
  storeId: string,
  contactPhone: string | null,
): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.stores.get(storeId);
    if (!current) return null;
    const updated = touchStore({ ...current, contactPhone });
    mem.stores.set(storeId, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(stores)
    .set({ contactPhone, updatedAt: now() })
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0] ?? null;
}

export async function updateStoreIcons(
  storeId: string,
  icons: {
    icon192Url: string;
    icon512Url: string;
    iconAppleUrl: string;
    /**
     * SVG fuente. `undefined` = no tocar el valor previo (memoria).
     * `null` o `""` = limpiar (p. ej. subida raster sin SVG).
     */
    iconSvgUrl?: string | null;
  },
): Promise<Store | null> {
  const nextSvg =
    icons.iconSvgUrl === undefined
      ? undefined
      : icons.iconSvgUrl && icons.iconSvgUrl.length > 0
        ? icons.iconSvgUrl
        : null;

  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.stores.get(storeId);
    if (!current) return null;
    const updated = touchStore({
      ...current,
      icon192Url: icons.icon192Url,
      icon512Url: icons.icon512Url,
      iconAppleUrl: icons.iconAppleUrl,
      iconSvgUrl:
        nextSvg === undefined ? current.iconSvgUrl : nextSvg,
    });
    mem.stores.set(storeId, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(stores)
    .set({
      icon192Url: icons.icon192Url,
      icon512Url: icons.icon512Url,
      iconAppleUrl: icons.iconAppleUrl,
      iconSvgUrl: nextSvg === undefined ? null : nextSvg,
      updatedAt: now(),
    })
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0] ?? null;
}

export async function listProductsByStore(
  storeId: string,
  opts?: { includeHidden?: boolean },
): Promise<Product[]> {
  if (!hasDatabaseUrl()) {
    const all = [...getMemoryDb().products.values()]
      .filter((p) => p.storeId === storeId)
      .filter((p) => (opts?.includeHidden ? true : !p.hidden));
    return all.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
  const db = getDb();
  const where = opts?.includeHidden
    ? eq(products.storeId, storeId)
    : and(eq(products.storeId, storeId), eq(products.hidden, false));
  return db
    .select()
    .from(products)
    .where(where)
    .orderBy(asc(products.position), asc(products.createdAt));
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().products.get(id) ?? null;
  }
  const db = getDb();
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProduct(input: {
  storeId: string;
  title: string;
  description?: string | null;
  priceCents?: number | null;
  imageUrl?: string | null;
  imageBlobKey?: string | null;
  quantity?: number | null;
  inStock?: boolean;
}): Promise<Product> {
  const existing = await listProductsByStore(input.storeId, { includeHidden: true });
  const position = existing.length;
  const quantity = input.quantity ?? null;
  const inStock =
    input.inStock ?? (quantity == null ? true : quantity > 0);
  if (!hasDatabaseUrl()) {
    const created: Product = {
      id: newId(),
      storeId: input.storeId,
      title: input.title,
      description: input.description ?? null,
      priceCents: input.priceCents ?? null,
      imageUrl: input.imageUrl ?? null,
      imageBlobKey: input.imageBlobKey ?? null,
      inStock,
      quantity,
      hidden: false,
      position,
      createdAt: now(),
      updatedAt: now(),
    };
    getMemoryDb().products.set(created.id, created);
    return created;
  }
  const db = getDb();
  const rows = await db
    .insert(products)
    .values({
      storeId: input.storeId,
      title: input.title,
      description: input.description ?? null,
      priceCents: input.priceCents ?? null,
      imageUrl: input.imageUrl ?? null,
      imageBlobKey: input.imageBlobKey ?? null,
      inStock,
      quantity,
      position,
    })
    .returning();
  return rows[0]!;
}

/** Aplica patch de stock: si viene quantity, sincroniza inStock. */
export function syncStockFields(
  patch: Partial<Pick<Product, "inStock" | "quantity" | "hidden">>,
): Partial<Pick<Product, "inStock" | "quantity" | "hidden">> {
  const next = { ...patch };
  if (typeof next.quantity === "number") {
    next.inStock = next.quantity > 0;
  }
  return next;
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<
      Product,
      | "title"
      | "description"
      | "priceCents"
      | "imageUrl"
      | "imageBlobKey"
      | "inStock"
      | "quantity"
      | "hidden"
      | "position"
    >
  >,
): Promise<Product | null> {
  const stockAware = syncStockFields(patch);
  const merged = { ...patch, ...stockAware };
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.products.get(id);
    if (!current) return null;
    const updated = { ...current, ...merged, updatedAt: now() };
    mem.products.set(id, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(products)
    .set({ ...merged, updatedAt: now() })
    .where(eq(products.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function getConversation(
  channelIdentity: string,
): Promise<Conversation | null> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().conversations.get(channelIdentity) ?? null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.channelIdentity, channelIdentity))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveConversation(input: {
  channelIdentity: string;
  channel: string;
  state: string;
  draft?: ConversationDraft;
}): Promise<Conversation> {
  if (!input.channelIdentity) {
    throw new Error("saveConversation: channelIdentity requerido");
  }
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const existing = mem.conversations.get(input.channelIdentity);
    const saved: Conversation = {
      channelIdentity: input.channelIdentity,
      channel: input.channel,
      state: input.state,
      draft: (input.draft ?? existing?.draft ?? {}) as Record<string, unknown>,
      lastInboundAt: now(),
    };
    mem.conversations.set(input.channelIdentity, saved);
    return saved;
  }
  const db = getDb();
  const existing = await getConversation(input.channelIdentity);
  if (existing) {
    const rows = await db
      .update(conversations)
      .set({
        channel: input.channel,
        state: input.state,
        draft: (input.draft ?? existing.draft) as Record<string, unknown>,
        lastInboundAt: now(),
      })
      .where(eq(conversations.channelIdentity, input.channelIdentity))
      .returning();
    return rows[0]!;
  }
  const rows = await db
    .insert(conversations)
    .values({
      channelIdentity: input.channelIdentity,
      channel: input.channel,
      state: input.state,
      draft: (input.draft ?? {}) as Record<string, unknown>,
    })
    .returning();
  return rows[0]!;
}

export async function createSignupIntent(phone: string, code: string): Promise<SignupIntent> {
  if (!hasDatabaseUrl()) {
    const intent: SignupIntent = { code, phone, createdAt: now() };
    getMemoryDb().signupIntents.set(code, intent);
    return intent;
  }
  const db = getDb();
  const rows = await db
    .insert(signupIntents)
    .values({ code, phone })
    .onConflictDoUpdate({
      target: signupIntents.code,
      set: { phone, createdAt: now() },
    })
    .returning();
  return rows[0]!;
}

export async function getSignupIntent(code: string): Promise<SignupIntent | null> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().signupIntents.get(code) ?? null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(signupIntents)
    .where(eq(signupIntents.code, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function markProcessed(messageId: string): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    if (mem.processedMessages.has(messageId)) return false;
    mem.processedMessages.add(messageId);
    return true;
  }
  const db = getDb();
  try {
    await db.insert(processedMessages).values({ providerMessageId: messageId });
    return true;
  } catch {
    return false;
  }
}

export async function ensureDemoStore(): Promise<Store> {
  const existing = await getStoreBySlug("ceramicas-de-norma");
  if (existing) {
    // Tweet / demo: siempre modo "Lo quiero" (sin carrito).
    if (existing.checkoutMode !== "whatsapp") {
      const fixed = await updateStoreCheckoutMode(existing.id, "whatsapp");
      return fixed ?? existing;
    }
    return existing;
  }

  const store = await upsertStore({
    channelIdentity: "+5491100000001",
    contactPhone: "+5491100000001",
    ownerName: "Norma",
    name: "Cerámicas de Norma",
    slug: "ceramicas-de-norma",
    showPhone: true,
    checkoutMode: "whatsapp",
    isDemo: false,
    status: "active",
  });

  const current = await listProductsByStore(store.id, { includeHidden: true });
  if (current.length === 0) {
    const demoProducts = [
      {
        title: "Jarrón azul",
        description: "Esmalte azul profundo, hecho a mano.",
        priceCents: 1500000,
        imageUrl: "/demo/jarron-azul.svg",
      },
      {
        title: "Taza de café",
        description: "Ideal para el mate o el café de la mañana.",
        priceCents: 650000,
        imageUrl: "/demo/taza.svg",
      },
      {
        title: "Plato grande",
        description: "Para servir o decorar la mesa.",
        priceCents: 980000,
        imageUrl: "/demo/plato.svg",
      },
    ];
    for (const p of demoProducts) {
      await createProduct({ storeId: store.id, ...p });
    }
  }
  return store;
}

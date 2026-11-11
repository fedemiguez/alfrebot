import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/index";
import { getMemoryDb, newId, now } from "@/lib/db/memory";
import {
  conversations,
  processedMessages,
  products,
  signupIntents,
  stores,
  type Conversation,
  type Product,
  type SignupIntent,
  type Store,
} from "@/lib/db/schema";

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
  signupCode?: string;
  product?: ProductDraft;
  editProductId?: string;
  [key: string]: unknown;
};

function touchStore(store: Store): Store {
  return { ...store, updatedAt: now() };
}

export async function getStoreByPhone(phone: string): Promise<Store | null> {
  if (!hasDatabaseUrl()) {
    for (const s of getMemoryDb().stores.values()) {
      if (s.phone === phone) return s;
    }
    return null;
  }
  const db = getDb();
  const rows = await db.select().from(stores).where(eq(stores.phone, phone)).limit(1);
  return rows[0] ?? null;
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

/** Lista tenants/tiendas (un registro por teléfono) para el panel admin. */
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
  phone: string;
  ownerName?: string | null;
  name?: string | null;
  slug?: string | null;
  showPhone?: boolean;
  isDemo?: boolean;
  status?: string;
}): Promise<Store> {
  const existing = await getStoreByPhone(input.phone);
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    if (existing) {
      const updated = touchStore({
        ...existing,
        ownerName: input.ownerName ?? existing.ownerName,
        name: input.name ?? existing.name,
        slug: input.slug ?? existing.slug,
        showPhone: input.showPhone ?? existing.showPhone,
        isDemo: input.isDemo ?? existing.isDemo,
        status: input.status ?? existing.status,
      });
      mem.stores.set(updated.id, updated);
      return updated;
    }
    const created: Store = {
      id: newId(),
      phone: input.phone,
      ownerName: input.ownerName ?? null,
      name: input.name ?? null,
      slug: input.slug ?? null,
      showPhone: input.showPhone ?? true,
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
        ownerName: input.ownerName ?? existing.ownerName,
        name: input.name ?? existing.name,
        slug: input.slug ?? existing.slug,
        showPhone: input.showPhone ?? existing.showPhone,
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
      phone: input.phone,
      ownerName: input.ownerName ?? null,
      name: input.name ?? null,
      slug: input.slug ?? null,
      showPhone: input.showPhone ?? true,
      isDemo: input.isDemo ?? false,
      status: input.status ?? "onboarding",
    })
    .returning();
  return rows[0]!;
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
}): Promise<Product> {
  const existing = await listProductsByStore(input.storeId, { includeHidden: true });
  const position = existing.length;
  if (!hasDatabaseUrl()) {
    const created: Product = {
      id: newId(),
      storeId: input.storeId,
      title: input.title,
      description: input.description ?? null,
      priceCents: input.priceCents ?? null,
      imageUrl: input.imageUrl ?? null,
      imageBlobKey: input.imageBlobKey ?? null,
      inStock: true,
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
      position,
    })
    .returning();
  return rows[0]!;
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
      | "hidden"
      | "position"
    >
  >,
): Promise<Product | null> {
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const current = mem.products.get(id);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: now() };
    mem.products.set(id, updated);
    return updated;
  }
  const db = getDb();
  const rows = await db
    .update(products)
    .set({ ...patch, updatedAt: now() })
    .where(eq(products.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function getConversation(phone: string): Promise<Conversation | null> {
  if (!hasDatabaseUrl()) {
    return getMemoryDb().conversations.get(phone) ?? null;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.phone, phone))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveConversation(input: {
  phone: string;
  channel: string;
  state: string;
  draft?: ConversationDraft;
}): Promise<Conversation> {
  if (!input.phone) {
    throw new Error("saveConversation: phone requerido");
  }
  if (!hasDatabaseUrl()) {
    const mem = getMemoryDb();
    const existing = mem.conversations.get(input.phone);
    const saved: Conversation = {
      phone: input.phone,
      channel: input.channel,
      state: input.state,
      draft: (input.draft ?? existing?.draft ?? {}) as Record<string, unknown>,
      lastInboundAt: now(),
    };
    mem.conversations.set(input.phone, saved);
    return saved;
  }
  const db = getDb();
  const existing = await getConversation(input.phone);
  if (existing) {
    const rows = await db
      .update(conversations)
      .set({
        channel: input.channel,
        state: input.state,
        draft: (input.draft ?? existing.draft) as Record<string, unknown>,
        lastInboundAt: now(),
      })
      .where(eq(conversations.phone, input.phone))
      .returning();
    return rows[0]!;
  }
  const rows = await db
    .insert(conversations)
    .values({
      phone: input.phone,
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
  if (existing) return existing;

  const store = await upsertStore({
    phone: "+5491100000001",
    ownerName: "Norma",
    name: "Cerámicas de Norma",
    slug: "ceramicas-de-norma",
    showPhone: true,
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

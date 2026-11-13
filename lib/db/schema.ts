import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Cómo compra el visitante en el catálogo público. */
export type CheckoutMode = "whatsapp" | "cart";

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Identidad de canal (única tabla de dueña/tienda).
   * WhatsApp: E.164 `+549…`. Web: `clerk:{userId}`.
   * No es necesariamente el WhatsApp público de pedidos.
   */
  channelIdentity: text("channel_identity").notNull().unique(),
  /**
   * WhatsApp público para catálogo / Lo quiero.
   * Si es null, se usa `channelIdentity` cuando es un móvil AR válido.
   */
  contactPhone: text("contact_phone"),
  /**
   * Alias del camino web. Permite encontrar la misma fila si la dueña
   * empezó por WhatsApp y después entró con email (o al revés).
   */
  clerkUserId: text("clerk_user_id").unique(),
  ownerEmail: text("owner_email"),
  ownerName: text("owner_name"),
  name: text("name"),
  slug: text("slug").unique(),
  showPhone: boolean("show_phone").default(true).notNull(),
  /** `whatsapp` = solo "Lo quiero"; `cart` = carrito + pedido por WhatsApp. */
  checkoutMode: text("checkout_mode").default("whatsapp").notNull().$type<CheckoutMode>(),
  /** Si true, la tienda lleva cantidad numérica por producto; si false, solo pausa (agotado). */
  tracksQuantity: boolean("tracks_quantity").default(false).notNull(),
  /**
   * Iconos PWA (PNG en Blob). Migrar con `npm run db:push` si hay DATABASE_URL.
   * Pipeline: Gemini Flash → SVG → raster 192/512/180 → Blob.
   */
  icon192Url: text("icon_192_url"),
  icon512Url: text("icon_512_url"),
  iconAppleUrl: text("icon_apple_url"),
  iconSvgUrl: text("icon_svg_url"),
  /**
   * Color de acento de la vitrina (hex `#rrggbb`). Null = terracota de marca.
   * Migrar con `npm run db:push` si hay DATABASE_URL.
   */
  accentColor: text("accent_color"),
  /**
   * Rubro del negocio → plantilla de card (`artesanal` | `comida` | `ropa`).
   * Null = layout default. Migrar con `npm run db:push` si hay DATABASE_URL.
   */
  businessKind: text("business_kind"),
  /**
   * Frase corta debajo del nombre (ej. «Envíos a todo el país»).
   * Null = sin frase. Migrar con `npm run db:push` si hay DATABASE_URL.
   */
  welcomeMessage: text("welcome_message"),
  /**
   * Tema de fondo de la vitrina (`claro` | `crema` | `oscuro`).
   * Null = look actual del sitio. Migrar con `npm run db:push` si hay DATABASE_URL.
   */
  theme: text("theme"),
  isDemo: boolean("is_demo").default(false).notNull(),
  status: text("status").default("onboarding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  title: text("title").notNull(),
  description: text("description"),
  priceCents: integer("price_cents"),
  imageUrl: text("image_url"),
  imageBlobKey: text("image_blob_key"),
  inStock: boolean("in_stock").default(true).notNull(),
  /** Cantidad disponible; null si la tienda no lleva stock numérico. */
  quantity: integer("quantity"),
  hidden: boolean("hidden").default(false).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const conversations = pgTable("conversations", {
  /** Misma key que `stores.channel_identity` / `msg.from`. */
  channelIdentity: text("channel_identity").primaryKey(),
  channel: text("channel").notNull(),
  state: text("state").notNull().default("NEW"),
  draft: jsonb("draft").$type<Record<string, unknown>>().default({}).notNull(),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Intentos de alta por WhatsApp (`/registro`). `phone` acá sí es celular. */
export const signupIntents = pgTable("signup_intents", {
  code: text("code").primaryKey(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Códigos de un solo uso para vincular WhatsApp ↔ cuenta web (Clerk).
 * Se generan en `/asistente` y se consumen desde el celular (prueba de posesión).
 */
export const channelLinkIntents = pgTable("channel_link_intents", {
  code: text("code").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  clerkChannelIdentity: text("clerk_channel_identity").notNull(),
  ownerEmail: text("owner_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const processedMessages = pgTable("processed_messages", {
  providerMessageId: text("provider_message_id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const outboundCounter = pgTable("outbound_counter", {
  month: text("month").primaryKey(),
  sent: integer("sent").default(0).notNull(),
});

export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type SignupIntent = typeof signupIntents.$inferSelect;
export type ChannelLinkIntent = typeof channelLinkIntents.$inferSelect;

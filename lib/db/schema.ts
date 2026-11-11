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
  phone: text("phone").notNull().unique(),
  ownerName: text("owner_name"),
  name: text("name"),
  slug: text("slug").unique(),
  showPhone: boolean("show_phone").default(true).notNull(),
  /** `whatsapp` = solo "Lo quiero"; `cart` = carrito + pedido por WhatsApp. */
  checkoutMode: text("checkout_mode").default("whatsapp").notNull().$type<CheckoutMode>(),
  /** Si true, la tienda lleva cantidad numérica por producto; si false, solo pausa (agotado). */
  tracksQuantity: boolean("tracks_quantity").default(false).notNull(),
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
  phone: text("phone").primaryKey(),
  channel: text("channel").notNull(),
  state: text("state").notNull().default("NEW"),
  draft: jsonb("draft").$type<Record<string, unknown>>().default({}).notNull(),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const signupIntents = pgTable("signup_intents", {
  code: text("code").primaryKey(),
  phone: text("phone").notNull(),
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

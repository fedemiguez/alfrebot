import { randomUUID } from "crypto";
import type {
  Conversation,
  Product,
  SignupIntent,
  Store,
} from "@/lib/db/schema";

type MemoryDb = {
  stores: Map<string, Store>;
  products: Map<string, Product>;
  conversations: Map<string, Conversation>;
  signupIntents: Map<string, SignupIntent>;
  processedMessages: Set<string>;
  outboundCounter: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __alfrebotMemoryDb: MemoryDb | undefined;
}

function createDb(): MemoryDb {
  return {
    stores: new Map(),
    products: new Map(),
    conversations: new Map(),
    signupIntents: new Map(),
    processedMessages: new Set(),
    outboundCounter: new Map(),
  };
}

export function getMemoryDb(): MemoryDb {
  if (!globalThis.__alfrebotMemoryDb) {
    globalThis.__alfrebotMemoryDb = createDb();
  }
  return globalThis.__alfrebotMemoryDb;
}

export function newId(): string {
  return randomUUID();
}

export function now(): Date {
  return new Date();
}

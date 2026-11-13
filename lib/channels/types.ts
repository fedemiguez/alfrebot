export type ChannelKind = "meta" | "simulator";

export type InboundMedia = {
  kind: "image" | "audio";
  mime: string;
  url?: string;
  fetch: () => Promise<Blob>;
};

export type InboundMessage = {
  channel: ChannelKind;
  from: string;
  messageId: string;
  text?: string;
  media?: InboundMedia;
  choiceId?: string;
  /** Solo camino web (Clerk): email verificado del dueño. */
  ownerEmail?: string;
  /** Foto de perfil Clerk (p. ej. Google); se usa como icono de tienda. */
  ownerImageUrl?: string;
};

export type Option = { id: string; label: string };

export type OutboundMessage =
  | { kind: "text"; text: string; options?: Option[] }
  | { kind: "image"; url: string; caption?: string; options?: Option[] }
  /** Solo chat web (simulator): el cliente debe llamar Clerk signOut. */
  | { kind: "sign_out"; text: string };

export type ChannelCapabilities = {
  buttons: boolean;
  maxButtons: number;
  maxListRows: number;
};

export interface ChannelAdapter {
  capabilities: ChannelCapabilities;
  verify(req: Request, rawBody: string): Promise<boolean>;
  parse(rawBody: string): InboundMessage[];
  send(to: string, msgs: OutboundMessage[]): Promise<void>;
}

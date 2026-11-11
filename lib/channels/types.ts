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
};

export type Option = { id: string; label: string };

export type OutboundMessage =
  | { kind: "text"; text: string; options?: Option[] }
  | { kind: "image"; url: string; caption?: string; options?: Option[] };

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

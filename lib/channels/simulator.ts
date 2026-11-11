import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
} from "@/lib/channels/types";

export type SimulatorPayload = {
  from: string;
  messageId?: string;
  text?: string;
  choiceId?: string;
  media?: {
    kind: "image" | "audio";
    mime: string;
    url?: string;
    dataUrl?: string;
  };
};

export function createSimulatorAdapter(
  onSend?: (to: string, msgs: OutboundMessage[]) => void,
): ChannelAdapter {
  return {
    capabilities: {
      buttons: true,
      maxButtons: 3,
      maxListRows: 10,
    },
    async verify() {
      return true;
    },
    parse(rawBody: string): InboundMessage[] {
      const body = JSON.parse(rawBody) as SimulatorPayload;
      const media = body.media
        ? {
            kind: body.media.kind,
            mime: body.media.mime,
            url: body.media.url,
            fetch: async () => {
              if (body.media?.dataUrl) {
                const res = await fetch(body.media.dataUrl);
                return res.blob();
              }
              if (body.media?.url) {
                const res = await fetch(body.media.url);
                return res.blob();
              }
              return new Blob([], { type: body.media?.mime ?? "application/octet-stream" });
            },
          }
        : undefined;

      return [
        {
          channel: "simulator",
          from: body.from,
          messageId: body.messageId ?? `sim_${Date.now()}`,
          text: body.text,
          choiceId: body.choiceId,
          media,
        },
      ];
    },
    async send(to, msgs) {
      onSend?.(to, msgs);
    },
  };
}

export const simulatorAdapter = createSimulatorAdapter();

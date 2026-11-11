"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { OutboundMessage } from "@/lib/channels/types";

type ChatItem =
  | { id: string; role: "user"; text?: string; imageUrl?: string }
  | { id: string; role: "bot"; messages: OutboundMessage[] };

function defaultSimPhone(): string {
  if (typeof window === "undefined") return "+01155550001";
  const key = "alfrebot_sim_phone";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const phone = `+0${Math.floor(1000000000 + Math.random() * 8999999999)}`;
  window.localStorage.setItem(key, phone);
  return phone;
}

export function SimulatorChat({ initialPhone }: { initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone || "");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!phone) setPhone(initialPhone || defaultSimPhone());
  }, [initialPhone, phone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const storePreviewUrl = useMemo(
    () => (storeSlug ? `/${storeSlug}` : null),
    [storeSlug],
  );

  function extractSlug(replies: OutboundMessage[]) {
    for (const r of replies) {
      if (r.kind !== "text") continue;
      const m = r.text.match(/\/([a-z0-9-]+)(?:\s|\.|$)/i);
      // Prefer full URL matches
      const urlMatch = r.text.match(/https?:\/\/[^\s]+\/([a-z0-9-]+)/i);
      if (urlMatch?.[1] && urlMatch[1] !== "probar" && urlMatch[1] !== "registro") {
        setStoreSlug(urlMatch[1]);
        return;
      }
      if (m?.[1] && !["probar", "registro", "api"].includes(m[1])) {
        // weaker heuristic — ignore
      }
    }
    const any = replies
      .filter((r): r is Extract<OutboundMessage, { kind: "text" }> => r.kind === "text")
      .map((r) => r.text.match(/(?:alfrebot\.com\.ar|localhost:\d+|vercel\.app)\/([a-z0-9-]+)/i)?.[1])
      .find(Boolean);
    if (any) setStoreSlug(any);
  }

  function sendPayload(payload: Record<string, unknown>, userBubble: ChatItem) {
    startTransition(async () => {
      setItems((prev) => [...prev, userBubble]);
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: phone,
          messageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...payload,
        }),
      });
      const data = (await res.json()) as { replies?: OutboundMessage[] };
      const replies = data.replies ?? [];
      extractSlug(replies);
      setItems((prev) => [
        ...prev,
        { id: `bot_${Date.now()}`, role: "bot", messages: replies },
      ]);
    });
  }

  function onSendText(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !phone) return;
    setInput("");
    sendPayload(
      { text },
      { id: `u_${Date.now()}`, role: "user", text },
    );
  }

  function onChoice(choiceId: string, label: string) {
    sendPayload(
      { choiceId, text: label },
      { id: `u_${Date.now()}`, role: "user", text: label },
    );
  }

  async function onPickImage(file: File) {
    const dataUrl = await readAsDataUrl(file);
    // Upload first for a stable URL the store can render
    let url = dataUrl;
    try {
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      const json = (await up.json()) as { url?: string };
      if (json.url) url = json.url;
    } catch {
      // keep dataUrl
    }
    sendPayload(
      {
        text: input.trim() || undefined,
        media: { kind: "image", mime: file.type || "image/jpeg", url, dataUrl },
      },
      { id: `u_${Date.now()}`, role: "user", text: input.trim() || "📷 Foto", imageUrl: url },
    );
    setInput("");
  }

  function startConversation() {
    sendPayload(
      { text: "Hola! Quiero armar mi tienda. Código 4821" },
      { id: `u_${Date.now()}`, role: "user", text: "Hola! Quiero armar mi tienda." },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[#ECE5DD] shadow-sm">
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-[family-name:var(--font-display)] font-semibold">
            A
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
              alfrebot
            </p>
            <p className="text-sm text-white/80">Simulador · {phone || "…"}</p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {items.length === 0 && (
            <div className="mx-auto max-w-sm rounded-lg bg-white/90 p-4 text-center text-[16px] text-[var(--ink)]">
              <p>Este chat usa el mismo motor que WhatsApp.</p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={startConversation}
                disabled={pending || !phone}
              >
                Empezar
              </button>
            </div>
          )}
          {items.map((item) =>
            item.role === "user" ? (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-[17px] text-[var(--ink)] shadow-sm">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="mb-2 max-h-48 w-full rounded object-cover"
                    />
                  )}
                  {item.text}
                </div>
              </div>
            ) : (
              <div key={item.id} className="space-y-2">
                {item.messages.map((m, idx) => (
                  <div key={`${item.id}_${idx}`} className="flex justify-start">
                    <div className="max-w-[90%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-[17px] text-[var(--ink)] shadow-sm">
                      {m.kind === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.url}
                          alt={m.caption || ""}
                          className="mb-2 max-h-56 w-full rounded object-cover"
                        />
                      )}
                      <p className="whitespace-pre-wrap">
                        {m.kind === "text" ? m.text : m.caption}
                      </p>
                      {m.options && m.options.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                          {m.options.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              disabled={pending}
                              onClick={() => onChoice(o.id, o.label)}
                              className="min-h-12 rounded border border-[#25D366]/40 bg-[#F0FFF4] px-3 py-2 text-left font-semibold text-[#075E54]"
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSendText}
          className="flex items-end gap-2 border-t border-black/5 bg-[#F0F0F0] p-3"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickImage(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="min-h-12 rounded bg-white px-3 text-[1.2rem]"
            onClick={() => fileRef.current?.click()}
            aria-label="Adjuntar foto"
            disabled={pending}
          >
            📎
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí un mensaje"
            className="min-h-12 flex-1 rounded-full border border-[var(--border)] bg-white px-4 text-[17px] outline-none"
            disabled={pending}
          />
          <button type="submit" className="btn btn-primary rounded-full px-4" disabled={pending}>
            Enviar
          </button>
        </form>
      </section>

      <aside className="hidden min-h-[70vh] flex-col rounded-lg border border-[var(--border)] bg-white/80 p-5 lg:flex">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Tu tienda en vivo
        </h2>
        <p className="mt-2 text-[16px] text-[var(--muted)]">
          Cuando publiques una pieza, el link aparece acá.
        </p>
        {storePreviewUrl ? (
          <div className="mt-6 flex flex-1 flex-col">
            <Link
              href={storePreviewUrl}
              className="btn btn-secondary self-start"
              target="_blank"
            >
              Abrir {storePreviewUrl}
            </Link>
            <div className="mt-4 flex-1 overflow-hidden rounded border border-[var(--border)]">
              <iframe
                title="Vista previa de la tienda"
                src={storePreviewUrl}
                className="h-full min-h-[420px] w-full bg-[var(--bg)]"
              />
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-1 items-center justify-center rounded border border-dashed border-[var(--border)] bg-[var(--paper)] p-6 text-center text-[var(--muted)]">
            Todavía no hay tienda. Empezá el chat y seguí los pasos.
          </div>
        )}
        <div className="mt-4 flex items-center gap-3 text-[14px] text-[var(--muted)]">
          <Image src="/demo/sello.svg" alt="" width={40} height={40} />
          Simulador de prueba · no usa Meta
        </div>
      </aside>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AlfrebotRobotAvatar } from "@/components/alfrebot-robot-avatar";
import { ChatAuthOverlay } from "@/components/chat-auth-overlay";
import { OwnerChatAvatar } from "@/components/owner-chat-avatar";
import { WebChatAuthBridge } from "@/components/web-chat-auth-bridge";
import { WebChatSignOut } from "@/components/web-chat-sign-out";
import { WebChatSsoFinish } from "@/components/web-chat-sso-finish";
import type { OutboundMessage } from "@/lib/channels/types";
import { CHOICE, segmentUrls } from "@/lib/bot/render";

function outboundDisplayText(m: OutboundMessage): string | undefined {
  if (m.kind === "text" || m.kind === "sign_out") return m.text;
  return m.caption;
}

type ChatItem =
  | { id: string; role: "user"; text?: string; imageUrl?: string }
  | { id: string; role: "bot"; messages: OutboundMessage[] };

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;
const V2_INTRO_ID = "v2_intro";
const V2_OWNER_INTRO_ID = "v2_owner_intro";
const V2_CHANNEL_WEB = "v2_channel_web";
const V2_CHANNEL_WA = "v2_channel_wa";
/** Tras login Clerk, reanudar onboarding web sin repetir la elección de canal. */
const PENDING_WEB_ONBOARDING_KEY = "alfrebot_pending_web_onboarding";

function proactiveHello(firstName?: string | null): string {
  const name = firstName?.trim();
  return name
    ? `Hola ${name}, ¿en qué necesitás que te ayude?`
    : "Hola, ¿en qué necesitás que te ayude?";
}

/** Saludo fresco + elección de canal (guest / sin tienda). */
function buildV2ChannelIntro(firstName?: string | null): ChatItem {
  return {
    id: V2_INTRO_ID,
    role: "bot",
    messages: [
      {
        kind: "text",
        text: proactiveHello(firstName),
        options: [
          { id: V2_CHANNEL_WEB, label: "Seguir en este chat" },
          { id: V2_CHANNEL_WA, label: "Ir a WhatsApp" },
        ],
      },
    ],
  };
}

/** Saludo fresco + menú principal (dueño con tienda activa). Sin hidratar historial. */
function buildV2OwnerIntro(firstName?: string | null): ChatItem {
  return {
    id: V2_OWNER_INTRO_ID,
    role: "bot",
    messages: [
      {
        kind: "text",
        text: proactiveHello(firstName),
        options: [
          { id: CHOICE.MENU_GROUP_PRODUCTS, label: "Productos" },
          { id: CHOICE.MENU_GROUP_STORE, label: "Tienda" },
          { id: CHOICE.MENU_GROUP_WA, label: "WhatsApp" },
          { id: CHOICE.MENU_HELP, label: "Ayuda" },
        ],
      },
    ],
  };
}

/**
 * Shell tipo WhatsApp: altura = visualViewport (iOS/Android con teclado).
 * Evita que el layout “salte” o deje el composer a mitad de pantalla.
 */
function useChatShellViewport(enabled: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const sync = () => {
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      const top = Math.round(vv?.offsetTop ?? 0);
      setBox((prev) =>
        prev && prev.height === height && prev.top === top
          ? prev
          : { height, top },
      );
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [enabled]);

  if (!enabled) return undefined;
  if (!box) {
    return {
      position: "fixed",
      inset: 0,
      height: "100dvh",
      width: "100%",
      maxWidth: "100%",
    };
  }
  return {
    position: "fixed",
    top: box.top,
    left: 0,
    right: 0,
    height: box.height,
    width: "100%",
    maxWidth: "100%",
  };
}

function defaultSimPhone(): string {
  if (typeof window === "undefined") return "+01155550001";
  const key = "alfrebot_sim_phone";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const phone = `+0${Math.floor(1000000000 + Math.random() * 8999999999)}`;
  window.localStorage.setItem(key, phone);
  return phone;
}

export function SimulatorChat({
  initialPhone,
  initialCode,
  continueWaLink,
  ownerEmail,
  ownerFirstName,
  ownerImageUrl,
  identityMode = "phone",
  isAuthenticated = false,
  hasActiveStore = false,
  initialStoreSlug,
  variant = "classic",
}: {
  initialPhone?: string;
  initialCode?: string;
  continueWaLink?: string;
  ownerEmail?: string;
  /** Nombre de Clerk (firstName). Solo si existe; no inventar. */
  ownerFirstName?: string | null;
  /** Foto Clerk del dueño; sin valor → silueta genérica en v2. */
  ownerImageUrl?: string | null;
  identityMode?: "phone" | "clerk";
  /** Sesión Clerk activa (server). Guest ve channel choice; API exige auth. */
  isAuthenticated?: boolean;
  /** Dueño con tienda activa: saludo + menú, sin channel pick. */
  hasActiveStore?: boolean;
  initialStoreSlug?: string | null;
  /** classic = shell v1 con aside; v2 = chat WhatsApp-like a pantalla completa. */
  variant?: "classic" | "v2";
}) {
  const isV2 = variant === "v2";
  const needsClerkGate = identityMode === "clerk";
  const router = useRouter();
  const showOwnerHub = isV2 && isAuthenticated && hasActiveStore;
  const [phone, setPhone] = useState(initialPhone || "");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>(() => {
    if (variant !== "v2") return [];
    // Nueva visita: UI fresca (no hidratar historial de sesión anterior).
    if (isAuthenticated && hasActiveStore) {
      return [buildV2OwnerIntro(ownerFirstName)];
    }
    return [buildV2ChannelIntro(ownerFirstName)];
  });
  const [storeSlug, setStoreSlug] = useState<string | null>(
    initialStoreSlug ?? null,
  );
  const [pending, startTransition] = useTransition();
  /** Busy real del fetch (useTransition no cubre bien async largos). */
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickSourceOpen, setPickSourceOpen] = useState(false);
  const [iconPickOpen, setIconPickOpen] = useState(false);
  const [channelPicked, setChannelPicked] = useState(showOwnerHub);
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutRequestId, setSignOutRequestId] = useState(0);
  const [clerkLive, setClerkLive] = useState<{
    isLoaded: boolean;
    isSignedIn: boolean;
    userId: string | null;
    imageUrl: string | null;
    firstName: string | null;
  } | null>(null);
  const [ssoFinishing, setSsoFinishing] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resumedWebRef = useRef(false);
  const refreshedAfterLoginRef = useRef(false);
  const shellStyle = useChatShellViewport(isV2);
  const busy = sending || pending || uploading || recording || sendingAudio;
  const signupCode = initialCode?.replace(/\D/g, "").slice(0, 4) || "";
  /** Sesión viva (Clerk) o prop RSC — evita esperar F5 para Tienda / enviar. */
  const sessionAuthed =
    identityMode === "clerk"
      ? Boolean(clerkLive?.isSignedIn ?? isAuthenticated)
      : true;
  const displayIdentity =
    identityMode === "clerk"
      ? ownerEmail || (sessionAuthed ? "cuenta web" : "invitado")
      : phone || "…";
  const canUseBot = !needsClerkGate || (sessionAuthed && !ssoFinishing);
  const liveOwnerImageUrl = clerkLive?.imageUrl || ownerImageUrl;
  const liveOwnerFirstName = clerkLive?.firstName || ownerFirstName;

  const onClerkSession = useCallback(
    (state: {
      isLoaded: boolean;
      isSignedIn: boolean;
      userId: string | null;
      imageUrl: string | null;
      firstName: string | null;
    }) => {
      setClerkLive(state);
    },
    [],
  );

  const onSsoPendingChange = useCallback((pending: boolean) => {
    setSsoFinishing(pending);
  }, []);

  useEffect(() => {
    setPhone((prev) => {
      if (initialPhone) return initialPhone;
      if (prev) return prev;
      if (identityMode === "clerk") return "";
      return defaultSimPhone();
    });
  }, [initialPhone, identityMode]);

  useEffect(() => {
    if (initialStoreSlug) setStoreSlug(initialStoreSlug);
  }, [initialStoreSlug]);

  // Tras login / SSO: cerrar modal y refrescar RSC sin F5.
  useEffect(() => {
    if (identityMode !== "clerk") return;
    if (!clerkLive?.isLoaded || !clerkLive.isSignedIn || ssoFinishing) return;
    if (authOpen) setAuthOpen(false);
    if (!isAuthenticated && !refreshedAfterLoginRef.current) {
      refreshedAfterLoginRef.current = true;
      router.refresh();
    }
  }, [identityMode, clerkLive, authOpen, isAuthenticated, router, ssoFinishing]);

  // Tienda en header: si hay sesión pero aún no hay slug (props RSC viejas), pedirlo.
  useEffect(() => {
    if (identityMode !== "clerk" || !sessionAuthed || ssoFinishing || storeSlug)
      return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/store", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { slug?: string | null };
        if (!cancelled && data.slug?.trim()) {
          setStoreSlug(data.slug.trim());
        }
      } catch {
        // ignore — el botón aparece cuando haya slug
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityMode, sessionAuthed, ssoFinishing, storeSlug]);

  // Dueño con tienda: pasar del intro de canal al hub sin esperar un mensaje.
  useEffect(() => {
    if (!isV2 || identityMode !== "clerk") return;
    if (!sessionAuthed || ssoFinishing || !storeSlug) return;
    setChannelPicked(true);
    setItems((prev) => {
      if (prev.length === 1 && prev[0]?.id === V2_INTRO_ID) {
        return [buildV2OwnerIntro(liveOwnerFirstName)];
      }
      return prev;
    });
  }, [
    isV2,
    identityMode,
    sessionAuthed,
    ssoFinishing,
    storeSlug,
    liveOwnerFirstName,
  ]);

  // Scroll solo dentro del panel de mensajes (no scrollIntoView del documento:
  // con teclado móvil empuja el shell fuera de vista).
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, error, sending, pending, uploading, recording, sendingAudio]);

  const storePreviewUrl = useMemo(
    () => (storeSlug ? `/${storeSlug}` : null),
    [storeSlug],
  );

  function resolvePhone(): string {
    if (phone) return phone;
    if (identityMode === "clerk") {
      if (initialPhone) {
        setPhone(initialPhone);
        return initialPhone;
      }
      return "";
    }
    const next = initialPhone || defaultSimPhone();
    setPhone(next);
    return next;
  }

  function markPendingWebOnboarding() {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      PENDING_WEB_ONBOARDING_KEY,
      signupCode || "1",
    );
  }

  function clearPendingWebOnboarding() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(PENDING_WEB_ONBOARDING_KEY);
  }

  function beginWebOnboarding(userLabel = "Seguir en este chat") {
    const codePart = signupCode ? ` Código ${signupCode}` : "";
    sendPayload(
      { text: `Hola! Quiero armar mi tienda.${codePart}` },
      { id: `u_${Date.now()}`, role: "user", text: userLabel },
    );
  }

  function openAuthForWeb() {
    markPendingWebOnboarding();
    setAuthOpen(true);
  }

  function extractSlug(replies: OutboundMessage[]) {
    for (const r of replies) {
      if (r.kind !== "text") continue;
      const urlMatch = r.text.match(/https?:\/\/[^\s]+\/([a-z0-9-]+)/i);
      if (
        urlMatch?.[1] &&
        urlMatch[1] !== "asistente" &&
        urlMatch[1] !== "asistente-v1" &&
        urlMatch[1] !== "probar" &&
        urlMatch[1] !== "registro"
      ) {
        setStoreSlug(urlMatch[1]);
        return;
      }
    }
    const any = replies
      .filter((r): r is Extract<OutboundMessage, { kind: "text" }> => r.kind === "text")
      .map((r) => r.text.match(/(?:alfrebot\.com\.ar|localhost:\d+|vercel\.app)\/([a-z0-9-]+)/i)?.[1])
      .find(Boolean);
    if (any) setStoreSlug(any);
  }

  function sendPayload(payload: Record<string, unknown>, userBubble: ChatItem) {
    if (needsClerkGate && ssoFinishing) {
      setError("Estamos terminando el inicio de sesión. Probá en un segundo.");
      return;
    }
    if (needsClerkGate && !sessionAuthed) {
      openAuthForWeb();
      return;
    }
    const from = resolvePhone();
    setError(null);
    setSending(true);
    startTransition(async () => {
      setItems((prev) => [...prev, userBubble]);
      const controller = new AbortController();
      // Icono/Gemini: server corta ~18s; cliente no espera el timeout de función (60s).
      const timer = window.setTimeout(() => controller.abort(), 35_000);
      try {
        const res = await fetch("/api/simulator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            from,
            messageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ...payload,
          }),
          signal: controller.signal,
        });
        const raw = await res.text();
        let data: { replies?: OutboundMessage[]; error?: string } = {};
        try {
          data = raw ? (JSON.parse(raw) as typeof data) : {};
        } catch {
          if (!res.ok) {
            throw new Error(
              res.status === 504 || res.status === 408
                ? "Tardó demasiado. Probá de nuevo en un rato."
                : "El asistente no respondió bien. Probá de nuevo.",
            );
          }
          throw new Error("Respuesta inválida del asistente. Probá de nuevo.");
        }
        if (!res.ok) {
          throw new Error(data.error || "El asistente no respondió");
        }
        const replies = data.replies ?? [];
        extractSlug(replies);
        const wantsSignOut = replies.some((r) => r.kind === "sign_out");
        setItems((prev) => [
          ...prev,
          {
            id: `bot_${Date.now()}`,
            role: "bot",
            messages: replies.length
              ? replies
              : [{ kind: "text", text: "No recibí respuesta. Probá de nuevo." }],
          },
        ]);
        if (wantsSignOut && identityMode === "clerk") {
          clearPendingWebOnboarding();
          setSignOutRequestId((n) => n + 1);
        }
      } catch (err) {
        const aborted =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError");
        const message = aborted
          ? "Tardó demasiado (icono/IA). Probá de nuevo en un rato."
          : err instanceof Error
            ? err.message
            : "No se pudo enviar el mensaje";
        setError(message);
        setItems((prev) => [
          ...prev,
          {
            id: `bot_err_${Date.now()}`,
            role: "bot",
            messages: [
              {
                kind: "text",
                text: `Uy, algo falló: ${message}`,
              },
            ],
          },
        ]);
      } finally {
        window.clearTimeout(timer);
        setSending(false);
      }
    });
  }

  function onSendText(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    sendPayload({ text }, { id: `u_${Date.now()}`, role: "user", text });
  }

  function onChoice(choiceId: string, label: string) {
    if (busy) return;
    if (choiceId === V2_CHANNEL_WA) {
      setChannelPicked(true);
      setAuthOpen(false);
      clearPendingWebOnboarding();
      setItems((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: "user", text: label },
        {
          id: `bot_wa_${Date.now()}`,
          role: "bot",
          messages: [
            {
              kind: "text",
              text: continueWaLink
                ? "Dale. Te abro WhatsApp para seguir ahí con el mismo ayudante."
                : "Para ir a WhatsApp necesitás el link del bot. Probá más tarde o seguí en este chat.",
            },
          ],
        },
      ]);
      if (continueWaLink) {
        window.open(continueWaLink, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (choiceId === V2_CHANNEL_WEB) {
      setChannelPicked(true);
      if (needsClerkGate && !sessionAuthed) {
        setItems((prev) => [
          ...prev,
          { id: `u_${Date.now()}`, role: "user", text: label },
          {
            id: `bot_auth_${Date.now()}`,
            role: "bot",
            messages: [
              {
                kind: "text",
                text: "Perfecto. Para seguir en este chat, creá tu cuenta o entrá — no te saco del chat.",
              },
            ],
          },
        ]);
        openAuthForWeb();
        return;
      }
      beginWebOnboarding(label);
      return;
    }
    sendPayload(
      { choiceId, text: label },
      { id: `u_${Date.now()}`, role: "user", text: label },
    );
  }

  // Tras redirect de Clerk: reanudar onboarding web (el reload pierde el historial del chat).
  // Si ya hay tienda activa, no reanudamos: la UI monta saludo fresco + menú.
  useEffect(() => {
    if (!isV2 || !isAuthenticated || resumedWebRef.current) return;
    if (typeof window === "undefined") return;
    if (hasActiveStore) {
      clearPendingWebOnboarding();
      return;
    }
    const pending = window.sessionStorage.getItem(PENDING_WEB_ONBOARDING_KEY);
    if (!pending) return;
    resumedWebRef.current = true;
    clearPendingWebOnboarding();
    setChannelPicked(true);
    setAuthOpen(false);
    const storedCode =
      pending !== "1" && /^\d{4}$/.test(pending) ? pending : signupCode;
    const codePart = storedCode ? ` Código ${storedCode}` : "";
    sendPayload(
      { text: `Hola! Quiero armar mi tienda.${codePart}` },
      {
        id: `u_onboard_${Date.now()}`,
        role: "user",
        text: "Seguir en este chat",
      },
    );
    // Intencional: solo al montar con sesión + pending flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isV2, signupCode, hasActiveStore]);

  function dismissAuthOverlay() {
    setAuthOpen(false);
    if (sessionAuthed) return;
    clearPendingWebOnboarding();
    if (isV2) {
      setChannelPicked(false);
      setItems([buildV2ChannelIntro(ownerFirstName)]);
    }
  }

  function stopMicTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function onToggleRecord() {
    if (uploading || pending || sendingAudio) return;

    if (recording && mediaRecorderRef.current) {
      // Cortar UI ya: algunos browsers tardan en disparar onstop.
      setRecording(false);
      try {
        mediaRecorderRef.current.stop();
      } catch {
        stopMicTracks();
        mediaRecorderRef.current = null;
        setError("No pude cortar la grabación. Probá de nuevo.");
      }
      return;
    }

    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar audio. Probá en WhatsApp real o en Chrome/Safari.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("No hay acceso al micrófono en este navegador.");
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        setRecording(false);
        stopMicTracks();
        mediaRecorderRef.current = null;
        setError("Falló la grabación. Probá de nuevo o escribilo.");
      };
      recorder.onstop = () => {
        setRecording(false);
        stopMicTracks();
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (blob.size < 64) {
          setError("El audio quedó vacío. Tocá el micrófono, hablá y tocá de nuevo para enviar.");
          return;
        }
        void sendAudioBlob(blob, type);
      };
      mediaRecorderRef.current = recorder;
      // timeslice: chunks periódicos (evita onstop vacío / colgado en mobile)
      recorder.start(250);
      setRecording(true);
    } catch {
      stopMicTracks();
      setRecording(false);
      setError("No pude usar el micrófono. Revisá el permiso del navegador.");
    }
  }

  async function sendAudioBlob(blob: Blob, mime: string) {
    setSendingAudio(true);
    setError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const type = mime.split(";")[0] || "audio/webm";
      const ext = type.includes("ogg")
        ? "ogg"
        : type.includes("mp4")
          ? "m4a"
          : "webm";
      const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
      const form = new FormData();
      form.append("file", file);

      // Cookies de sesión Clerk (same-origin); /api/upload exige auth.
      const up = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        signal: controller.signal,
      });
      const json = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !json.url) {
        throw new Error(json.error || "No se pudo subir el audio");
      }

      sendPayload(
        {
          media: {
            kind: "audio",
            mime: type,
            url: json.url,
          },
        },
        {
          id: `u_${Date.now()}`,
          role: "user",
          text: "🎙️ Audio",
        },
      );
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      const message = aborted
        ? "La subida del audio tardó demasiado. Probá de nuevo."
        : err instanceof Error
          ? err.message
          : "No se pudo enviar el audio";
      setError(message);
    } finally {
      window.clearTimeout(timer);
      setSendingAudio(false);
    }
  }

  async function onPickStoreIcon(file: File) {
    if (!file || busy) return;
    setUploading(true);
    setError(null);
    setIconPickOpen(false);
    const localPreview = URL.createObjectURL(file);
    try {
      const prepared = await prepareImageFile(file);
      const form = new FormData();
      form.append("file", prepared);
      const up = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const json = (await up.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!up.ok || !json.url) {
        throw new Error(json.error || "No se pudo subir el icono");
      }
      sendPayload(
        {
          choiceId: "icon_upload",
          text: "Subir mi icono",
          media: {
            kind: "image",
            mime: prepared.type || "image/jpeg",
            url: json.url,
          },
        },
        {
          id: `u_${Date.now()}`,
          role: "user",
          text: "Subir icono de la tienda",
          imageUrl: json.url,
        },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo subir el icono";
      setError(message);
      setItems((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          role: "bot",
          messages: [
            {
              kind: "text",
              text: `No pude recibir el icono: ${message}. Probá con otra imagen más chica.`,
            },
          ],
        },
      ]);
    } finally {
      URL.revokeObjectURL(localPreview);
      setUploading(false);
    }
  }

  async function onPickImage(file: File) {
    if (busy) return;
    setError(null);
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    try {
      const prepared = await prepareImageFile(file);
      const form = new FormData();
      form.append("file", prepared);

      // Cookies de sesión Clerk (same-origin); /api/upload exige auth.
      const up = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const json = (await up.json()) as { url?: string; error?: string; ok?: boolean };
      if (!up.ok || !json.url) {
        throw new Error(json.error || "No se pudo subir la foto");
      }

      const caption = input.trim();
      sendPayload(
        {
          text: caption || undefined,
          media: {
            kind: "image",
            mime: prepared.type || "image/jpeg",
            url: json.url,
          },
        },
        {
          id: `u_${Date.now()}`,
          role: "user",
          text: caption || "📷 Foto",
          imageUrl: json.url,
        },
      );
      setInput("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo adjuntar la foto";
      setError(message);
      setItems((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          role: "bot",
          messages: [
            {
              kind: "text",
              text: `No pude recibir la foto: ${message}. Probá con otra imagen más chica.`,
            },
          ],
        },
      ]);
    } finally {
      URL.revokeObjectURL(localPreview);
      setUploading(false);
    }
  }

  function startConversation() {
    if (busy) return;
    if (needsClerkGate && !sessionAuthed) {
      openAuthForWeb();
      return;
    }
    const codePart = signupCode ? ` Código ${signupCode}` : "";
    sendPayload(
      { text: `Hola! Quiero armar mi tienda.${codePart}` },
      { id: `u_${Date.now()}`, role: "user", text: "Hola! Quiero armar mi tienda." },
    );
  }

  const chatPanel = (
      <section
        className={
          isV2
            ? "relative flex min-h-0 w-full flex-col overflow-hidden bg-[#ECE5DD]"
            : "relative flex h-[min(70vh,calc(100dvh-10rem))] min-h-[28rem] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[#ECE5DD] shadow-sm"
        }
        style={shellStyle}
      >
        <div className="flex shrink-0 items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          {isV2 ? (
            <AlfrebotRobotAvatar size={40} className="ring-2 ring-white/30" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-[family-name:var(--font-display)] font-semibold">
              A
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">
              alfrebot
            </p>
            <p className="truncate text-[15px] text-white/90">
              {isV2 ? "en línea · chat web" : `Chat web · ${displayIdentity}`}
            </p>
          </div>
          {isV2 && (storePreviewUrl || (identityMode === "clerk" && sessionAuthed)) && (
            <div className="flex shrink-0 items-center gap-1.5">
              {storePreviewUrl && (
                <Link
                  href={storePreviewUrl}
                  target="_blank"
                  className="shrink-0 rounded-full bg-white/15 px-3 py-2 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Ver tienda
                </Link>
              )}
              {identityMode === "clerk" && sessionAuthed && (
                <button
                  type="button"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                  disabled={busy}
                  onClick={() => {
                    sendPayload(
                      { text: "salir" },
                      {
                        id: `u_${Date.now()}`,
                        role: "user",
                        text: "Cerrar sesión",
                      },
                    );
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-200 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {!isV2 && continueWaLink && (
          <div className="shrink-0 border-b border-black/5 bg-[#FFF8E7] px-4 py-3 text-[17px] leading-relaxed text-[var(--ink)]">
            {identityMode === "clerk" ? (
              <>
                Los pedidos de clientes van por WhatsApp. Cuando el bot te pida
                el número de pedidos, cargalo ahí. También podés{" "}
                <a
                  href={continueWaLink}
                  className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  abrir el bot por WhatsApp
                </a>{" "}
                más adelante.
              </>
            ) : (
              <>
                Cuando quieras seguir desde el celu,{" "}
                <a
                  href={continueWaLink}
                  className="inline-flex min-h-11 items-center font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  abrí WhatsApp con este mismo número
                </a>
                .
              </>
            )}
          </div>
        )}

        <div
          ref={messagesRef}
          className={
            isV2
              ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#E5DDD5] px-3 py-4 [-webkit-overflow-scrolling:touch]"
              : "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4"
          }
        >
          {!isV2 && items.length === 0 && (
            <div className="mx-auto max-w-sm rounded-lg bg-white/90 p-4 text-center text-[17px] leading-relaxed text-[var(--ink)]">
              <p>Este chat usa el mismo ayudante que WhatsApp.</p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={startConversation}
                disabled={
                  busy ||
                  (identityMode !== "clerk" && !phone)
                }
              >
                {needsClerkGate && !sessionAuthed
                  ? "Entrar y empezar"
                  : "Empezar"}
              </button>
            </div>
          )}
          {items.map((item) =>
            item.role === "user" ? (
              <div
                key={item.id}
                className={
                  isV2
                    ? "relative flex justify-end pr-9"
                    : "flex justify-end"
                }
              >
                {isV2 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-0 overflow-hidden rounded-full shadow-sm"
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                      minHeight: 28,
                      maxWidth: 28,
                      maxHeight: 28,
                    }}
                  >
                    <OwnerChatAvatar imageUrl={liveOwnerImageUrl} size={28} />
                  </div>
                )}
                <div className="fade-in max-w-[85%] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-[17px] text-[var(--ink)] shadow-sm">
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
                  <div
                    key={`${item.id}_${idx}`}
                    className={
                      isV2
                        ? "relative pl-9"
                        : "flex items-start justify-start gap-2"
                    }
                    style={
                      isV2
                        ? undefined
                        : { alignItems: "flex-start" }
                    }
                  >
                    {isV2 && idx === 0 && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-full shadow-sm"
                        style={{
                          width: 28,
                          height: 28,
                          minWidth: 28,
                          minHeight: 28,
                          maxWidth: 28,
                          maxHeight: 28,
                        }}
                      >
                        <AlfrebotRobotAvatar size={28} />
                      </div>
                    )}
                    <div className="fade-in min-w-0 max-w-[90%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-[17px] text-[var(--ink)] shadow-sm">
                      {m.kind === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.url}
                          alt={m.caption || ""}
                          className="mb-2 max-h-56 w-full rounded object-cover"
                        />
                      )}
                      <p className="whitespace-pre-wrap">
                        {linkifyMessageText(outboundDisplayText(m))}
                      </p>
                      {m.kind !== "sign_out" && m.options && m.options.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                          {m.options.map((o) => {
                            const introLocked =
                              item.id === V2_INTRO_ID &&
                              channelPicked &&
                              (o.id === V2_CHANNEL_WEB || o.id === V2_CHANNEL_WA);
                            return (
                              <button
                                key={o.id}
                                type="button"
                                disabled={busy || introLocked}
                                onClick={() => onChoice(o.id, o.label)}
                                className="min-h-12 cursor-pointer rounded border border-[#25D366]/40 bg-[#F0FFF4] px-3 py-2 text-left font-semibold text-[#075E54] transition-colors duration-200 hover:bg-[#E6F9ED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
          {uploading && (
            <div className="flex justify-end">
              <div className="rounded-lg bg-[#DCF8C6]/80 px-3 py-2 text-[15px] text-[var(--muted)]">
                Subiendo imagen…
              </div>
            </div>
          )}
          {recording && (
            <div className="flex justify-end">
              <div className="rounded-lg bg-[#DCF8C6]/80 px-3 py-2 text-[15px] text-[#9A3412]">
                Grabando… tocá el micrófono otra vez para enviar
              </div>
            </div>
          )}
          {sendingAudio && (
            <div className="flex justify-end">
              <div className="rounded-lg bg-[#DCF8C6]/80 px-3 py-2 text-[15px] text-[var(--muted)]">
                Subiendo audio…
              </div>
            </div>
          )}
          {(sending || pending) && !sendingAudio && !uploading && (
            <div className={isV2 ? "relative pl-9" : "flex items-start gap-2"}>
              {isV2 && (
                <div
                  aria-hidden
                  className="absolute left-0 top-0 overflow-hidden rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    minWidth: 28,
                    minHeight: 28,
                    maxWidth: 28,
                    maxHeight: 28,
                  }}
                >
                  <AlfrebotRobotAvatar size={28} />
                </div>
              )}
              <div className="rounded-lg bg-white/90 px-3 py-2 text-[16px] text-[var(--muted)] shadow-sm">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#075E54]/50" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#075E54]/50 [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#075E54]/50 [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          )}
          {error && (
            <p className="text-center text-[16px] text-[#9A3412]" role="alert">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSendText}
          className="relative z-10 flex shrink-0 min-w-0 items-end gap-1.5 border-t border-black/5 bg-[#F0F0F0] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-2"
        >
          {/*
            Inputs fuera de display:none: en varios Android/iOS el capture
            de cámara no abre si el <input type=file> está hidden.
            capture=environment pide la cámara trasera (ideal para productos).
          */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setPickSourceOpen(false);
              if (f) void onPickImage(f);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setPickSourceOpen(false);
              if (f) void onPickImage(f);
            }}
          />
          <input
            ref={iconInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              setIconPickOpen(false);
              if (f) void onPickStoreIcon(f);
            }}
          />
          <button
            type="button"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white text-[1.2rem]"
            onClick={() => {
              if (!canUseBot) {
                openAuthForWeb();
                return;
              }
              setPickSourceOpen(true);
            }}
            aria-label="Adjuntar foto de producto"
            aria-haspopup="dialog"
            disabled={busy || (canUseBot && identityMode !== "clerk" && !phone)}
            title="Foto de un producto"
          >
            📎
          </button>
          <button
            type="button"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded text-[1.2rem] ${
              recording
                ? "bg-[#DC2626] text-white"
                : "bg-white text-[var(--ink)]"
            }`}
            onClick={() => {
              if (!canUseBot) {
                openAuthForWeb();
                return;
              }
              void onToggleRecord();
            }}
            aria-label={recording ? "Detener y enviar audio" : "Grabar audio"}
            aria-pressed={recording}
            disabled={
              uploading ||
              pending ||
              sendingAudio ||
              (canUseBot && identityMode !== "clerk" && !phone)
            }
            title={
              recording
                ? "Tocá para enviar el audio"
                : "Grabar un audio para el bot"
            }
          >
            {recording ? "■" : "🎤"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              // Tras abrir el teclado, re-sync scroll interno (no el documento).
              window.requestAnimationFrame(() => {
                const el = messagesRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              });
            }}
            placeholder={
              canUseBot
                ? "Escribí o grabá un audio"
                : "Elegí cómo seguir para empezar"
            }
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-full border border-[var(--border)] bg-white px-3 text-[17px] outline-none sm:px-4"
            disabled={busy}
          />
          <button
            type="submit"
            className="btn btn-primary shrink-0 whitespace-nowrap rounded-full px-3 sm:px-4"
            disabled={busy}
          >
            Enviar
          </button>
        </form>

          {identityMode === "clerk" && (
            <>
              <WebChatAuthBridge onChange={onClerkSession} />
              <WebChatSsoFinish onPendingChange={onSsoPendingChange} />
              <WebChatSignOut requestId={signOutRequestId} />
            </>
          )}
          {needsClerkGate && (
            <ChatAuthOverlay
              open={authOpen && !ssoFinishing}
              onClose={dismissAuthOverlay}
            />
          )}

        {pickSourceOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <button
              type="button"
              className="absolute inset-0 bg-[var(--ink)]/40"
              aria-label="Cerrar"
              onClick={() => setPickSourceOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="photo-source-title"
              className="relative z-10 w-full max-w-md border border-[var(--border)] bg-[var(--bg)] px-5 pb-6 pt-5 shadow-lg sm:mx-4"
            >
              <h2
                id="photo-source-title"
                className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]"
              >
                Foto de un producto
              </h2>
              <p className="mt-1 text-[16px] text-[var(--muted)]">
                Para cargar o cambiar la foto de un producto. El icono de la
                tienda va por el menú → Tienda → Icono de la tienda.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  className="btn btn-primary w-full min-h-12"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  Sacar foto
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-full min-h-12"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  Elegir de la galería
                </button>
                <button
                  type="button"
                  className="min-h-11 w-full text-[17px] text-[var(--muted)] hover:text-[var(--primary)]"
                  onClick={() => setPickSourceOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {iconPickOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <button
              type="button"
              className="absolute inset-0 bg-[var(--ink)]/40"
              aria-label="Cerrar"
              onClick={() => setIconPickOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="icon-source-title"
              className="relative z-10 w-full max-w-md border border-[var(--border)] bg-[var(--bg)] px-5 pb-6 pt-5 shadow-lg sm:mx-4"
            >
              <h2
                id="icon-source-title"
                className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]"
              >
                Icono de la tienda
              </h2>
              <p className="mt-1 text-[16px] text-[var(--muted)]">
                Elegí una imagen cuadrada si podés. No reemplaza la foto de un
                producto.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                {liveOwnerImageUrl ? (
                  <button
                    type="button"
                    className="btn btn-primary w-full min-h-12"
                    disabled={busy || !phone}
                    onClick={() => {
                      setIconPickOpen(false);
                      sendPayload(
                        {
                          choiceId: "icon_from_profile",
                          text: "Usar mi foto de Google",
                        },
                        {
                          id: `u_${Date.now()}`,
                          role: "user",
                          text: "Usar mi foto de Google",
                        },
                      );
                    }}
                  >
                    Usar mi foto de Google
                  </button>
                ) : null}
                <button
                  type="button"
                  className={
                    liveOwnerImageUrl
                      ? "btn btn-secondary w-full min-h-12"
                      : "btn btn-primary w-full min-h-12"
                  }
                  onClick={() => iconInputRef.current?.click()}
                >
                  Elegir imagen
                </button>
                {!liveOwnerImageUrl ? (
                  <p className="text-[15px] leading-relaxed text-[var(--muted)]">
                    Para usar tu foto de cuenta, entrá con Google (u otra cuenta
                    con foto de perfil).
                  </p>
                ) : null}
                <button
                  type="button"
                  className="min-h-11 w-full text-[17px] text-[var(--muted)] hover:text-[var(--primary)]"
                  onClick={() => setIconPickOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
  );

  if (isV2) {
    return chatPanel;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {chatPanel}
      <aside className="hidden min-h-[70vh] flex-col rounded-lg border border-[var(--border)] bg-white/80 p-5 lg:flex">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Tu tienda en vivo
        </h2>
        <p className="mt-2 text-[1.05rem] leading-relaxed text-[var(--muted)]">
          Cuando publiques un producto, el link aparece acá.
        </p>
        <div className="mt-4 rounded border border-[var(--border)] bg-[var(--paper)] p-4">
          <p className="text-[1.05rem] font-semibold text-[var(--ink)]">
            Icono de la tienda
          </p>
          <p className="mt-1 text-[16px] leading-relaxed text-[var(--muted)]">
            Pedí «armar icono» en el chat, o subí tu imagen acá.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3 min-h-12 w-full"
            disabled={busy || !phone}
            onClick={() => setIconPickOpen(true)}
          >
            Subir icono
          </button>
        </div>
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
        <div className="mt-4 flex items-center gap-3 text-[15px] text-[var(--muted)]">
          <Image src="/demo/sello.svg" alt="" width={40} height={40} />
          Chat de prueba en la web
        </div>
      </aside>
    </div>
  );
}

function linkifyMessageText(text: string | undefined): ReactNode {
  if (!text) return null;
  return segmentUrls(text).map((seg, i) =>
    seg.type === "link" ? (
      <a
        key={`l_${i}`}
        href={seg.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#027eb5] underline break-all"
      >
        {seg.value}
      </a>
    ) : (
      <span key={`t_${i}`}>{seg.value}</span>
    ),
  );
}

/** Reduce phone photos so multipart upload stays under Vercel body limits. */
async function prepareImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

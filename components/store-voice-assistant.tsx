"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPriceArs } from "@/lib/format";
import type { StorePurchaseInfo } from "@/lib/store-purchase";
import {
  resolveVoiceTurn,
  type VoiceTurnResult,
} from "@/lib/voice/parse-intent";
import type { VoiceCatalogProduct } from "@/lib/voice/search-catalog";
import {
  getSpeechRecognitionCtor,
  speakText,
  stopSpeaking,
  type BrowserSpeechRecognition,
} from "@/lib/voice/browser-speech";
import { WantItButton } from "@/components/want-it-button";
import { ProductBuyActions } from "@/components/store-purchase";

type Props = {
  store: StorePurchaseInfo;
  products: VoiceCatalogProduct[];
  cloudSttAvailable?: boolean;
};

type Phase =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "done"
  | "error";

export function StoreVoiceAssistant({
  store,
  products,
  cloudSttAvailable = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [spokenLine, setSpokenLine] = useState("");
  const [result, setResult] = useState<VoiceTurnResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, []);

  function stopMicTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  const applyTranscript = useCallback(
    (text: string) => {
      const cleaned = text.trim();
      setTranscript(cleaned);
      setInterim("");
      if (!cleaned) {
        setError("No escuché nada. Tocá Hablar y decí qué buscás.");
        setPhase("error");
        return;
      }

      const turn = resolveVoiceTurn({
        transcript: cleaned,
        products,
        selectedId: selectedIdRef.current,
      });
      setResult(turn);

      if (turn.kind === "results" || turn.kind === "want_ambiguous") {
        setSelectedId(turn.hits[0]?.id ?? null);
      } else if (turn.kind === "want_ready") {
        setSelectedId(turn.product.id);
      }

      setSpokenLine(turn.spoken);
      setPhase("done");
      speakText(turn.spoken);
    },
    [products],
  );

  const transcribeViaCloud = useCallback(
    async (blob: Blob, mime: string) => {
      setPhase("transcribing");
      setError(null);
      try {
        const form = new FormData();
        const type = mime.split(";")[0] || "audio/webm";
        const ext = type.includes("ogg")
          ? "ogg"
          : type.includes("mp4")
            ? "m4a"
            : "webm";
        form.append(
          "audio",
          new File([blob], `voz-${Date.now()}.${ext}`, { type }),
        );
        form.append("mime", type);

        const res = await fetch(`/api/store/${store.storeSlug}/transcribe`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !json.text) {
          throw new Error(
            json.error ||
              "No pude entender el audio. Probá de nuevo en Chrome.",
          );
        }
        applyTranscript(json.text);
      } catch (err) {
        setPhase("error");
        setError(
          err instanceof Error
            ? err.message
            : "No pude usar el micrófono en la nube.",
        );
      }
    },
    [applyTranscript, store.storeSlug],
  );

  const startMediaFallback = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError(
        cloudSttAvailable
          ? "Este navegador no puede grabar audio. Probá en Chrome o Safari."
          : "Este navegador no entiende la voz. Probá en Chrome, o escribí el nombre del producto en la página.",
      );
      return;
    }

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
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        setPhase("error");
        stopMicTracks();
        setError("Falló la grabación. Tocá Hablar de nuevo.");
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        stopMicTracks();
        if (blob.size < 64) {
          setPhase("error");
          setError("El audio quedó vacío. Tocá Hablar, decí algo y tocá Listo.");
          return;
        }
        if (!cloudSttAvailable) {
          setPhase("error");
          setError(
            "No pude usar el reconocimiento del celular. Probá en Chrome.",
          );
          return;
        }
        void transcribeViaCloud(blob, type);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setPhase("recording");
      setSpokenLine("Escuchando… tocá Listo cuando termines.");
    } catch {
      stopMicTracks();
      setPhase("error");
      setError("No pude usar el micrófono. Revisá el permiso del navegador.");
    }
  }, [cloudSttAvailable, transcribeViaCloud]);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      void startMediaFallback();
      return;
    }

    stopSpeaking();
    setError(null);
    setInterim("");
    setTranscript("");
    setResult(null);
    setSpokenLine("Escuchando… decí qué buscás.");

    const recognition = new Ctor();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setPhase("listening");
    recognition.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        if (!row?.[0]) continue;
        if (row.isFinal) finalText += row[0].transcript;
        else interimText += row[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        applyTranscript(finalText);
      }
    };
    recognition.onerror = (ev) => {
      recognitionRef.current = null;
      if (ev.error === "aborted") return;
      if (ev.error === "no-speech") {
        setPhase("error");
        setError("No escuché nada. Tocá Hablar y probá de nuevo.");
        return;
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setPhase("error");
        setError("Necesito permiso del micrófono para escucharte.");
        return;
      }
      // Fallback cloud si el servicio del browser falla
      if (cloudSttAvailable) {
        void startMediaFallback();
        return;
      }
      setPhase("error");
      setError("No pude usar la voz en este navegador. Probá en Chrome.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setPhase((p) => (p === "listening" ? "idle" : p));
    };

    try {
      recognition.start();
    } catch {
      void startMediaFallback();
    }
  }, [applyTranscript, cloudSttAvailable, startMediaFallback]);

  function onPrimaryClick() {
    if (phase === "listening") {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (phase === "recording") {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        stopMicTracks();
        setError("No pude cortar la grabación.");
        setPhase("error");
      }
      return;
    }
    startWebSpeech();
  }

  const displayText = interim || transcript;
  const hits =
    result?.kind === "results" || result?.kind === "want_ambiguous"
      ? result.hits
      : result?.kind === "want_ready"
        ? [result.product]
        : [];

  const primaryLabel =
    phase === "listening" || phase === "recording"
      ? "Listo"
      : phase === "transcribing"
        ? "Escuchando…"
        : "Hablar";

  const primaryBusy = phase === "transcribing";

  return (
    <section
      className="mt-8 rounded border border-[var(--border)] bg-[var(--paper)] px-4 py-5 sm:px-5"
      aria-labelledby="voice-assist-title"
    >
      <h2
        id="voice-assist-title"
        className="font-[family-name:var(--font-display)] text-[1.45rem] font-semibold text-[var(--ink)] sm:text-2xl"
      >
        Buscar hablando
      </h2>
      <p className="mt-2 text-[1.15rem] leading-relaxed text-[var(--ink)]">
        Tocá Hablar y decí qué buscás. Si encontrás algo, tocá Lo quiero para
        pedirlo por WhatsApp.
      </p>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onPrimaryClick}
          disabled={primaryBusy}
          className="btn btn-primary min-h-14 min-w-[10rem] text-[1.25rem] disabled:cursor-not-allowed disabled:opacity-60"
          aria-pressed={phase === "listening" || phase === "recording"}
        >
          {primaryLabel}
        </button>
        {(phase === "listening" || phase === "recording") && (
          <p className="text-[1.15rem] font-medium text-[var(--primary)]" role="status">
            Escuchando…
          </p>
        )}
        {phase === "transcribing" && (
          <p className="text-[1.15rem] text-[var(--muted)]" role="status">
            Entendiendo lo que dijiste…
          </p>
        )}
      </div>

      <p
        className="mt-5 min-h-[3.5rem] font-[family-name:var(--font-display)] text-[1.55rem] font-semibold leading-snug text-[var(--ink)] sm:text-[1.75rem]"
        aria-live="polite"
      >
        {displayText
          ? `“${displayText}”`
          : spokenLine || "Acá va a aparecer lo que digas."}
      </p>

      {spokenLine && displayText && (
        <p className="mt-2 text-[1.15rem] leading-relaxed text-[var(--muted)]" aria-live="polite">
          {spokenLine}
        </p>
      )}

      {error && (
        <p className="mt-3 text-[1.1rem] text-[var(--primary)]" role="alert">
          {error}
        </p>
      )}

      {hits.length > 0 && (
        <ul className="mt-5 space-y-4">
          {hits.map((hit) => (
            <li
              key={hit.id}
              className={`border border-[var(--border)] bg-[var(--card)] px-4 py-4 ${
                selectedId === hit.id ? "ring-2 ring-[var(--primary)]" : ""
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSelectedId(hit.id)}
              >
                <p className="font-[family-name:var(--font-display)] text-[1.3rem] font-semibold text-[var(--ink)]">
                  {hit.title}
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-[1.5rem] font-bold text-[var(--primary)]">
                  {formatPriceArs(hit.priceCents)}
                  {!hit.inStock && (
                    <span className="ml-2 text-[1rem] font-medium text-[var(--soldout)]">
                      Agotado
                    </span>
                  )}
                </p>
              </button>
              <div className="mt-3">
                {store.checkoutMode === "whatsapp" ? (
                  <WantItButton
                    phone={store.phone}
                    showPhone={store.showPhone}
                    productTitle={hit.title}
                    priceCents={hit.priceCents}
                    storeName={store.storeName}
                    storeSlug={store.storeSlug}
                    ownerName={store.ownerName}
                    disabled={!hit.inStock}
                    className={!hit.inStock ? "opacity-50" : ""}
                  />
                ) : (
                  <ProductBuyActions
                    store={store}
                    product={{
                      id: hit.id,
                      title: hit.title,
                      priceCents: hit.priceCents,
                      imageUrl: hit.imageUrl,
                      inStock: hit.inStock,
                    }}
                    layout="inline"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[0.95rem] leading-relaxed text-[var(--muted)]">
        Privacidad: lo que digas se escucha en este celular. Solo se manda un
        audio a internet si el celular no puede entenderlo. No guardamos tu voz.{" "}
        <Link href="/privacidad" className="underline underline-offset-2">
          Más en Privacidad
        </Link>
        .
      </p>
    </section>
  );
}

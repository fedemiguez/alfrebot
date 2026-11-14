"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import { iktWantCtaLabel } from "@/lib/ikt-cta";

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

const IDLE_LABEL = "Tocar y hablar para buscar";
const LISTENING_LABEL = "Escuchando tu voz...";

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
  const [typedQuery, setTypedQuery] = useState("");
  const [understoodPhrase, setUnderstoodPhrase] = useState<string | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const ctaLabel = iktWantCtaLabel(store.businessKind);

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
        setError("No escuché nada. Tocá el micrófono y decí qué buscás.");
        setPhase("error");
        setUnderstoodPhrase(null);
        return;
      }

      setTypedQuery(cleaned);
      setUnderstoodPhrase(cleaned);

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
          : "Este navegador no entiende la voz. Probá en Chrome, o escribí el nombre del producto abajo.",
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
        setError("Falló la grabación. Tocá el micrófono de nuevo.");
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        stopMicTracks();
        if (blob.size < 64) {
          setPhase("error");
          setError("El audio quedó vacío. Tocá el micrófono, decí algo y tocá Listo.");
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
      setUnderstoodPhrase(null);
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
    setUnderstoodPhrase(null);
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
        setError("No escuché nada. Tocá el micrófono y probá de nuevo.");
        return;
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setPhase("error");
        setError("Necesito permiso del micrófono para escucharte.");
        return;
      }
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

  function onTypedSubmit(e: FormEvent) {
    e.preventDefault();
    const q = typedQuery.trim();
    if (!q) return;
    stopSpeaking();
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    if (phase === "recording") {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        stopMicTracks();
      }
    }
    setError(null);
    applyTranscript(q);
  }

  function clearSearch() {
    stopSpeaking();
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    setTypedQuery("");
    setTranscript("");
    setInterim("");
    setResult(null);
    setUnderstoodPhrase(null);
    setSpokenLine("");
    setError(null);
    setPhase("idle");
  }

  const displayText = interim || transcript;
  const hits =
    result?.kind === "results" || result?.kind === "want_ambiguous"
      ? result.hits
      : result?.kind === "want_ready"
        ? [result.product]
        : [];

  const isListening = phase === "listening" || phase === "recording";
  const primaryBusy = phase === "transcribing";
  const primaryLabel =
    isListening
      ? phase === "recording"
        ? "Listo"
        : LISTENING_LABEL
      : primaryBusy
        ? "Escuchando…"
        : IDLE_LABEL;

  const showUnderstood =
    Boolean(understoodPhrase) && phase === "done" && !isListening;
  const showListeningHint = isListening || phase === "transcribing";
  const voiceExample =
    products.find((p) => p.inStock)?.title ?? "el producto que buscás";

  return (
    <section className="store-voice" aria-labelledby="voice-assist-title">
      {/*
        Card flotante sticky (Gemini): top 8px / z-index 20 / sombra.
        Al scrollear se solapa sobre el feed de productos.
      */}
      <div className="store-voice-sticky ikt-voice-card">
        <h2 id="voice-assist-title" className="sr-only">
          Buscar hablando
        </h2>
        <button
          type="button"
          onClick={onPrimaryClick}
          disabled={primaryBusy}
          className={`store-voice-btn ikt-voice-btn${isListening ? " is-listening" : ""}`}
          aria-pressed={isListening}
          aria-label={primaryLabel}
        >
          <span className="store-voice-btn__icon" aria-hidden="true">
            <span
              className={`store-voice-btn__pulse${isListening ? " is-on" : ""}`}
            />
            <MicIcon />
          </span>
          <span>{primaryLabel}</span>
        </button>

        {showListeningHint ? (
          <div className="store-voice-feedback is-listening" role="status">
            <span aria-hidden="true">🎙️</span>
            <p>
              Escuchando… Probá decir:{" "}
              <em>&ldquo;{voiceExample}&rdquo;</em>
            </p>
          </div>
        ) : null}

        {showUnderstood && understoodPhrase ? (
          <div className="store-voice-feedback is-understood" role="status">
            <span aria-hidden="true">✅</span>
            <p>
              Entendí: <strong>&ldquo;{understoodPhrase}&rdquo;</strong>
            </p>
          </div>
        ) : null}

        <form className="store-voice-type" onSubmit={onTypedSubmit}>
          <label htmlFor="store-voice-text" className="sr-only">
            Buscar por texto
          </label>
          <span className="store-voice-type-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="store-voice-text"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={typedQuery}
            onChange={(e) => {
              setTypedQuery(e.target.value);
              if (!e.target.value.trim()) {
                setUnderstoodPhrase(null);
              }
            }}
            placeholder="O escribí acá..."
            className="store-voice-input"
          />
          {typedQuery.trim() ? (
            <button
              type="button"
              className="store-voice-clear"
              onClick={clearSearch}
            >
              Borrar
            </button>
          ) : null}
        </form>

        {error ? (
          <p className="store-voice-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {spokenLine && displayText && phase === "done" ? (
        <p className="store-voice-spoken sr-only" aria-live="polite">
          {spokenLine}
        </p>
      ) : null}

      {hits.length > 0 && (
        <ul className="store-voice-hits">
          {hits.map((hit) => (
            <li
              key={hit.id}
              className={`store-voice-hit${
                selectedId === hit.id ? " is-selected" : ""
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSelectedId(hit.id)}
              >
                <p className="font-[family-name:var(--ikt-font-heading)] text-[1.3rem] font-semibold text-[var(--ink)]">
                  {hit.title}
                </p>
                <p className="mt-1 font-[family-name:var(--ikt-font-heading)] text-[1.5rem] font-bold text-[var(--primary)]">
                  {formatPriceArs(hit.priceCents)}
                  {!hit.inStock && (
                    <span className="ml-2 text-[1rem] font-medium text-[var(--soldout)]">
                      Agotado
                    </span>
                  )}
                </p>
              </button>
              <div className="mt-3">
                {store.checkoutMode === "whatsapp" || ctaLabel ? (
                  <WantItButton
                    phone={store.phone}
                    showPhone={store.showPhone}
                    productTitle={hit.title}
                    priceCents={hit.priceCents}
                    storeName={store.storeName}
                    storeSlug={store.storeSlug}
                    ownerName={store.ownerName}
                    businessKind={store.businessKind}
                    disabled={!hit.inStock}
                    label={ctaLabel}
                    className={!hit.inStock ? "opacity-50 w-full" : "w-full"}
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
                    ctaLabel={ctaLabel}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MicIcon() {
  return (
    <svg
      className="store-voice-mic"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
      focusable="false"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
      />
    </svg>
  );
}

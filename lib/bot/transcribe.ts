/**
 * Transcribe audio (Meta ogg/opus or simulator webm) to Spanish text.
 * 1) Gemini (Gateway o Google AI Studio)
 * 2) Si falla / no hay key → Groq Whisper (GROQ_API_KEY)
 * Returns null if nothing works (bot stays usable via text).
 */

export type TranscribeFn = (
  blob: Blob,
  mime?: string,
) => Promise<string | null>;

/** Solo para smoke/tests: evita llamar a Gemini/Groq en CI. */
let testImpl: TranscribeFn | null = null;

export function setTranscribeImplForTests(fn: TranscribeFn | null) {
  testImpl = fn;
}

/**
 * IDs actuales (Google retira 2.x para cuentas nuevas).
 * Lite primero: suele tener más cupo que 3.8-flash en free tier.
 */
const GOOGLE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
] as const;

const GATEWAY_MODELS = [
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.8-flash",
  "google/gemini-3.5-flash",
] as const;

const GROQ_WHISPER_MODELS = [
  "whisper-large-v3-turbo",
  "whisper-large-v3",
] as const;

const TRANSCRIBE_TIMEOUT_MS = 20_000;

function hasGoogleKey(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  );
}

function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function hasAiKey(): boolean {
  return hasGoogleKey() || hasGroqKey();
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function cleanTranscript(raw: string): string | null {
  const text = raw
    .replace(/^["«]|["»]$/g, "")
    .replace(/^(transcripci[oó]n|texto)\s*:\s*/i, "")
    .trim();
  if (!text || text.length < 1) return null;
  if (/^(no (se )?entiende|silence|inaudible|\(silencio\))$/i.test(text)) {
    return null;
  }
  return text;
}

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function transcribeWithGoogle(
  bytes: Uint8Array,
  mediaType: string,
): Promise<string | null> {
  if (!hasGoogleKey()) return null;

  const { generateText } = await import("ai");
  const prompt =
    "Transcribí este audio al español de Argentina (rioplatense). " +
    "Devolvé SOLO el texto dicho, sin comillas, sin prefijos ni explicaciones. " +
    "Si no se entiende nada, respondé exactamente: inaudible";

  const content = [
    { type: "file" as const, data: bytes, mediaType },
    { type: "text" as const, text: prompt },
  ];

  if (process.env.AI_GATEWAY_API_KEY?.trim()) {
    const { gateway } = await import("@ai-sdk/gateway");
    for (const modelId of GATEWAY_MODELS) {
      try {
        const result = await generateText({
          model: gateway(modelId),
          messages: [{ role: "user", content }],
          maxRetries: 0,
          abortSignal: abortAfter(TRANSCRIBE_TIMEOUT_MS),
        });
        const cleaned = cleanTranscript(result.text);
        if (cleaned) return cleaned;
      } catch (err) {
        console.warn(`[transcribe] gateway ${modelId} failed`, err);
      }
    }
    return null;
  }

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!.trim(),
  });
  for (const modelId of GOOGLE_MODELS) {
    try {
      const result = await generateText({
        model: google(modelId),
        messages: [{ role: "user", content }],
        maxRetries: 0,
        abortSignal: abortAfter(TRANSCRIBE_TIMEOUT_MS),
      });
      const cleaned = cleanTranscript(result.text);
      if (cleaned) return cleaned;
    } catch (err) {
      console.warn(`[transcribe] google ${modelId} failed`, err);
    }
  }
  return null;
}

/** Fallback free cuando Gemini satura o falla. */
async function transcribeWithGroq(bytes: Uint8Array): Promise<string | null> {
  if (!hasGroqKey()) return null;

  try {
    const { transcribe } = await import("ai");
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY!.trim(),
    });

    for (const modelId of GROQ_WHISPER_MODELS) {
      try {
        const result = await transcribe({
          model: groq.transcription(modelId),
          audio: bytes,
          maxRetries: 0,
          abortSignal: abortAfter(TRANSCRIBE_TIMEOUT_MS),
          providerOptions: {
            groq: {
              language: "es",
              // Guía corta para nombres/precios de tienda
              prompt:
                "Audio en español rioplatense de dueña de tienda: precios, stock, productos.",
            },
          },
        });
        const cleaned = cleanTranscript(result.text);
        if (cleaned) {
          console.info(`[transcribe] groq ${modelId} ok`);
          return cleaned;
        }
      } catch (err) {
        console.warn(`[transcribe] groq ${modelId} failed`, err);
      }
    }
  } catch (err) {
    console.warn("[transcribe] groq unavailable", err);
  }
  return null;
}

/**
 * @returns transcribed text, or null if unavailable / failed
 */
export async function transcribeAudio(
  blob: Blob,
  mime?: string,
): Promise<string | null> {
  if (testImpl) return testImpl(blob, mime);

  if (!hasAiKey()) {
    console.warn("[transcribe] no AI key configured (Google ni Groq)");
    return null;
  }

  const mediaType =
    mime?.split(";")[0]?.trim() ||
    blob.type?.split(";")[0]?.trim() ||
    "audio/ogg";

  try {
    const bytes = await blobToUint8Array(blob);
    if (bytes.byteLength < 64) {
      console.warn("[transcribe] audio too small", bytes.byteLength);
      return null;
    }

    // 1) Google / Gateway
    const fromGoogle = await transcribeWithGoogle(bytes, mediaType);
    if (fromGoogle) return fromGoogle;

    // 2) Groq Whisper si Google falló o no está configurado
    if (hasGoogleKey()) {
      console.warn("[transcribe] Google falló; probando Groq Whisper");
    }
    return transcribeWithGroq(bytes, mediaType);
  } catch (err) {
    console.warn("[transcribe] failed", err);
    return null;
  }
}

export function hasTranscriptionConfigured(): boolean {
  return hasAiKey();
}

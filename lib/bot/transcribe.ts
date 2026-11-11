/**
 * Transcribe audio (Meta ogg/opus or simulator webm) to Spanish text.
 * Uses AI Gateway when available, else Google AI Studio key.
 * Returns null if no key / model fails (bot stays usable via text).
 */

export type TranscribeFn = (
  blob: Blob,
  mime?: string,
) => Promise<string | null>;

/** Solo para smoke/tests: evita llamar a Gemini en CI. */
let testImpl: TranscribeFn | null = null;

export function setTranscribeImplForTests(fn: TranscribeFn | null) {
  testImpl = fn;
}

/** Preferidos primero; si uno está caído/saturado, probamos el siguiente. */
const GOOGLE_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

const GATEWAY_MODELS = [
  "google/gemini-3.8-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
] as const;

const TRANSCRIBE_TIMEOUT_MS = 20_000;

function hasAiKey(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  );
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

/**
 * @returns transcribed text, or null if unavailable / failed
 */
export async function transcribeAudio(
  blob: Blob,
  mime?: string,
): Promise<string | null> {
  if (testImpl) return testImpl(blob, mime);

  if (!hasAiKey()) {
    console.warn("[transcribe] no AI key configured");
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
  } catch (err) {
    console.warn("[transcribe] failed", err);
    return null;
  }
}

export function hasTranscriptionConfigured(): boolean {
  return hasAiKey();
}

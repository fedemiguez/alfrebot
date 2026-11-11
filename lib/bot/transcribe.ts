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
  // Model sometimes returns “no se entiende”
  if (/^(no (se )?entiende|silence|inaudible|\(silencio\))$/i.test(text)) {
    return null;
  }
  return text;
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

    let text: string;

    if (process.env.AI_GATEWAY_API_KEY?.trim()) {
      const { gateway } = await import("@ai-sdk/gateway");
      const result = await generateText({
        model: gateway("google/gemini-3.8-flash"),
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: bytes, mediaType },
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      text = result.text;
    } else {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!.trim(),
      });
      const result = await generateText({
        model: google("gemini-3.8-flash"),
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: bytes, mediaType },
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      text = result.text;
    }

    return cleanTranscript(text);
  } catch (err) {
    console.warn("[transcribe] failed", err);
    return null;
  }
}

export function hasTranscriptionConfigured(): boolean {
  return hasAiKey();
}

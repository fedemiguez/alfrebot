import { NextResponse } from "next/server";
import {
  hasTranscriptionConfigured,
  transcribeAudioBuyer,
} from "@/lib/bot/transcribe";
import { getCachedStore } from "@/lib/store-data";

/** STT puede tardar; evita corte corto en Hobby. */
export const maxDuration = 30;

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

/**
 * Fallback cloud STT para el asistente de voz del comprador.
 * Solo se usa si Web Speech no está / falla. Groq primero (no pisa cupo Gemini dueña).
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/store/[slug]/transcribe">,
) {
  const { slug } = await ctx.params;
  if (!slug || slug.length > 80) {
    return NextResponse.json({ error: "Tienda inválida" }, { status: 400 });
  }

  const { store } = await getCachedStore(slug);
  if (!store || !store.name) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  if (!hasTranscriptionConfigured()) {
    return NextResponse.json(
      {
        error:
          "El reconocimiento en la nube no está disponible. Probá en Chrome o dictá de nuevo.",
        code: "stt_unavailable",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Audio inválido" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size < 64) {
    return NextResponse.json(
      { error: "Mandá un audio corto (hablá y soltá Hablar)." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El audio es muy largo. Decí una frase corta." },
      { status: 413 },
    );
  }

  const mime =
    (typeof form.get("mime") === "string" && String(form.get("mime"))) ||
    file.type ||
    "audio/webm";

  try {
    const text = await transcribeAudioBuyer(file, mime);
    if (!text) {
      return NextResponse.json(
        {
          error: "No pude entender el audio. Probá de nuevo o escribí lo que buscás.",
          code: "no_transcript",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.warn("[store-transcribe]", slug, err);
    return NextResponse.json(
      { error: "Falló el reconocimiento. Probá de nuevo." },
      { status: 502 },
    );
  }
}

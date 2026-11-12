/**
 * Helpers client-side: Web Speech STT + speechSynthesis TTS.
 * Solo tipado / detección; la UI vive en StoreVoiceAssistant.
 */

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
};

export type BrowserSpeechRecognitionEvent = {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string; confidence: number };
    };
  };
};

export type BrowserSpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSupportsSpeechRecognition(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function browserSupportsSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Lee en voz alta (es-AR si hay voz). Respeta prefers-reduced-motion… no; TTS es a pedido. */
export function speakText(text: string, opts?: { cancel?: boolean }): void {
  if (!browserSupportsSpeechSynthesis() || !text.trim()) return;
  const synth = window.speechSynthesis;
  if (opts?.cancel !== false) synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "es-AR";
  utter.rate = 0.95;
  const voices = synth.getVoices();
  const es =
    voices.find((v) => /es-AR/i.test(v.lang)) ||
    voices.find((v) => /^es/i.test(v.lang));
  if (es) utter.voice = es;
  synth.speak(utter);
}

export function stopSpeaking(): void {
  if (browserSupportsSpeechSynthesis()) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Copy de bienvenida / reencuentro (UX writing +60, guía §1).
 * Solo strings; sin lógica de FSM.
 */

import { appBaseUrl } from "@/lib/env";

export type WelcomeClosing = "owner" | "guest" | "onboarding";

/** URL pública de la página de ayuda (web + WhatsApp). */
export function helpPageUrl(): string {
  return `${appBaseUrl()}/ayuda`;
}

/** Mensaje principal tipo guía §1 (escaneable, voice-first, 3 opciones). */
export function welcomeMainMessage(opts?: {
  firstName?: string | null;
  closing?: WelcomeClosing;
}): string {
  const name = opts?.firstName?.trim();
  const hi = name ? `¡Hola ${name}!` : "¡Hola!";
  const closing =
    opts?.closing === "owner"
      ? "Elegí del menú o mandame un audio contándome qué necesitás."
      : opts?.closing === "onboarding"
        ? "Cuando termines de presentarte, arrancamos juntos."
        : "¿Empezamos? Mandame la foto de tu primer producto o contame qué vendés.";

  return (
    `${hi} 👋 Soy Alfrebot, tu ayudante para armar y manejar tu tienda fácil y rápido.\n\n` +
    `Como sé que a veces escribir en el celular cuesta o da fiaca, podés hablarme por audio 🎤 para hacer todo lo que necesites.\n\n` +
    `¿Qué querés hacer ahora? Elegí una opción o mandame un audio:\n\n` +
    `📦 1. Cargar o cambiar productos\n` +
    `Mandame una foto de tu producto, decime su nombre y precio por audio, y yo lo armo por vos.\n\n` +
    `🎨 2. Cambiar colores o estilo\n` +
    `Decime por ejemplo: "Quiero el fondo crema" o "Poné color verde" y tu tienda se adapta sola.\n\n` +
    `💬 3. Recibir pedidos en tu WhatsApp\n` +
    `Decime a qué número querés que te escriban tus clientes para comprarte.\n\n` +
    `💡 Consejo: en cualquier momento podés decirme Menú para ver las opciones, Ayuda si te trabás, o Cancelar para volver atrás.\n\n` +
    closing
  );
}

/** Segundo bubble del estado NEW: nombre + ya tengo cuenta. */
export function welcomeAskNameMessage(): string {
  return (
    "Para arrancar, ¿cómo te llamás?\n\n" +
    'Si ya armaste la tienda en la web, escribí "Ya tengo cuenta".'
  );
}

/** Reencuentro con tienda activa. */
export function welcomeBackMessage(ownerName?: string | null): string {
  const name = ownerName?.trim();
  const hi = name ? `¡Hola de nuevo, ${name}!` : "¡Hola de nuevo!";
  return (
    `${hi} 👋\n\n` +
    `Qué bueno verte. Acá estoy para tu tienda: podés hablarme por audio 🎤 o elegir del menú.\n\n` +
    `¿Qué querés hacer?`
  );
}

/** Ayuda general: mismo espíritu que §1, sin muro ni rutas con flechas. */
export function helpGeneralMessage(): string {
  return (
    `¿Te trabaste? Sin problema. 👋\n\n` +
    `Podés hablarme por audio 🎤 o elegir del menú. Yo te voy guiando paso a paso.\n\n` +
    `📦 Cargar o cambiar productos\n` +
    `Mandame una foto, o decime nombre y precio por audio.\n\n` +
    `🎨 Cambiar colores o estilo\n` +
    `Decime por ejemplo: "Quiero el fondo crema" o "Poné color verde".\n\n` +
    `💬 Pedidos en tu WhatsApp\n` +
    `Decime a qué número te escriben tus clientes.\n\n` +
    `👨‍👩‍👧 ¿Le armás la tienda a alguien de la familia?\n` +
    `En la web, menú WhatsApp → Manejar desde acá: te doy un código para unir el celular de quien vende. Es la misma tienda (mismo email + su WhatsApp).\n\n` +
    `📖 Guía completa (pasos y preguntas): ${helpPageUrl()}\n\n` +
    `💡 Consejo: decime Menú para ver opciones, o Cancelar para volver atrás (no se borra tu tienda).\n\n` +
    `¿Empezamos? Mandame un audio o elegí del menú.`
  );
}

/**
 * Apariencia Clerk alineada al design system de alfrebot (Promax / Lexend).
 * Oculta logo y “Secured by Clerk” para que el formulario se sienta propio.
 */
export const alfrebotClerkAppearance = {
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    showOptionalFields: false,
    animations: true,
  },
  variables: {
    colorPrimary: "#9a3412",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#0f172a",
    colorText: "#0f172a",
    colorTextSecondary: "#334155",
    colorDanger: "#9a3412",
    colorSuccess: "#059669",
    borderRadius: "4px",
    fontFamily: "var(--font-body), 'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-display), Lexend, sans-serif",
    fontSize: "1.05rem",
  },
  elements: {
    rootBox: "w-full max-w-md",
    card: "shadow-none border border-[var(--border)] bg-white p-6 sm:p-8",
    headerTitle:
      "font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]",
    headerSubtitle: "text-[var(--muted)] text-[1.05rem]",
    socialButtonsBlockButton:
      "min-h-12 border-2 border-[var(--border)] bg-white text-[var(--ink)] font-[family-name:var(--font-display)] font-semibold hover:border-[var(--primary)]",
    socialButtonsBlockButtonText: "font-[family-name:var(--font-display)] font-semibold",
    dividerLine: "bg-[var(--border)]",
    dividerText: "text-[var(--muted)] text-[15px]",
    formFieldLabel: "text-[17px] font-semibold text-[var(--ink)]",
    formFieldInput:
      "min-h-12 rounded border border-[var(--border)] bg-white px-4 text-[1.1rem] text-[var(--ink)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20",
    formButtonPrimary:
      "btn btn-primary min-h-12 w-full shadow-none font-[family-name:var(--font-display)]",
    footerActionLink: "text-[var(--primary)] font-semibold hover:underline",
    identityPreviewEditButton: "text-[var(--primary)]",
    formFieldInputShowPasswordButton: "text-[var(--muted)]",
    // Branding Clerk
    logoBox: "hidden",
    logoImage: "hidden",
    footer: "hidden",
    footerAction: "pt-4",
    badge: "hidden",
    developmentModeNotice: "hidden",
  },
} as const;

/** Apariencia Clerk para el overlay in-chat (verdes WhatsApp / alfrebot). */
export const alfrebotClerkChatAppearance = {
  ...alfrebotClerkAppearance,
  variables: {
    ...alfrebotClerkAppearance.variables,
    colorPrimary: "#075E54",
    colorDanger: "#9A3412",
    colorSuccess: "#25D366",
    borderRadius: "8px",
  },
  elements: {
    ...alfrebotClerkAppearance.elements,
    rootBox: "w-full max-w-[min(100%,24rem)]",
    card: "shadow-none border border-[#075E54]/15 bg-white p-5 sm:p-6",
    headerTitle:
      "font-[family-name:var(--font-display)] text-xl font-semibold text-[#075E54]",
    headerSubtitle: "text-[#334155] text-[1rem]",
    socialButtonsBlockButton:
      "min-h-12 border-2 border-[#075E54]/20 bg-white text-[#0f172a] font-[family-name:var(--font-display)] font-semibold hover:border-[#25D366]",
    formFieldInput:
      "min-h-12 rounded-lg border border-[#075E54]/20 bg-white px-4 text-[1.1rem] text-[#0f172a] outline-none focus:border-[#075E54] focus:ring-2 focus:ring-[#25D366]/25",
    formButtonPrimary:
      "min-h-12 w-full rounded-full bg-[#25D366] text-white shadow-none font-[family-name:var(--font-display)] font-semibold hover:opacity-95",
    footerActionLink: "text-[#075E54] font-semibold hover:underline",
    identityPreviewEditButton: "text-[#075E54]",
  },
} as const;

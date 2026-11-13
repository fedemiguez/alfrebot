"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { alfrebotClerkAppearance } from "@/lib/clerk-appearance";
import { CLERK_AFTER_AUTH_URL } from "@/lib/clerk-redirects";

export function AuthSignUpForm() {
  return (
    <SignUp
      forceRedirectUrl={CLERK_AFTER_AUTH_URL}
      fallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signInForceRedirectUrl={CLERK_AFTER_AUTH_URL}
      signInFallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signInUrl="/sign-in"
      appearance={alfrebotClerkAppearance}
    />
  );
}

export function AuthSignInForm() {
  return (
    <SignIn
      forceRedirectUrl={CLERK_AFTER_AUTH_URL}
      fallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signUpForceRedirectUrl={CLERK_AFTER_AUTH_URL}
      signUpFallbackRedirectUrl={CLERK_AFTER_AUTH_URL}
      signUpUrl="/sign-up"
      appearance={alfrebotClerkAppearance}
    />
  );
}

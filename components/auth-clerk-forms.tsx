"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { alfrebotClerkAppearance } from "@/lib/clerk-appearance";

export function AuthSignUpForm() {
  return (
    <SignUp
      forceRedirectUrl="/probar"
      signInUrl="/sign-in"
      appearance={alfrebotClerkAppearance}
    />
  );
}

export function AuthSignInForm() {
  return (
    <SignIn
      forceRedirectUrl="/probar"
      signUpUrl="/sign-up"
      appearance={alfrebotClerkAppearance}
    />
  );
}

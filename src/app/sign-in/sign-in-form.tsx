"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button, Divider, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: "Use your Princeton account to sign in.",
  not_invited:
    "That address has not been invited. Ask the President to add you to the board.",
  not_a_member: "That account does not have board access.",
  no_email: "That account did not provide an email address.",
};

export function SignInForm({
  googleEnabled,
  devLoginEnabled,
}: {
  googleEnabled: boolean;
  devLoginEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code ? (ERROR_MESSAGES[code] ?? "Sign-in was refused.") : null;
  });

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.signIn.email({
      email,
      password,
    });
    setBusy(false);
    if (failure) {
      setError(
        (failure.code && ERROR_MESSAGES[failure.code]) ||
          failure.message ||
          "Those details were not accepted.",
      );
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-line bg-danger-wash px-3 py-2.5 text-[13px] leading-relaxed text-danger"
        >
          {error}
        </p>
      ) : null}

      {googleEnabled ? (
        <Button
          type="button"
          variant="secondary"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full"
        >
          Continue with Princeton Google
        </Button>
      ) : (
        <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[13px] leading-relaxed text-muted">
          Princeton Google sign-in is currently unavailable.
        </p>
      )}

      {devLoginEnabled ? (
        <>
          <Divider label="Development sign-in" />
          <form onSubmit={signInWithPassword} className="space-y-2.5">
            <Field label="Princeton email">
              <Input
                type="email"
                required
                autoComplete="username"
                placeholder="you@princeton.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}

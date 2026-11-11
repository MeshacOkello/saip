import { redirect } from "next/navigation";
import { Suspense } from "react";

import { devLoginEnabled } from "@/lib/auth";
import { logoSrc } from "@/lib/branding";
import { currentMember } from "@/lib/session";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · SAIP Board" };

export default async function SignInPage() {
  if (await currentMember()) redirect("/dashboard");

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const logo = logoSrc();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-[32rem] overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="sign-in-brand px-6 py-5 sm:px-9">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt="Society for African Internationals at Princeton"
              width="126"
              height="63"
            />
          ) : (
            <p className="font-semibold">SAIP</p>
          )}
          <p className="eyebrow">Board workspace</p>
        </div>
        <div className="px-6 py-7 sm:px-9 sm:py-9">
          <h1 className="page-heading">Sign in</h1>
          <p className="mt-3 max-w-prose text-sm text-ink-2">
            Use the Princeton email address that received your board invitation.
          </p>
          <div className="mt-6">
            <Suspense>
              <SignInForm
                googleEnabled={googleEnabled}
                devLoginEnabled={devLoginEnabled}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

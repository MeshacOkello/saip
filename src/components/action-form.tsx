"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";

export type ActionState = { ok: boolean; error?: string; message?: string };

const INITIAL: ActionState = { ok: true };

/**
 * One form component for every mutation: it keeps the pending state, shows what the
 * server said, and asks before anything destructive.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  confirm,
  variant = "primary",
  size = "md",
  className = "",
  inline = false,
  hidden,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  inline?: boolean;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={`${inline ? "contents" : "space-y-4"} ${className}`}
    >
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {children}

      <div className={inline ? "" : "flex flex-wrap items-center gap-3"}>
        <button
          type="submit"
          disabled={pending}
          className={buttonClass(variant, size)}
        >
          {pending ? "Working…" : submitLabel}
        </button>
        {!inline && state.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
          </p>
        ) : null}
        {!inline && state.ok && state.message ? (
          <p role="status" className="text-[13px] text-ink-2">
            {state.message}
          </p>
        ) : null}
      </div>

      {inline && (state.error || state.message) ? (
        <p
          role={state.error ? "alert" : "status"}
          className={`basis-full text-[13px] ${state.error ? "text-danger" : "text-muted"}`}
        >
          {state.error ?? state.message}
        </p>
      ) : null}
    </form>
  );
}

import { DialogEditor } from "@/components/dialog-editor";
import Link from "next/link";
import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";

import {
  IconArrowRight,
  IconCalendar,
  
  IconNotes,
} from "@/components/icons";

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2 hover:ring-line-strong",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-surface text-danger ring-1 ring-inset ring-line hover:bg-danger-wash",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-2.5 text-[13px] gap-1.5",
  md: "min-h-10 px-3.5 text-[14px] gap-2",
  lg: "min-h-11 px-5 text-[15px] gap-2",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
) {
  return [
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium",
    "transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50",
    "whitespace-nowrap",
    VARIANTS[variant],
    SIZES[size],
  ].join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      {...props}
      className={`${buttonClass(variant, size)} ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Page and section structure                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
  eyebrow,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        {back ? (
          <div className="mb-2 text-[14px] text-muted">{back}</div>
        ) : null}
        {eyebrow ? <p className="eyebrow mb-2.5">{eyebrow}</p> : null}
        <h1 className="page-heading">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-[15px] text-ink-2">{description}</p>
        ) : null}
        {meta ? (
          <div className="page-meta mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/**
 * A titled block of content. Borderless by default: the heading and the spacing do
 * the separating, so pages do not turn into a grid of boxes.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-[14px] text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A shared surface for a distinct group of content or controls. */
export function Surface({
  children,
  padded = true,
  className = "",
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-surface shadow-card ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start px-5 py-7 sm:px-6 sm:py-8">
      <span className="mb-3 inline-grid size-9 place-items-center rounded-lg bg-surface-2 text-primary">
        {icon ?? <IconNotes />}
      </span>
      <p className="text-[15px] font-medium">{title}</p>
      {children ? (
        <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Divider({ label }: { label?: ReactNode }) {
  if (!label) return <hr className="border-line" />;
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-muted">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[13px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg bg-surface text-[15px] text-ink ring-1 ring-inset ring-line " +
  "placeholder:text-muted transition-shadow hover:ring-line-strong " +
  "focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} h-10 px-3 ${className}`} />;
}

export function Textarea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${CONTROL} resize-y px-3 py-2.5 ${className}`}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={`${CONTROL} h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.65rem_center] bg-no-repeat pl-3 pr-9 ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5 12 6.5'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

export function Checkbox({
  label,
  ...props
}: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-snug">
      <input
        {...props}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--primary)]"
      />
      <span>{label}</span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = "neutral" | "primary" | "secondary" | "warn" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  primary: "bg-primary-wash text-primary",
  secondary: "bg-secondary-wash text-secondary",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[13px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  const dots: Record<Tone, string> = {
    neutral: "bg-line-strong",
    primary: "bg-primary",
    secondary: "bg-secondary",
    warn: "bg-warn",
    danger: "bg-danger",
  };
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${dots[tone]}`}
    />
  );
}

export function Avatar({
  name,
  size = 32,
  src = null,
}: {
  name: string;
  size?: number;
  /** A picture, if the person has one. Initials stand in when they do not. */
  src?: string | null;
}) {
  // The shape is set inline rather than by a class so that no rule further up
  // can reshape a face. The account menu learned this the hard way: a summary
  // rule gave it a border, a 0.5rem radius and side padding, and the circle
  // came out a bordered rounded rectangle with white space down both sides.
  const shape = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
  } as const;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ ...shape, objectFit: "cover", border: 0, padding: 0 }}
        className="inline-block bg-surface-2"
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      style={{
        ...shape,
        fontSize: Math.round(size * 0.38),
        lineHeight: 1,
        border: 0,
        padding: 0,
      }}
      className="inline-flex items-center justify-center bg-primary-wash font-semibold text-primary"
    >
      {initials}
    </span>
  );
}

export function Notice({
  tone = "primary",
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const edge: Record<Tone, string> = {
    neutral: "border-line-strong",
    primary: "border-primary",
    secondary: "border-secondary",
    warn: "border-warn",
    danger: "border-danger",
  };
  return (
    <div
      className={`rounded-xl border-l-[3px] bg-surface p-5 shadow-card ${edge[tone]}`}
    >
      {title ? <p className="text-[15px] font-semibold">{title}</p> : null}
      {children ? (
        <div className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-2">
          {children}
        </div>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Lists and tables                                                           */
/* -------------------------------------------------------------------------- */

/** Rows inside a surface, divided by hairlines rather than boxed individually. */
export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

export function Item({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-2 ${className}`}
    >
      {children}
    </li>
  );
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="responsive-table rounded-xl bg-surface shadow-card">
      <table
        role="table"
        className="w-full table-fixed border-collapse text-sm"
      >
        <thead role="rowgroup">
          <tr role="row" className="border-b border-line text-left">
            {head.map((cell, index) => (
              <th
                key={index}
                role="columnheader"
                scope="col"
                className="px-3.5 py-3 text-xs font-semibold text-muted first:pl-5 last:pr-5"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="divide-y divide-line">
          {Children.map(children, (row) =>
            isValidElement<ComponentProps<"tr">>(row) && row.type === "tr"
              ? cloneElement(row, {
                  role: "row",
                  children: Children.map(row.props.children, (cell, index) =>
                    isValidElement<ComponentProps<typeof Cell>>(cell) &&
                    cell.type === Cell
                      ? cloneElement(cell, {
                          label:
                            typeof head[index] === "string"
                              ? head[index]
                              : undefined,
                        })
                      : cell,
                  ),
                })
              : row,
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  className = "",
  colSpan,
  label,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
  label?: string;
}) {
  return (
    <td
      role="cell"
      colSpan={colSpan}
      className={`px-3.5 py-3.5 align-middle first:pl-5 last:pr-5 ${className}`}
    >
      {label ? (
        <span aria-hidden className="table-mobile-label">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  );
}

export function TextLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-primary hover:underline ${className}`}
    >
      {children}
      <IconArrowRight />
    </Link>
  );
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric" });

export function DateTile({ date }: { date: Date | null }) {
  return date ? (
    <time dateTime={date.toISOString()} className="date-tile shrink-0">
      <span>{MONTH.format(date)}</span>
      <strong>{DAY.format(date)}</strong>
    </time>
  ) : (
    <span className="date-tile shrink-0" aria-label="No date">
      <IconCalendar />
    </span>
  );
}

export function Editor({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id: string;
  open?: boolean;
}) {
  return <DialogEditor title={title} description={description} id={id}>{children}</DialogEditor>;
}

export function WorkList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

export function WorkEntry({
  href,
  date,
  title,
  subtitle,
  status,
  details,
}: {
  href: string;
  date: Date | null;
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  details?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="list-link flex-wrap sm:flex-nowrap">
        <DateTile date={date} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-[13px] leading-snug text-muted">
              {subtitle}
            </p>
          ) : null}
          {details ? (
            <p className="mt-1.5 text-xs text-muted">{details}</p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2 text-primary">
          {status}
          <IconArrowRight className="hidden size-4 shrink-0 sm:block" />
        </div>
      </Link>
    </li>
  );
}

/**
 * The header for a workspace you are working *inside* — an event, a meeting, a
 * conversation. Deliberately smaller than a section landing page's display title:
 * once you are in the thing, the content matters more than the name of it.
 */
export function WorkspaceHeader({
  back,
  title,
  meta,
  status,
  actions,
  tabs,
}: {
  back?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="workspace-header">
      {back ? <div className="mb-2 text-sm">{back}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="workspace-title">{title}</h1>
            {status}
          </div>
          {meta ? (
            <div className="page-meta mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </header>
  );
}

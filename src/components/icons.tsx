import type { SVGProps } from "react";

/** Line icons drawn on a 16-grid, rendered at 18px. */

function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px] shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M2.5 6.8 8 2.5l5.5 4.3V13a.5.5 0 0 1-.5.5h-3V9.5h-4v4H3a.5.5 0 0 1-.5-.5V6.8Z" />
  </Base>
);

export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Base>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="m5.5 8.2 1.8 1.8 3.2-3.6" />
  </Base>
);

export const IconNotes = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
    <path d="M5.8 5.5h4.4M5.8 8h4.4M5.8 10.5h2.6" />
  </Base>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="6.2" cy="5.8" r="2.3" />
    <path d="M2.5 13.2c0-2 1.7-3.3 3.7-3.3s3.7 1.3 3.7 3.3" />
    <path d="M10.6 3.9a2.2 2.2 0 0 1 0 4.1M11.4 10.2c1.3.4 2.1 1.4 2.1 3" />
  </Base>
);

export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M8 2.2 13 4v3.9c0 3-2.1 5-5 5.9-2.9-.9-5-2.9-5-5.9V4l5-1.8Z" />
    <path d="m6.1 7.9 1.4 1.4 2.5-2.7" />
  </Base>
);

export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Base>
);

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Base>
);

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" />
  </Base>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M8 3v10M3 8h10" />
  </Base>
);

export const IconMoney = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="1.8" y="4" width="12.4" height="8" rx="1.6" />
    <circle cx="8" cy="8" r="1.8" />
    <path d="M4.3 8h.01M11.7 8h.01" />
  </Base>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3.5 8h9M8 3.5 12.5 8 8 12.5" />
  </Base>
);

export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M13.5 9.5a1.5 1.5 0 0 1-1.5 1.5H6l-3 2.5V4a1.5 1.5 0 0 1 1.5-1.5h7.5A1.5 1.5 0 0 1 13.5 4v5.5Z" />
  </Base>
);

export const IconLogOut = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M7 2.5H3v11h4M6 8h7.5m-3-3 3 3-3 3" />
  </Base>
);

export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m4 6 4 4 4-4" />
  </Base>
);

export const IconBell = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12.3 11.2H3.7c.8-.9 1.2-2 1.2-3.2V7a3.1 3.1 0 0 1 6.2 0v1c0 1.2.4 2.3 1.2 3.2Z" />
    <path d="M6.6 13.2a1.6 1.6 0 0 0 2.8 0" />
  </Base>
);

export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 3.2h4.1c.8 0 1.4.6 1.4 1.4v8.2a1 1 0 0 0-1-1H3V3.2Z" />
    <path d="M13 3.2H8.9c-.8 0-1.4.6-1.4 1.4v8.2a1 1 0 0 1 1-1H13V3.2Z" />
  </Base>
);

export const IconArchive = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="2.4" y="3" width="11.2" height="2.6" rx="0.7" />
    <path d="M3.4 5.6h9.2v6.8a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1V5.6Z" />
    <path d="M6.6 8.3h2.8" />
  </Base>
);

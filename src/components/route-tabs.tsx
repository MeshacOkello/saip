"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RouteTabs({
  items,
  label,
}: {
  items: { href: string; label: string; includes?: string }[];
  label: string;
}) {
  const pathname = usePathname();
  const active =
    items.find((item) => item.href === pathname) ??
    items.find((item) => item.includes && pathname.startsWith(item.includes));

  return (
    <nav className="segmented" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

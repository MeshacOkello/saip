"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconClose,
  IconHome,
  IconBell,
  IconArchive,
  IconBook,
  IconMenu,
  IconLogOut,
  IconMoney,
  IconNotes,
  IconShield,
  IconUsers,
} from "@/components/icons";
import { Avatar } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  /** What the phone tab bar calls it, when the full label is too long. */
  short?: string;
  badge?: number;
};

/** Real work waiting on this person. Nothing here is invented: every line is a
 *  record they can open. */
export type Attention = {
  unread: number;
  unseen: number;
  notifications: { id: string; title: string; href: string; read: boolean }[];
  overdue: { id: string; title: string }[];
  offers: { id: string; from: string }[];
};

const ICONS = {
  home: IconHome,
  calendar: IconCalendar,
  check: IconCheck,
  notes: IconNotes,
  chat: IconChat,
  bell: IconBell,
  money: IconMoney,
  users: IconUsers,
  book: IconBook,
  archive: IconArchive,
  shield: IconShield,
} as const;

/** What a phone gets along the bottom; everything else lives in the drawer. */
const TAB_BAR = ["/dashboard", "/messages", "/events", "/tasks"];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <nav aria-label="Board navigation" className="space-y-6">
      {Object.entries(groups).map(([group, groupItems]) => (
        <div key={group}>
          <p className="nav-label">{group}</p>
          <div className="space-y-0.5">
            {groupItems.map((item) => {
              const Icon = ICONS[item.icon as keyof typeof ICONS] ?? IconHome;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className="nav-link"
                >
                  <Icon />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="nav-badge">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  items,
  name,
  subtitle,
  logo,
  attention,
  children,
}: {
  items: NavItem[];
  name: string;
  subtitle: string;
  logo: string | null;
  attention: Attention;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const attentionMenu = useRef<HTMLDetailsElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  const attentionCount = attention.unseen + attention.overdue.length;

  // Close the header menus when the route changes, and when a click lands outside.
  useEffect(() => {
    attentionMenu.current?.removeAttribute("open");
    accountMenu.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      for (const menu of [attentionMenu.current, accountMenu.current]) {
        if (menu?.open && !menu.contains(event.target as Node)) {
          menu.removeAttribute("open");
        }
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      attentionMenu.current?.removeAttribute("open");
      accountMenu.current?.removeAttribute("open");
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      const { error } = await authClient.signOut();
      if (error) throw error;
      router.push("/sign-in");
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  const brand = (
    <Link
      href="/dashboard"
      onClick={() => drawer.current?.close()}
      className="rail-brand"
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width="64" height="32" />
      ) : null}
      <span>
        SAIP{" "}
        <span className="block text-[11px] font-normal tracking-wide text-rail-muted">
          Board workspace
        </span>
      </span>
    </Link>
  );

  const identity = (
    <div className="rail-identity">
      <Avatar name={name} size={35} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-rail-muted" title={subtitle}>
          {subtitle}
        </p>
        {signOutError ? (
          <p role="alert" className="mt-1 text-xs text-white">
            Couldn’t sign out. Try again.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        aria-label="Sign out"
        title="Sign out"
        className="rail-button"
      >
        {signingOut ? "…" : <IconLogOut />}
      </button>
    </div>
  );

  const current = items.find((item) => isActive(pathname, item.href));

  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="app-rail hidden lg:flex">
        {brand}
        <div className="rail-navigation">
          <Nav items={items} pathname={pathname} />
        </div>
        {identity}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="app-bar">
          <button
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls="board-menu"
            onClick={() => drawer.current?.showModal()}
            className="bar-menu lg:hidden"
          >
            <IconMenu />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="truncate font-semibold text-ink">
              {current?.label ?? "SAIP Board"}
            </span>
          </div>
          <form action="/messages" className="hidden sm:block">
            <input
              type="search"
              name="q"
              aria-label="Search messages"
              placeholder="Search messages"
              className="w-44 rounded-md bg-surface-2 px-3 py-2 text-sm lg:w-56"
            />
          </form>

          <details className="menu" ref={attentionMenu}>
            <summary
              className="bar-icon"
              aria-label={
                attentionCount > 0
                  ? `${attentionCount} things need you`
                  : "Nothing needs you"
              }
            >
              <IconBell />
              {attentionCount > 0 ? (
                <span className="bar-dot">{attentionCount}</span>
              ) : null}
            </summary>
            <div className="menu-panel">
              <p className="menu-heading">Needs you</p>
              {attentionCount === 0 ? (
                <p className="menu-note">
                  Nothing is waiting. Messages, mentions, tasks handed to you and
                  movement on your reimbursements show up here.
                </p>
              ) : (
                <ul className="attention-list">
                  {attention.notifications.map((alert) => (
                    <li key={alert.id}>
                      <Link href={alert.href}>
                        <span className="attention-kind">
                          {alert.read ? "Read" : "New"}
                        </span>
                        {alert.title}
                      </Link>
                    </li>
                  ))}
                  {attention.overdue.map((task) => (
                    <li key={task.id}>
                      <Link href={`/tasks/${task.id}`}>
                        <span className="attention-kind">Overdue</span>
                        {task.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="menu-divider" />
              <Link href="/notifications" className="menu-item">
                All notifications
              </Link>
            </div>
          </details>

          <details className="menu" ref={accountMenu}>
            <summary className="bar-avatar" aria-label="Account">
              <Avatar name={name} size={30} />
            </summary>
            <div className="menu-panel">
              <p className="account-name">{name}</p>
              <p className="account-role">{subtitle}</p>
              <div className="menu-divider" />
              <Link href="/board" className="menu-item">
                Board directory
              </Link>
              <Link href="/tasks" className="menu-item">
                My tasks
              </Link>
              <div className="menu-divider" />
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="menu-item is-danger"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
              {signOutError ? (
                <p role="alert" className="menu-note mt-2">
                  Couldn’t sign out. Try again.
                </p>
              ) : null}
            </div>
          </details>
        </header>
        <dialog
          ref={drawer}
          id="board-menu"
          aria-label="Board menu"
          className="app-rail app-drawer"
          onClick={(event) => {
            if (
              event.target === event.currentTarget &&
              event.clientX >= event.currentTarget.getBoundingClientRect().right
            )
              event.currentTarget.close();
          }}
        >
          <div className="flex items-center justify-between pr-3">
            {brand}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => drawer.current?.close()}
              className="rail-button"
            >
              <IconClose />
            </button>
          </div>
          <div className="rail-navigation">
            <Nav
              items={items}
              pathname={pathname}
              onNavigate={() => drawer.current?.close()}
            />
          </div>
          {identity}
        </dialog>
        <main id="main-content" tabIndex={-1} className="app-content">
          {children}
        </main>

        <nav className="tab-bar lg:hidden" aria-label="Main sections">
          {items
            .filter((item) => TAB_BAR.includes(item.href))
            .sort(
              (a, b) => TAB_BAR.indexOf(a.href) - TAB_BAR.indexOf(b.href),
            )
            .map((item) => {
              const Icon = ICONS[item.icon as keyof typeof ICONS] ?? IconHome;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="tab-item"
                >
                  <span className="tab-icon">
                    <Icon />
                    {item.badge ? <span className="tab-dot" /> : null}
                  </span>
                  {item.short ?? item.label}
                </Link>
              );
            })}
          <button
            type="button"
            className="tab-item"
            aria-haspopup="dialog"
            aria-controls="board-menu"
            onClick={() => drawer.current?.showModal()}
          >
            <span className="tab-icon">
              <IconMenu />
            </span>
            More
          </button>
        </nav>
      </div>
    </div>
  );
}

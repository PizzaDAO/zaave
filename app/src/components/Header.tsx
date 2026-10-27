"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Calculator" },
  { href: "/stake", label: "Stake" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/redeem", label: "Redeem" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          <span aria-hidden>🍕</span> Za<span className="text-tomato">ave</span>
        </Link>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
      </div>
      <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium ${
                active ? "bg-tomato text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

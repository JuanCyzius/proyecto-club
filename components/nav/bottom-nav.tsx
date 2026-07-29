"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Store, Play, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/club", label: "Club", icon: Home },
  { href: "/squad", label: "Plantilla", icon: Users },
  { href: "/play", label: "Jugar", icon: Play, primary: true },
  { href: "/market", label: "Mercado", icon: Store },
  { href: "/leagues", label: "Ligas", icon: Trophy },
];

export function BottomNav() {
  const pathname = usePathname();
  const activeIndex = items.findIndex(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/")
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/92 backdrop-blur-xl pb-safe">
      <div className="relative mx-auto flex max-w-app items-stretch">
        {/* Indicador de sección activa */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="absolute top-0 h-0.5 rounded-full bg-turf"
            style={{
              width: `calc(100% / ${items.length})`,
              transform: `translate3d(calc(${activeIndex} * 100%), 0, 0)`,
              transition: "transform 280ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        )}

        {items.map(({ href, label, icon: Icon, primary }, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex flex-1 flex-col items-center gap-0.5 py-2.5",
                "text-[10px] font-semibold transition-colors duration-150",
                active ? "text-turf" : "text-muted hover:text-text"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-200 ease-spring",
                  active && "scale-110",
                  primary && !active && "text-text"
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

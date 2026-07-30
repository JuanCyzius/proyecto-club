"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Users, Store, Play, UserRound, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { navCounts } from "@/app/(game)/online/actions";

const items = [
  { href: "/club", label: "Club", icon: Home },
  { href: "/squad", label: "Plantilla", icon: Users },
  { href: "/play", label: "Jugar", icon: Play, invites: true },
  { href: "/market", label: "Mercado", icon: Store },
  { href: "/sbc", label: "SBC", icon: ClipboardCheck },
  { href: "/online", label: "En línea", icon: UserRound, presence: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const [online, setOnline] = useState<number | null>(null);
  const [invites, setInvites] = useState(0);
  const [bump, setBump] = useState(false);

  // El layout no se desmonta al navegar, así que este intervalo vive una
  // sola vez para toda la sesión. Late cada 90 s y solo con la pestaña
  // visible: registra presencia y trae ambos conteos en la misma llamada.
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { online: n, invites: inv } = await navCounts();
        if (!alive) return;
        setInvites(inv);
        setOnline((prev) => {
          if (prev !== null && n !== prev) {
            setBump(true);
            setTimeout(() => setBump(false), 400);
          }
          return n;
        });
      } catch {
        // La presencia es cosmética: si falla, no molestamos al usuario.
      }
    };

    tick();
    const id = setInterval(tick, 90_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const activeIndex = items.findIndex(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/")
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/92 backdrop-blur-xl pb-safe">
      <div className="relative mx-auto flex max-w-app items-stretch">
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

        {items.map(({ href, label, icon: Icon, presence, invites: showInvites }, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex flex-1 flex-col items-center gap-0.5 py-2.5",
                "text-[10px] font-semibold transition-colors duration-150",
                active ? "text-turf" : "text-muted hover:text-text"
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-200 ease-spring",
                  active && "scale-110"
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />

                {/* Cuántos están jugando ahora */}
                {presence && online !== null && online > 0 && (
                  <span
                    className={cn(
                      "absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                      "bg-turf text-[9px] font-extrabold tabular-nums text-turf-ink",
                      "ring-2 ring-surface",
                      bump && "animate-pop"
                    )}
                    aria-label={`${online} en línea`}
                  >
                    {online}
                  </span>
                )}

                {/* Invitaciones pendientes: retos 1v1 y duelos dirigidos */}
                {showInvites && invites > 0 && (
                  <span
                    className={cn(
                      "absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                      "bg-danger text-[9px] font-extrabold tabular-nums text-white",
                      "ring-2 ring-surface"
                    )}
                    aria-label={`${invites} invitaciones pendientes`}
                  >
                    {invites}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

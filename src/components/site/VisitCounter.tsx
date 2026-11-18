import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

const KEY = "seeds-visit";

function visitId(): { id: string; isNew: boolean } {
  const existing = sessionStorage.getItem(KEY);
  if (existing) return { id: existing, isNew: false };
  const id = crypto.randomUUID();
  sessionStorage.setItem(KEY, id);
  return { id, isNew: true };
}

/** Sends one anonymous page count to Seeds' own counter (public totals on /stats). */
export function VisitCounter() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    try {
      if (window.top !== window.self) return; // editor preview frame
      const { id, isNew } = visitId();
      void fetch("/api/public/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname, referrer: isNew ? document.referrer || null : null, sessionId: id, isNewSession: isNew }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* counting must never break a page */
    }
  }, [pathname]);
  return null;
}

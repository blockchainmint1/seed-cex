import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { thirdPartyScriptsAllowed } from "@/lib/third-party-scripts";

const SCRIPTS: Array<{ src: string; attrs: Record<string, string>; defer?: boolean }> = [
  { src: "https://honest.money/hm.js", attrs: {} },
  {
    src: "https://help.honest.money/api/public/widget.js",
    defer: true,
    attrs: { "data-ecosystem": "seeds", "data-brand-name": "Seeds", "data-context": "Seeds", "data-theme": "auto" },
  },
];

/**
 * Loads Honest.Money's referral script and help widget on public info pages only.
 * Once they have run, moving to a private page reloads it fresh so they never see
 * a signed-in Account, Admin, trading or wallet screen.
 */
export function HonestMoneyScripts() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const loaded = useRef(false);

  useEffect(() => {
    if (thirdPartyScriptsAllowed(pathname)) {
      if (loaded.current) return;
      loaded.current = true;
      for (const s of SCRIPTS) {
        if (document.querySelector(`script[src="${s.src}"]`)) continue;
        const el = document.createElement("script");
        el.src = s.src;
        if (s.defer) el.defer = true; else el.async = true;
        for (const [k, v] of Object.entries(s.attrs)) el.setAttribute(k, v);
        document.body.appendChild(el);
      }
    } else if (loaded.current) {
      window.location.replace(router.state.location.href);
    }
  }, [pathname, router]);

  return null;
}

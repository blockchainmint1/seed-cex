import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MessageSquareWarning } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getQaState } from "@/lib/qa/qa.functions";
import { ReportDialog } from "./ReportDialog";

const TUCK_KEY = "seeds-qa-tucked";

/**
 * Floating "Feedback" button for the prelaunch test: only signed-in beta testers and admins
 * see it, and only while the QA switch in Admin → Bugs is on (the server decides both).
 * It can be tucked into a small tab at the edge so it never covers a button on a phone.
 */
export function FeedbackButton() {
  const { user } = useSession();
  const fetchState = useServerFn(getQaState);
  const state = useQuery({ queryKey: ["qa-state", user?.id ?? null], queryFn: () => fetchState(), enabled: !!user, staleTime: 300_000, retry: false });
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    try { setTucked(localStorage.getItem(TUCK_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const tuck = (v: boolean) => {
    setTucked(v);
    try { localStorage.setItem(TUCK_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };

  if (!user || !state.data?.tester || !state.data.enabled) return null;
  if (pathname.startsWith("/auth") || pathname.startsWith("/sso")) return null;

  return (
    <div data-qa-ui>
      {tucked ? (
        <button
          type="button"
          onClick={() => tuck(false)}
          aria-label="Show the Feedback button"
          className="fixed right-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 rounded-l-md border border-r-0 border-border bg-surface px-1 py-3 text-muted-foreground shadow-md hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : (
        <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 flex items-center gap-1 sm:right-5">
          <button
            type="button"
            onClick={() => tuck(true)}
            aria-label="Tuck the Feedback button away"
            className="rounded-full border border-border bg-surface p-1.5 text-muted-foreground shadow-md hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-action-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            <MessageSquareWarning className="h-4 w-4" />
            <span>Feedback</span>
          </button>
        </div>
      )}
      <ReportDialog open={open} onOpenChange={setOpen} recordingsEnabled={state.data.recordingsEnabled} />
    </div>
  );
}

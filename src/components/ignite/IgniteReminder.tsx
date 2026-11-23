import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flame, X } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { getIgniteSeats, getMyIgnite } from "@/lib/ignite.functions";

const DISMISS_KEY = "seeds-ignite-reminder-dismissed";

/**
 * Safety net for members who signed in to register for Ignite but landed on
 * their Profile instead (another browser, closed popup, etc.). Linking a
 * wallet does not reserve a seat, so say so plainly and link to /ignite.
 */
export function IgniteReminder() {
  const { user } = useSession();
  const fetchMine = useServerFn(getMyIgnite);
  const fetchSeats = useServerFn(getIgniteSeats);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);
  const mine = useQuery({ queryKey: ["ignite", user?.id], queryFn: () => fetchMine(), enabled: !!user });
  const seats = useQuery({ queryKey: ["ignite-seats"], queryFn: () => fetchSeats(), enabled: !!user });

  if (dismissed || !mine.data || !seats.data) return null;
  const next = seats.data.next;
  const reg = mine.data.registration;
  if (reg?.status === "confirmed" || reg?.status === "canceled") return null;
  const started = !!reg;
  if (!started && !next) return null;

  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-md border border-primary/50 bg-primary/10 p-4">
      <Flame aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">
          {started ? "Your To the Moon seat isn't reserved yet" : "Here for the To the Moon class?"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {started
            ? "You started registering but haven't finished paying. Linking a wallet doesn't reserve a seat."
            : `Signing in and linking a wallet doesn't reserve a seat. The next class, ${next?.name}, runs ${next?.dates}; ${seats.data.seatsLeft} of ${seats.data.capacity} seats left.`}
        </p>
        <Link to={mine.data.regClass ? "/to-the-moon/$slug" : next ? "/to-the-moon/$slug" : "/to-the-moon"} params={{ slug: mine.data.regClass?.slug ?? next?.slug ?? "" }} className="mt-3 inline-flex rounded-md bg-action px-4 py-2 text-sm font-semibold text-action-foreground">
          {started ? "Finish registration" : "Reserve your seat"}
        </Link>
      </div>
      <button
        type="button"
        aria-label="Hide this reminder"
        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

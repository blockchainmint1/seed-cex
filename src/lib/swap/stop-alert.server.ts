/**
 * One alert when a swap dies: the member (Telegram, settlement alerts) and every admin's verified chat.
 * Best-effort, never throws. Callers skip steps of a bigger swap (the parent alerts once).
 */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const STOPPED = new Set(["failed", "kept_mid", "kept_usdc", "unknown"]);

export async function alertSwapStopped(i: { userId: string; id: string; what: string; was: string; now: string; why: string | null | undefined; tellMember?: boolean }) {
  const why = i.why || "Seeds stopped this swap.";
  if (i.tellMember !== false) {
    try {
      const { notifyUser } = await import("@/lib/telegram.server");
      await notifyUser(i.userId, "notify_settlement", `Your ${i.what} swap stopped. ${why}`);
    } catch (e) { console.error("swap stop alert (member) failed", e); }
  }
  try {
    const { alertAdmins } = await import("@/lib/alerts.server");
    await alertAdmins(`⚠️ <b>Seeds</b> swap stopped\n${esc(i.what)} (${esc(i.was)} → ${esc(i.now)})\nSwap ${i.id.slice(0, 8)} · member ${i.userId.slice(0, 8)}\n${esc(why)}`);
  } catch (e) { console.error("swap stop alert (admins) failed", e); }
}

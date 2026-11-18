/**
 * Pure rules for the member's wallet-link history (Account → Security).
 * Built from the hme_links rows themselves, which are never deleted: each row is
 * one link; its revoke (or replacement by "Add new coins") closes it.
 */
import { linkCoins } from "./hme-link-rules";

export type LinkRow = {
  id: string;
  mode: string;
  account: number;
  paths: string[];
  identity_address: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type LinkEventKind = "linked" | "updated" | "revoked_seeds" | "revoked_wallet" | "replaced" | "revoked";

export type LinkEvent = {
  id: string;
  at: string;
  kind: LinkEventKind;
  account: number;
  mode: "access" | "approve";
  coins: string[];
  /** Coins gained / lost compared with the link this one replaced ("updated" only). */
  added: string[];
  removed: string[];
  /** Mode before an update, when it changed. */
  modeBefore: "access" | "approve" | null;
  wallet: string;
  /** This event opened the link that is active right now. */
  current: boolean;
};

/** A replaced link and the link that replaced it are written in the same request. */
export const SAME_SUBMIT_MS = 60_000;

const asMode = (m: string): "access" | "approve" => (m === "approve" ? "approve" : "access");
const t = (s: string | null) => (s ? new Date(s).getTime() : NaN);

export function buildLinkHistory(rows: LinkRow[]): LinkEvent[] {
  const sorted = [...rows].sort((a, b) => t(a.created_at) - t(b.created_at));
  const events: LinkEvent[] = [];
  const usedReplaced = new Set<string>();

  for (const row of sorted) {
    const coins = linkCoins({ account: row.account, paths: row.paths });
    // Did this link replace one from the same wallet, retired in the same submit ("Add new coins" / re-link while linked)?
    const prev = sorted.find(
      (p) =>
        p.id !== row.id &&
        !usedReplaced.has(p.id) &&
        p.revoked_by === "replaced" &&
        p.identity_address === row.identity_address &&
        p.revoked_at != null &&
        Math.abs(t(p.revoked_at) - t(row.created_at)) <= SAME_SUBMIT_MS &&
        t(p.created_at) <= t(row.created_at),
    );
    const base = {
      account: row.account,
      mode: asMode(row.mode),
      coins,
      wallet: row.identity_address,
    };
    if (prev) {
      usedReplaced.add(prev.id);
      const before = linkCoins({ account: prev.account, paths: prev.paths });
      events.push({
        ...base,
        id: `${row.id}:open`,
        at: row.created_at,
        kind: "updated",
        added: coins.filter((c) => !before.includes(c)),
        removed: before.filter((c) => !coins.includes(c)),
        modeBefore: asMode(prev.mode) !== asMode(row.mode) ? asMode(prev.mode) : null,
        current: row.status === "active",
      });
    } else {
      events.push({ ...base, id: `${row.id}:open`, at: row.created_at, kind: "linked", added: [], removed: [], modeBefore: null, current: row.status === "active" });
    }
  }

  for (const row of sorted) {
    if (row.status !== "revoked" || usedReplaced.has(row.id)) continue;
    const kind: LinkEventKind =
      row.revoked_by === "seeds" ? "revoked_seeds" : row.revoked_by === "wallet" ? "revoked_wallet" : row.revoked_by === "replaced" ? "replaced" : "revoked";
    events.push({
      id: `${row.id}:close`,
      at: row.revoked_at ?? row.created_at,
      kind,
      account: row.account,
      mode: asMode(row.mode),
      coins: linkCoins({ account: row.account, paths: row.paths }),
      added: [],
      removed: [],
      modeBefore: null,
      wallet: row.identity_address,
      current: false,
    });
  }

  // Newest first; for the same instant, a close sorts after the open it led to.
  return events.sort((a, b) => t(b.at) - t(a.at) || (a.id.endsWith(":open") ? -1 : 1));
}

export function linkEventTitle(e: LinkEvent): string {
  switch (e.kind) {
    case "linked": return "Linked";
    case "updated": return e.added.length ? "Updated: new coins added" : "Updated";
    case "revoked_seeds": return "Revoked on Seeds";
    case "revoked_wallet": return "Revoked in HME Wallet";
    case "replaced": return "Replaced by a new link";
    default: return "Revoked";
  }
}

export const shortWallet = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

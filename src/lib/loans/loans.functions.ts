import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminUnlocked, hasTesterRole, pilotTesterAccess } from "@/lib/admin-guard";
import {
  fitsOffer, LIQUIDATION_LTV, LOAN_COINS, MARGIN_CALL_LTV, partiesFor, PROPOSAL_TTL_HOURS,
  proposalActionProblem, SEEDS_DEFAULT_FEE_PCT, termsProblem, type LoanTerms, type ProposalStatus,
} from "./rules";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const engine = () => import("./loans.server");
const TESTERS_ONLY = "Seeds Lend is in a private beta: real loans are open to beta testers for now.";

const termsSchema = z.object({
  coin: z.enum(LOAN_COINS),
  amount: z.number().positive().max(1_000_000),
  ratePct: z.number().min(0).max(100),
  days: z.number().int().min(1).max(1000),
  startLtvPct: z.number().min(1).max(100),
});
const toTerms = (t: z.infer<typeof termsSchema>): LoanTerms => ({ ...t, collateralCoin: "TXC" });

async function namesFor(ids: string[]) {
  const db = await admin();
  const uniq = [...new Set(ids.filter(Boolean))];
  const out: Record<string, string> = {};
  if (!uniq.length) return out;
  const [{ data: p2p }, { data: prof }] = await Promise.all([
    db.from("p2p_profiles").select("user_id, handle").in("user_id", uniq),
    db.from("profiles").select("id, display_name").in("id", uniq),
  ]);
  for (const id of uniq) out[id] = p2p?.find((p) => p.user_id === id)?.handle ?? prof?.find((p) => p.id === id)?.display_name ?? "member";
  return out;
}

/** Closed loans per member: how many repaid, how many went bad. */
async function trackRecords(ids: string[]) {
  const db = await admin();
  const out: Record<string, { repaid: number; bad: number; lent: number }> = {};
  for (const id of ids) out[id] = { repaid: 0, bad: 0, lent: 0 };
  if (!ids.length) return out;
  const { data } = await db.from("loans").select("borrower_id, lender_id, outcome").eq("status", "closed").or(`borrower_id.in.(${ids.join(",")}),lender_id.in.(${ids.join(",")})`).limit(2000);
  for (const l of data ?? []) {
    if (out[l.borrower_id] && l.outcome === "repaid") out[l.borrower_id]!.repaid++;
    if (out[l.borrower_id] && (l.outcome === "liquidated" || l.outcome === "defaulted")) out[l.borrower_id]!.bad++;
    if (out[l.lender_id] && l.outcome && l.outcome !== "cancelled") out[l.lender_id]!.lent++;
  }
  return out;
}

const num = (v: unknown) => Number(v);
function offerOut(o: Record<string, unknown>) {
  return {
    id: o.id as string, userId: o.user_id as string, side: o.side as "lend" | "borrow", coin: o.coin as string,
    collateralCoin: o.collateral_coin as string, minAmount: num(o.min_amount), maxAmount: num(o.max_amount),
    ratePct: num(o.rate_pct), days: o.days as number, maxLtvPct: num(o.max_ltv_pct), note: (o.note as string | null) ?? null,
    status: o.status as string, createdAt: o.created_at as string,
  };
}
function proposalOut(p: Record<string, unknown>) {
  return {
    id: p.id as string, offerId: p.offer_id as string, parentId: (p.parent_id as string | null) ?? null,
    borrowerId: p.borrower_id as string, lenderId: p.lender_id as string, proposerId: p.proposer_id as string,
    coin: p.coin as string, amount: num(p.amount), ratePct: num(p.rate_pct), days: p.days as number, startLtvPct: num(p.start_ltv_pct),
    note: (p.note as string | null) ?? null, round: p.round as number, status: p.status as ProposalStatus,
    createdAt: p.created_at as string, expiresAt: p.expires_at as string,
  };
}

/* --------------------------------- public --------------------------------- */

export const getLoanMarket = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("loan_offers").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200);
  const offers = (data ?? []).map((o) => offerOut(o as Record<string, unknown>));
  const ids = [...new Set(offers.map((o) => o.userId))];
  const [names, records, { collateralPrice }] = await Promise.all([namesFor(ids), trackRecords(ids), engine()]);
  const price = await collateralPrice("TXC").catch(() => null);
  return {
    offers: offers.map((o) => ({ ...o, name: names[o.userId] ?? "member", record: records[o.userId] ?? { repaid: 0, bad: 0, lent: 0 } })),
    txcPrice: price,
    rules: { marginCallLtv: MARGIN_CALL_LTV, liquidationLtv: LIQUIDATION_LTV, feePct: SEEDS_DEFAULT_FEE_PCT },
  };
});

/* ---------------------------------- desk ---------------------------------- */

export const getLoanDesk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const me = context.userId;
    const [{ data: offers }, { data: props }, { data: loans }, tester] = await Promise.all([
      db.from("loan_offers").select("*").eq("user_id", me).neq("status", "closed").order("created_at", { ascending: false }).limit(50),
      db.from("loan_proposals").select("*").or(`borrower_id.eq.${me},lender_id.eq.${me}`).order("created_at", { ascending: false }).limit(80),
      db.from("loans").select("id, ref, borrower_id, lender_id, coin, amount, owed, days, rate_pct, collateral_amount, status, outcome, due_at, last_ltv_pct, created_at")
        .or(`borrower_id.eq.${me},lender_id.eq.${me}`).order("created_at", { ascending: false }).limit(80),
      pilotTesterAccess(context as never),
    ]);
    const proposals = (props ?? []).map((p) => proposalOut(p as Record<string, unknown>));
    const names = await namesFor([...proposals.flatMap((p) => [p.borrowerId, p.lenderId]), ...(loans ?? []).flatMap((l) => [l.borrower_id, l.lender_id])]);
    return {
      me, tester,
      offers: (offers ?? []).map((o) => offerOut(o as Record<string, unknown>)),
      proposals: proposals.map((p) => ({ ...p, borrowerName: names[p.borrowerId] ?? "member", lenderName: names[p.lenderId] ?? "member" })),
      loans: (loans ?? []).map((l) => ({
        id: l.id, ref: l.ref, role: l.borrower_id === me ? ("borrower" as const) : ("lender" as const),
        other: names[l.borrower_id === me ? l.lender_id : l.borrower_id] ?? "member",
        coin: l.coin, amount: num(l.amount), owed: num(l.owed), days: l.days, ratePct: num(l.rate_pct), collateral: num(l.collateral_amount),
        status: l.status, outcome: l.outcome, dueAt: l.due_at, ltv: l.last_ltv_pct === null ? null : num(l.last_ltv_pct), createdAt: l.created_at,
      })),
    };
  });

export const createLoanOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      side: z.enum(["lend", "borrow"]),
      coin: z.enum(LOAN_COINS),
      minAmount: z.number().positive(),
      maxAmount: z.number().positive(),
      ratePct: z.number().min(0),
      days: z.number().int(),
      maxLtvPct: z.number(),
      note: z.string().trim().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.maxAmount < data.minAmount) throw new Error("The most can't be less than the least");
    for (const amount of [data.minAmount, data.maxAmount]) {
      const p = termsProblem({ coin: data.coin, collateralCoin: "TXC", amount, ratePct: data.ratePct, days: data.days, startLtvPct: data.maxLtvPct });
      if (p) throw new Error(p);
    }
    const db = await admin();
    const { count } = await db.from("loan_offers").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "open");
    if ((count ?? 0) >= 10) throw new Error("You can have up to 10 open offers");
    const { data: row, error } = await db.from("loan_offers").insert({
      user_id: context.userId, side: data.side, coin: data.coin, min_amount: data.minAmount, max_amount: data.maxAmount,
      rate_pct: data.ratePct, days: data.days, max_ltv_pct: data.maxLtvPct, note: data.note || null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const setLoanOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), status: z.enum(["open", "paused", "closed"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db.from("loan_offers").update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId).neq("status", "closed").select("id").maybeSingle();
    if (!row) throw new Error("Offer not found");
    return { ok: true };
  });

/* ------------------------------ negotiation ------------------------------- */

export const proposeLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ offerId: z.string().uuid(), terms: termsSchema, note: z.string().trim().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: o } = await db.from("loan_offers").select("*").eq("id", data.offerId).eq("status", "open").maybeSingle();
    if (!o) throw new Error("This offer isn't open any more");
    const offer = offerOut(o as Record<string, unknown>);
    const terms = toTerms(data.terms);
    const problem = termsProblem(terms) ?? fitsOffer(offer, terms);
    if (problem) throw new Error(problem);
    const parties = partiesFor({ side: offer.side, userId: offer.userId }, context.userId);
    const { count } = await db.from("loan_proposals").select("id", { count: "exact", head: true })
      .eq("offer_id", offer.id).eq("proposer_id", context.userId).eq("status", "pending");
    if ((count ?? 0) > 0) throw new Error("You already have an offer waiting on this one — withdraw it or wait for an answer");
    const { data: row, error } = await db.from("loan_proposals").insert({
      offer_id: offer.id, borrower_id: parties.borrowerId, lender_id: parties.lenderId, proposer_id: context.userId,
      coin: terms.coin, amount: terms.amount, rate_pct: terms.ratePct, days: terms.days, start_ltv_pct: terms.startLtvPct,
      note: data.note || null, round: 1, expires_at: new Date(Date.now() + PROPOSAL_TTL_HOURS * 3_600_000).toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(offer.userId, "notify_p2p", `🌱 <b>Seeds Lend</b>\nSomeone answered your ${offer.side === "lend" ? "lending offer" : "borrowing request"}: ${terms.amount} ${terms.coin} for ${terms.days} days at ${terms.ratePct}%.\n\n<a href="https://seeds.honest.money/loans">Open Seeds Lend</a>`).catch(() => {});
    return { id: row.id as string };
  });

export const answerProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["accept", "counter", "decline", "withdraw"]),
      terms: termsSchema.optional(),
      note: z.string().trim().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: raw } = await db.from("loan_proposals").select("*").eq("id", data.id).maybeSingle();
    if (!raw) throw new Error("Not found");
    const p = proposalOut(raw as Record<string, unknown>);
    const problem = proposalActionProblem({ ...p, expiresAtMs: Date.parse(p.expiresAt) }, context.userId, data.action, Date.now());
    if (problem) throw new Error(problem);
    const now = new Date().toISOString();
    const other = context.userId === p.borrowerId ? p.lenderId : p.borrowerId;
    const { notifyUser } = await import("@/lib/telegram.server");
    const ping = (text: string) => notifyUser(other, "notify_p2p", `🌱 <b>Seeds Lend</b>\n${text}\n\n<a href="https://seeds.honest.money/loans">Open Seeds Lend</a>`).catch(() => {});

    if (data.action === "decline" || data.action === "withdraw") {
      await db.from("loan_proposals").update({ status: data.action === "decline" ? "declined" : "withdrawn", decided_at: now }).eq("id", p.id).eq("status", "pending");
      if (data.action === "decline") await ping(`Your loan offer of ${p.amount} ${p.coin} was declined.`);
      return { ok: true as const };
    }
    if (data.action === "counter") {
      if (!data.terms) throw new Error("Counter-offers need terms");
      const { data: o } = await db.from("loan_offers").select("*").eq("id", p.offerId).maybeSingle();
      const terms = toTerms(data.terms);
      const tp = termsProblem(terms) ?? (o ? fitsOffer({ ...offerOut(o as Record<string, unknown>), minAmount: 0, maxAmount: Infinity }, terms) : "Offer gone");
      if (tp) throw new Error(tp);
      const { data: closed } = await db.from("loan_proposals").update({ status: "countered", decided_at: now }).eq("id", p.id).eq("status", "pending").select("id").maybeSingle();
      if (!closed) throw new Error("This offer was just answered");
      const { data: row, error } = await db.from("loan_proposals").insert({
        offer_id: p.offerId, parent_id: p.id, borrower_id: p.borrowerId, lender_id: p.lenderId, proposer_id: context.userId,
        coin: terms.coin, amount: terms.amount, rate_pct: terms.ratePct, days: terms.days, start_ltv_pct: terms.startLtvPct,
        note: data.note || null, round: p.round + 1, expires_at: new Date(Date.now() + PROPOSAL_TTL_HOURS * 3_600_000).toISOString(),
      }).select("id").single();
      if (error) throw new Error(error.message);
      await ping(`New counter-offer: ${terms.amount} ${terms.coin} for ${terms.days} days at ${terms.ratePct}%, ${terms.startLtvPct}% loan-to-value.`);
      return { ok: true as const, id: row.id as string };
    }
    // accept → a real loan with its own lockbox
    const [meTester, otherTester] = await Promise.all([pilotTesterAccess(context as never), hasTesterRole({ supabase: db as never, userId: other })]);
    if (!meTester || !otherTester) throw new Error(TESTERS_ONLY);
    const { data: claimed } = await db.from("loan_proposals").update({ status: "accepted", decided_at: now }).eq("id", p.id).eq("status", "pending").select("*").maybeSingle();
    if (!claimed) throw new Error("This offer was just answered");
    try {
      const { createLoan } = await engine();
      const loan = await createLoan(claimed as never);
      return { ok: true as const, loanId: loan.id };
    } catch (e) {
      await db.from("loan_proposals").update({ status: "pending", decided_at: null }).eq("id", p.id).eq("status", "accepted");
      throw e;
    }
  });

/* ---------------------------------- loan ---------------------------------- */

async function partyLoan(context: { userId: string; claims?: unknown; supabase: unknown }, id: string) {
  const { loadLoan } = await engine();
  const l = await loadLoan(id);
  if (!l) throw new Error("Loan not found");
  const role = l.borrower_id === context.userId ? "borrower" : l.lender_id === context.userId ? "lender" : null;
  if (!role && !(await adminUnlocked(context as never))) throw new Error("Loan not found");
  return { l, role: role ?? ("viewer" as const) };
}

export const getLoan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { l, role } = await partyLoan(context, data.id);
    const db = await admin();
    const [{ data: events }, { data: approvals }, names, tester] = await Promise.all([
      db.from("loan_events").select("kind, body, txid, created_at").eq("loan_id", l.id).order("created_at", { ascending: true }).limit(200),
      db.from("send_approvals").select("purpose, status, amount, asset, expires_at").eq("ref_id", l.id).in("purpose", ["loan_collateral", "loan_funding", "loan_repay"]).in("status", ["pending", "approved"]),
      namesFor([l.borrower_id, l.lender_id]),
      pilotTesterAccess(context as never),
    ]);
    const { escrow_hex: _hex, borrower_pub, lender_pub, seeds_pub, ...rest } = l;
    void _hex;
    return {
      role, tester,
      loan: { ...rest, keys: { borrower: borrower_pub, lender: lender_pub, seeds: seeds_pub } },
      names: { borrower: names[l.borrower_id] ?? "member", lender: names[l.lender_id] ?? "member" },
      events: (events ?? []).map((e) => ({ kind: e.kind, body: e.body, txid: e.txid, at: e.created_at })),
      pending: (approvals ?? []).map((a) => ({ purpose: a.purpose, status: a.status, amount: num(a.amount), asset: a.asset, expiresAt: a.expires_at })),
      rules: { marginCallLtv: MARGIN_CALL_LTV, liquidationLtv: LIQUIDATION_LTV },
    };
  });

export const startLoanSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), kind: z.enum(["loan_collateral", "loan_funding", "loan_repay"]) }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await pilotTesterAccess(context as never))) throw new Error(TESTERS_ONLY);
    const { l, role } = await partyLoan(context, data.id);
    if (role === "viewer") throw new Error("Only the borrower or lender can do this");
    const { requestLoanSend } = await engine();
    const ap = await requestLoanSend(l, data.kind, context.userId);
    return { approvalId: ap.id, expiresAt: ap.expires_at };
  });

export const cancelLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { l, role } = await partyLoan(context, data.id);
    if (role === "viewer") throw new Error("Only the borrower or lender can cancel");
    if (l.status !== "awaiting_collateral" && l.status !== "awaiting_funding") throw new Error("Only a loan that hasn't started can be cancelled");
    if (l.funding_started_at) throw new Error("The loan is already being sent");
    const { escrowPayout, loanEvent, loanAlert } = await engine();
    await loanEvent(l.id, "cancel_requested", `Cancelled by the ${role}.`, context.userId);
    await escrowPayout(l.id, "return", `Cancelled by the ${role}.`);
    await loanAlert(role === "borrower" ? l.lender_id : l.borrower_id, l.id, `Loan ${l.ref} was cancelled by the ${role} before it started.`);
    return { ok: true };
  });

export const refreshLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { l } = await partyLoan(context, data.id);
    const { tickLoan } = await engine();
    await tickLoan(l.id);
    return { ok: true };
  });

/**
 * Template registry: subject line, footer category and sample data for every
 * Seeds email. Pure (no network) so previews and tests can render it.
 */
import * as React from "react";
import { WelcomeEmail, type WelcomeProps } from "./templates/welcome";
import { TradeConfirmationEmail, type TradeConfirmationProps } from "./templates/trade-confirmation";
import { P2pOrderEmail, type P2pOrderProps } from "./templates/p2p-order";
import { AccountChangeEmail, type AccountChangeProps } from "./templates/account-change";
import { WeeklyUpdateEmail, type WeeklyUpdateProps } from "./templates/weekly-update";
import { PeerPayRequestEmail, type PeerPayRequestProps } from "./templates/peer-pay-request";
import { PeerPayPaidEmail, type PeerPayPaidProps } from "./templates/peer-pay-paid";
import { IgniteSeatConfirmedEmail, type IgniteSeatConfirmedProps } from "./templates/ignite-seat-confirmed";
import { LegacyLinkEmail, type LegacyLinkProps } from "./templates/legacy-link";
import { IgniteReminderEmail, type IgniteReminderProps } from "./templates/ignite-reminder";
import { IgniteMessageEmail, type IgniteMessageProps } from "./templates/ignite-message";
import { IgniteInterestEmail, type IgniteInterestProps } from "./templates/ignite-interest";
import { WithdrawalCodeEmail, type WithdrawalCodeProps } from "./templates/withdrawal-code";
import { fmt, usd } from "./components";

export type TemplateProps = {
  welcome: WelcomeProps;
  "trade-confirmation": TradeConfirmationProps;
  "p2p-order": P2pOrderProps;
  "account-change": AccountChangeProps;
  "weekly-update": WeeklyUpdateProps;
  "peer-pay-request": PeerPayRequestProps;
  "peer-pay-paid": PeerPayPaidProps;
  "ignite-seat-confirmed": IgniteSeatConfirmedProps;
  "legacy-link": LegacyLinkProps;
  "ignite-reminder": IgniteReminderProps;
  "ignite-message": IgniteMessageProps;
  "ignite-interest": IgniteInterestProps;
  "withdrawal-code": WithdrawalCodeProps;
};
export type TemplateName = keyof TemplateProps;
/** security = always sent; trades = email_trade_confirmations; weekly = email_weekly_update; welcome = once; receipt = always (payment receipts); invite = to a non-member, sent by direct delivery; ignite = sent by an admin to an Ignite registrant's registration email. */
export type Category = "welcome" | "trades" | "security" | "weekly" | "receipt" | "invite" | "ignite";

type Def<K extends TemplateName> = {
  label: string;
  category: Category;
  subject: (p: TemplateProps[K]) => string;
  render: (p: TemplateProps[K]) => React.ReactElement;
  sample: TemplateProps[K];
};

export const TEMPLATES: { [K in TemplateName]: Def<K> } = {
  "withdrawal-code": {
    label: "Withdrawal code",
    category: "security",
    subject: (p) => `Seeds withdrawal code ${p.code} for ${p.amount} ${p.symbol}`,
    render: (p) => <WithdrawalCodeEmail {...p} />,
    sample: { name: "Alex", code: "482913", amount: "250", symbol: "TSD", network: "TEXITcoin · Omni #39", to: "TKx8sample3Fh9zQyW2m7cR1vB4nD6pLaEo", minutes: 10 },
  },
  welcome: {
    label: "Welcome to Seeds",
    category: "welcome",
    subject: () => "Welcome to Seeds",
    render: (p) => <WelcomeEmail {...p} />,
    sample: { name: "Alex" },
  },
  "trade-confirmation": {
    label: "Trade confirmation",
    category: "trades",
    subject: (p) => `Trade settled: ${p.side === "buy" ? "bought" : "sold"} ${fmt(p.amount)} ${p.baseSymbol} at ${fmt(p.price)} ${p.quoteSymbol}`,
    render: (p) => <TradeConfirmationEmail {...p} />,
    sample: {
      name: "Alex", tradeId: "3f9c2a1e-8b7d-4c11-9e55-0a1b2c3d4e5f", pair: "TXC / TSD", side: "buy",
      amount: 1250, baseSymbol: "TXC", price: 0.0412, quoteSymbol: "TSD", settledAt: "2026-11-17T15:42:00Z", timezone: "America/Chicago",
      legs: [
        { label: "You received", amount: 1250, symbol: "TXC", txid: "9a4c1f0e7b2d3c4e5f60718293a4b5c6d7e8f90112233445566778899aabbccd" },
        { label: "You sent", amount: 51.5, symbol: "TSD", txid: "e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d5e6f708192a3b4c5d6e7f80911" },
      ],
    },
  },
  "p2p-order": {
    label: "P2P order confirmation",
    category: "trades",
    subject: (p) => p.role === "buyer" ? `P2P order open: ${fmt(p.cryptoAmount)} ${p.asset} for ${usd(p.fiatAmount)}` : `New P2P buyer: ${fmt(p.cryptoAmount)} ${p.asset} for ${usd(p.fiatAmount)}`,
    render: (p) => <P2pOrderEmail {...p} />,
    sample: {
      name: "Alex", role: "buyer", tradeId: "7d1e4b2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b", asset: "TSD", cryptoAmount: 250, fiatAmount: 252.5,
      price: 1.01, paymentMethod: "Zelle", counterparty: "lonestar_trades", expiresAt: "2026-11-17T16:30:00Z", timezone: "America/Chicago",
    },
  },
  "account-change": {
    label: "You changed X",
    category: "security",
    subject: (p) => p.headline ?? `You changed your ${p.thing}`,
    render: (p) => <AccountChangeEmail {...p} />,
    sample: {
      name: "Alex", thing: "trading preferences", changes: ["Default market: TXC/TSD → BTC/TSD", "Confirm before every order: on → off"],
      at: "2026-11-17T15:50:00Z", timezone: "America/Chicago",
    },
  },
  "weekly-update": {
    label: "Weekly account update",
    category: "weekly",
    subject: (p) => `Your week on Seeds · ${p.weekLabel}`,
    render: (p) => <WeeklyUpdateEmail {...p} />,
    sample: {
      name: "Alex", weekLabel: "Nov 10 – Nov 16", exchangeTrades: 4, p2pTrades: 1, openOrders: 2,
      volumeByPair: [
        { pair: "TXC / TSD", amount: 3400, baseSymbol: "TXC", quoteTotal: 140.08, quoteSymbol: "TSD" },
        { pair: "BTC / TSD", amount: 0.0125, baseSymbol: "BTC", quoteTotal: 1162.5, quoteSymbol: "TSD" },
      ],
      p2pVolumeUsd: 252.5, pocket: { linked: true, account: 1106, mode: "access" },
      attention: ["One order on BTC/TSD has been open for 6 days."],
      unsubscribeUrl: "https://seeds.honest.money/api/public/email/unsubscribe?t=sample",
    },
  },
  "peer-pay-request": {
    label: "Peer Pay request (to a friend)",
    category: "invite",
    subject: (p) => `${p.registrantName} asked you to pay their To the Moon seat`,
    render: (p) => <PeerPayRequestEmail {...p} />,
    sample: { registrantName: "Alex Rivera", amount: 400, payUrl: "https://seeds.honest.money/pay/sample", expiresAt: "2026-11-24T18:00:00Z" },
  },
  "peer-pay-paid": {
    label: "Peer Pay received",
    category: "receipt",
    subject: (p) => `${p.payerName} paid your To the Moon seat`,
    render: (p) => <PeerPayPaidEmail {...p} />,
    sample: { name: "Alex", payerName: "Jordan Lee", amount: 400, paidAt: "2026-11-18T15:10:00Z", timezone: "America/Chicago" },
  },
  "ignite-seat-confirmed": {
    label: "To the Moon seat confirmed",
    category: "receipt",
    subject: () => "Your To the Moon seat is reserved",
    render: (p) => <IgniteSeatConfirmedEmail {...p} />,
    sample: { name: "Alex", amount: 499, paidBy: null, paidWith: "TSD on TXC", confirmedAt: "2026-11-18T15:10:00Z", timezone: "America/Chicago", referralUrl: "https://seeds.honest.money/invite/alex", className: "Spark", classSlug: "spark", dates: "December 12–13, 2026", time: "1:00–5:00 PM CST", feeUsd: 99, minerDiscountUsd: 0, depositUsd: 400 },
  },
  "legacy-link": {
    label: "Link your older account",
    category: "security",
    subject: () => "Confirm your older Seeds account",
    render: (p) => <LegacyLinkEmail {...p} />,
    sample: { name: "Alex", linkUrl: "https://seeds.honest.money/link-account?token=sample", expiresAt: "2026-11-18T15:40:00Z", timezone: "America/Chicago" },
  },
  "ignite-reminder": {
    label: "To the Moon: finish your registration",
    category: "ignite",
    subject: () => "Finish reserving your To the Moon seat",
    render: (p) => <IgniteReminderEmail {...p} />,
    sample: { name: "Alex", amount: 499, dates: "December 12–13, 2026", time: "1:00–5:00 PM CST", seatsLeft: 42, className: "Spark", classSlug: "spark" },
  },
  "ignite-message": {
    label: "To the Moon: message from Seeds",
    category: "ignite",
    subject: (p) => p.subject,
    render: (p) => <IgniteMessageEmail {...p} />,
    sample: { subject: "Your Zoom link for Monday", paragraphs: ["Hi Alex,", "Here's everything you need for the first session.\nSee you Monday."] },
  },
  "ignite-interest": {
    label: "To the Moon: new class news (interest list)",
    category: "ignite",
    subject: (p) => p.subject,
    render: (p) => <IgniteInterestEmail {...p} />,
    sample: { subject: "A new To the Moon class just opened", paragraphs: ["Hi Alex,", "Spark runs December 12–13, 1–5 PM Central. Seats are limited."], classSlug: "spark", unsubscribeUrl: "https://seeds.honest.money/api/public/email/unsubscribe?t=sample" },
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

export async function renderTemplate<K extends TemplateName>(name: K, props: TemplateProps[K]) {
  const { render } = await import("@react-email/render");
  const def = TEMPLATES[name];
  const el = def.render(props);
  const [html, text] = await Promise.all([render(el), render(el, {
    plainText: true,
    htmlToTextOptions: { selectors: [{ selector: "img", format: "skip" }, { selector: "h1", options: { uppercase: false } }, { selector: "a", options: { hideLinkHrefIfSameAsText: true } }] },
  })]);
  return { subject: def.subject(props), html, text };
}

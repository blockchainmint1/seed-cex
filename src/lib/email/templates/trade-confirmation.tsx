import * as React from "react";
import { Cta, Details, Layout, Mono, Note, P, SITE, fmt, when } from "../components";

export type TradeLeg = { label: string; amount: number; symbol: string; txid: string | null };
export type TradeConfirmationProps = {
  name: string;
  tradeId: string;
  pair: string;
  side: "buy" | "sell";
  amount: number;
  baseSymbol: string;
  price: number;
  quoteSymbol: string;
  settledAt: string;
  timezone: string;
  legs: TradeLeg[];
};

export function TradeConfirmationEmail(p: TradeConfirmationProps) {
  const total = p.amount * p.price;
  const verb = p.side === "buy" ? "bought" : "sold";
  return (
    <Layout preview={`You ${verb} ${fmt(p.amount)} ${p.baseSymbol} at ${fmt(p.price)} ${p.quoteSymbol}. Both sides confirmed on-chain.`} eyebrow="Trade confirmation" title={`You ${verb} ${fmt(p.amount)} ${p.baseSymbol}.`} footer="transactional">
      <P>Your {p.pair} trade settled. Both sides confirmed on their networks, and the coins are in the receiving wallets.</P>
      <Details rows={[
        ["Side", p.side === "buy" ? "Buy" : "Sell"],
        ["Amount", `${fmt(p.amount)} ${p.baseSymbol}`],
        ["Price", `${fmt(p.price)} ${p.quoteSymbol}`],
        ["Total", `${fmt(total)} ${p.quoteSymbol}`],
        ["Settled", when(p.settledAt, p.timezone)],
        ["Trade", <Mono key="id">{p.tradeId.slice(0, 8)}</Mono>],
      ]} />
      {p.legs.length ? <Details rows={p.legs.map((l) => [l.label, <span key={l.label}>{fmt(l.amount)} {l.symbol}<br /><Mono>{l.txid ? `${l.txid.slice(0, 10)}…${l.txid.slice(-6)}` : "No network ID recorded"}</Mono></span>])} /> : null}
      <Cta href={`${SITE}/trades`}>View trade</Cta>
      <Note>On-chain transactions are final. If an amount above doesn't match what you expected, reply to this email or contact support@honest.money with the trade number.</Note>
    </Layout>
  );
}

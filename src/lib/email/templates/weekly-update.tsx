import * as React from "react";
import { Cta, Details, Layout, Note, P, SITE, Stat, fmt, usd } from "../components";

export type WeeklyUpdateProps = {
  name: string;
  weekLabel: string;
  exchangeTrades: number;
  p2pTrades: number;
  openOrders: number;
  volumeByPair: { pair: string; amount: number; baseSymbol: string; quoteTotal: number; quoteSymbol: string }[];
  p2pVolumeUsd: number;
  pocket: { linked: boolean; account?: number; mode?: string };
  attention: string[];
  unsubscribeUrl: string;
};

export function WeeklyUpdateEmail(p: WeeklyUpdateProps) {
  const quiet = p.exchangeTrades + p.p2pTrades === 0;
  return (
    <Layout preview={quiet ? `A quiet week on your Seeds account. ${p.openOrders} open order${p.openOrders === 1 ? "" : "s"}.` : `${p.exchangeTrades + p.p2pTrades} trades this week on Seeds.`} eyebrow={`Weekly account update · ${p.weekLabel}`} title={quiet ? "A quiet week." : "Your week on Seeds."} footer="weekly" unsubscribeUrl={p.unsubscribeUrl}>
      <Stat items={[
        { label: "Exchange trades", value: String(p.exchangeTrades) },
        { label: "P2P trades", value: String(p.p2pTrades) },
        { label: "Open orders", value: String(p.openOrders) },
      ]} />
      {p.volumeByPair.length ? <Details rows={p.volumeByPair.map((v) => [v.pair, `${fmt(v.amount)} ${v.baseSymbol} · ${fmt(v.quoteTotal, 2)} ${v.quoteSymbol}`])} /> : null}
      {p.p2pVolumeUsd > 0 ? <P>P2P volume this week: <b>{usd(p.p2pVolumeUsd)}</b>.</P> : null}
      <Details rows={[["Trading pocket", p.pocket.linked ? `Pocket #${p.pocket.account} · ${p.pocket.mode === "approve" ? "you approve every trade" : "instant trades"}` : "Not linked"]]} />
      {p.attention.length ? <Note tone="warn">Needs your attention: {p.attention.join(" ")}</Note> : <P muted>Nothing needs your attention right now.</P>}
      <Cta href={`${SITE}/trades`}>View your trades</Cta>
    </Layout>
  );
}

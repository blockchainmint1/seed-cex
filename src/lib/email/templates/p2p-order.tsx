import * as React from "react";
import { Cta, Details, Layout, Mono, Note, P, SITE, fmt, usd, when } from "../components";

export type P2pOrderProps = {
  name: string;
  role: "buyer" | "seller";
  tradeId: string;
  asset: string;
  cryptoAmount: number;
  fiatAmount: number;
  price: number;
  paymentMethod: string;
  counterparty: string;
  expiresAt: string;
  timezone: string;
};

export function P2pOrderEmail(p: P2pOrderProps) {
  const buyer = p.role === "buyer";
  return (
    <Layout
      preview={buyer ? `Pay ${usd(p.fiatAmount)} by ${p.paymentMethod} before ${when(p.expiresAt, p.timezone)}. The seller's ${p.asset} is reserved.` : `A buyer wants ${fmt(p.cryptoAmount)} ${p.asset} for ${usd(p.fiatAmount)}. Release only after the payment is in your account.`}
      eyebrow="P2P order confirmation"
      title={buyer ? `Your order for ${fmt(p.cryptoAmount)} ${p.asset} is open.` : `New order: ${fmt(p.cryptoAmount)} ${p.asset} for ${usd(p.fiatAmount)}.`}
      footer="transactional"
    >
      <P>{buyer
        ? `${p.counterparty}'s ${p.asset} is reserved in their trading pocket. Seeds doesn't hold it, so you pay the seller directly using the instructions in the trade room.`
        : `${fmt(p.cryptoAmount)} ${p.asset} is reserved in your trading pocket for ${p.counterparty}. Keep it there until the trade completes.`}</P>
      <Details rows={[
        [buyer ? "You receive" : "You send", `${fmt(p.cryptoAmount)} ${p.asset}`],
        [buyer ? "You pay" : "You receive", usd(p.fiatAmount)],
        ["Price", `${usd(p.price)} per ${p.asset}`],
        ["Payment method", p.paymentMethod],
        [buyer ? "Seller" : "Buyer", p.counterparty],
        ["Pay by", when(p.expiresAt, p.timezone)],
        ["Order", <Mono key="id">{p.tradeId.slice(0, 8)}</Mono>],
      ]} />
      <Cta href={`${SITE}/p2p/trade/${p.tradeId}`}>Open the trade room</Cta>
      <Note tone="warn">{buyer
        ? "Pay only through the trade room's instructions, and mark the trade as paid there. If anyone asks you to pay or talk somewhere else, stop and open a dispute."
        : "Release only once the money is in your account and can't be reversed. A screenshot isn't proof of payment. If something seems wrong, open a dispute instead of releasing."}</Note>
    </Layout>
  );
}

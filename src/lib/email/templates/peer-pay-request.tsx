import * as React from "react";
import { Cta, Details, Layout, Note, P, usd, when } from "../components";

export type PeerPayRequestProps = { registrantName: string; amount: number; payUrl: string; expiresAt: string };

export function PeerPayRequestEmail(p: PeerPayRequestProps) {
  return (
    <Layout
      preview={`${p.registrantName} asked you to pay their ${usd(p.amount)} Flight School seat. The link works until ${when(p.expiresAt)}.`}
      eyebrow="Peer Pay request"
      title={`${p.registrantName} asked you to pay their Flight School seat.`}
      footer="peer"
    >
      <P>{p.registrantName} reserved a seat in Flight School, the Seeds crypto trading class, and asked you to pay the deposit for them. If you pay, the seat is theirs. You don't get a seat or any access to their account.</P>
      <Details rows={[
        ["For", p.registrantName],
        ["Amount", usd(p.amount)],
        ["Pay with", "Crypto, through NectarPay"],
        ["Link works until", when(p.expiresAt)],
      ]} />
      <Cta href={p.payUrl}>Review and pay {usd(p.amount)}</Cta>
      <P muted>You'll sign in with your Honest.Money account first, so {p.registrantName} can see who paid. If you're new to Honest.Money, you can create a free account in the same step.</P>
      <Note tone="warn">Only pay if you know {p.registrantName} personally. Seeds will never ask you to pay anywhere other than this link. Any repayment between you two is your own arrangement; Seeds doesn't handle it.</Note>
    </Layout>
  );
}

import * as React from "react";
import { Cta, Details, Layout, P, SITE, usd, when } from "../components";

export type PeerPayPaidProps = { name: string; payerName: string; amount: number; paidAt: string; timezone: string };

export function PeerPayPaidEmail(p: PeerPayPaidProps) {
  return (
    <Layout
      preview={`${p.payerName} paid your ${usd(p.amount)} Flight School deposit. Your seat is confirmed.`}
      eyebrow="Flight School seat confirmed"
      title={`${p.payerName} paid for your seat.`}
      footer="transactional"
    >
      <P>Your Flight School seat is confirmed. {p.payerName} paid the deposit through your Peer Pay link, and the payment has been verified.</P>
      <Details rows={[
        ["Paid by", p.payerName],
        ["Amount", usd(p.amount)],
        ["Confirmed", when(p.paidAt, p.timezone)],
        ["Class", "November 30 – December 4, 2026 · 5:00–6:30 PM CST"],
      ]} />
      <Cta href={`${SITE}/flight-school`}>View your registration</Cta>
      <P muted>Any repayment between you and {p.payerName} is your own arrangement. Seeds doesn't handle it.</P>
    </Layout>
  );
}

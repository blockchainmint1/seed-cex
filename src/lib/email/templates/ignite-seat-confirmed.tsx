import * as React from "react";
import { Link } from "@react-email/components";
import { C, Cta, Details, Layout, Note, P, SITE, usd, when } from "../components";

export type IgniteSeatConfirmedProps = {
  name: string;
  amount: number;
  paidBy: string | null;
  confirmedAt: string;
  timezone: string;
  referralUrl: string | null;
};

export function IgniteSeatConfirmedEmail(p: IgniteSeatConfirmedProps) {
  return (
    <Layout
      preview="Your Ignite seat is reserved. Class starts November 30 at 5:00 PM CST."
      eyebrow="Ignite seat confirmed"
      title={`You're in, ${p.name}.`}
      footer="transactional"
    >
      <P>Thank you for reserving your place in Ignite. {p.paidBy ? `${p.paidBy} paid your deposit through Peer Pay, and the` : "Your"} payment has been verified, so your seat is reserved.</P>
      <Details rows={[
        ["Class", "Ignite live crypto trading class"],
        ["Dates", "November 30 – December 4, 2026"],
        ["Time", "Daily 5:00–6:30 PM CST"],
        ["Deposit", usd(p.amount)],
        ...(p.paidBy ? [["Paid by", p.paidBy] as [string, string]] : []),
        ["Confirmed", when(p.confirmedAt, p.timezone)],
      ]} />
      <Note>We'll email you the connection details for the live sessions shortly, before the first class. Sessions are recorded, so you can catch up if you miss one.</Note>
      {p.referralUrl && (
        <P>Know another Honest.Money miner who should be in the room? Share your personal link:{" "}
          <Link href={p.referralUrl} style={{ color: C.greenDeep, fontWeight: 600, wordBreak: "break-all" }}>{p.referralUrl}</Link>
        </P>
      )}
      <Cta href={`${SITE}/register/confirmed`}>View your confirmation</Cta>
      {p.paidBy && <P muted>Any repayment between you and {p.paidBy} is your own arrangement. Seeds doesn't handle it.</P>}
      <P muted>This deposit reserves a class seat. It doesn't open or fund a Seeds exchange account.</P>
    </Layout>
  );
}

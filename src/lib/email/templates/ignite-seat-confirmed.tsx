import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import { C, Cta, Details, Layout, Note, P, SITE, usd, when } from "../components";

export type IgniteSeatConfirmedProps = {
  name: string;
  amount: number;
  paidBy: string | null;
  paidWith: string | null;
  confirmedAt: string;
  timezone: string;
  referralUrl: string | null;
  className: string;
  classSlug: string | null;
  dates: string;
  time: string;
  feeUsd: number;
  minerDiscountUsd: number;
  depositUsd: number;
};

export function IgniteSeatConfirmedEmail(p: IgniteSeatConfirmedProps) {
  return (
    <Layout
      preview={`Your Flight School seat in ${p.className} is reserved. ${p.dates}.`}
      eyebrow="Flight School seat confirmed"
      title={`You're in, ${p.name}.`}
      footer="transactional"
    >
      <P>Thank you for reserving your place in Flight School. {p.paidBy ? `${p.paidBy} paid for your seat through Peer Pay, and the` : "Your"} payment has been confirmed, so your seat is reserved.</P>
      <Details rows={[
        ["Class", `Flight School: ${p.className}`],
        ["Dates", p.dates],
        ["Time", p.time],
        ...(p.feeUsd > 0 ? [["Class fee", p.minerDiscountUsd >= p.feeUsd ? "Free for HME miners" : usd(p.feeUsd - p.minerDiscountUsd)] as [string, string]] : []),
        ["Trade deposit", usd(p.depositUsd)],
        ["Total paid", usd(p.amount)],
        ...(p.paidWith ? [["Paid with", p.paidWith] as [string, string]] : []),
        ...(p.paidBy ? [["Paid by", p.paidBy] as [string, string]] : []),
        ["Confirmed", when(p.confirmedAt, p.timezone)],
      ]} />
      <Note>We'll email you the connection details for the live sessions before the first class. Your trade deposit comes back to you during class to trade with. Sessions are recorded, so you can watch them any time.</Note>
      {p.referralUrl && (
        <>
          <P>Know another Honest.Money miner who should be in the room? Share your personal invite link:</P>
          <Section style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 20px", margin: "0 0 24px", backgroundColor: "#FFFFFF" }}>
            <Text style={{ margin: "0 0 4px", fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.stone }}>Your invite link</Text>
            <Link href={p.referralUrl} style={{ color: C.greenDeep, fontSize: 16, lineHeight: "22px", fontWeight: 600, overflowWrap: "break-word" }}>{breakable(p.referralUrl.replace(/^https?:\/\//, ""))}</Link>
          </Section>
        </>
      )}
      <Cta href={`${SITE}/flight-school/confirmed`}>View your confirmation</Cta>
      {p.paidBy && <P muted>Any repayment between you and {p.paidBy} is your own arrangement. Seeds doesn't handle it.</P>}
      <P muted>This payment reserves a class seat. It doesn't open or fund a Seeds exchange account.</P>
    </Layout>
  );
}

/** Lets a narrow phone wrap the link after a "/" instead of mid-name. */
function breakable(label: string) {
  const parts = label.split("/");
  return parts.map((part, i) => (
    <React.Fragment key={i}>{i > 0 ? "/" : ""}{i > 0 && i === parts.length - 1 ? <wbr /> : null}{part}</React.Fragment>
  ));
}

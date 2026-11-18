import * as React from "react";
import { Cta, Details, Layout, Note, P, SITE, usd } from "../components";

export type IgniteReminderProps = { name: string; amount: number; dates: string; time: string; seatsLeft: number };

export function IgniteReminderEmail(p: IgniteReminderProps) {
  return (
    <Layout
      preview={`Your Ignite seat isn't reserved yet. Pay the ${usd(p.amount)} deposit to hold it. ${p.seatsLeft} seats left.`}
      eyebrow="Ignite class"
      title="Finish reserving your Ignite seat."
      footer="transactional"
    >
      <P>Hi {p.name}, you started registering for Ignite, the Seeds crypto trading class, but the deposit hasn't come through yet, so your seat isn't held.</P>
      <Details rows={[
        ["Class", p.dates],
        ["Time", p.time],
        ["Deposit", usd(p.amount)],
        ["Seats left", String(p.seatsLeft)],
      ]} />
      <Cta href={`${SITE}/register`}>Finish my registration</Cta>
      <P muted>Sign in with your Honest.Money account. Your details are saved, so you only need to pay. A fresh payment link opens each time, so an older link that ran out is fine to ignore.</P>
      <Note>If you already paid in the last few minutes, NectarPay may still be confirming it. Open the link above and Seeds will check again.</Note>
    </Layout>
  );
}
